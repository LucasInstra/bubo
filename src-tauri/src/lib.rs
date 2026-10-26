mod config;
mod llm;
mod log;
mod paths;
mod prompt;
mod store;
mod window_state;

use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

struct AppState {
    db: Mutex<rusqlite::Connection>,
    shortcut: Mutex<Option<Shortcut>>,
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
    compact_origin: Mutex<Option<(i32, i32)>>,
    compact: AtomicBool,
    popup: AtomicBool,
    popup_origin: Mutex<Option<(i32, i32)>>,
    popup_stage: Mutex<PopupStage>,
    last_window_save: Mutex<Option<Instant>>,
}

fn http_client(settings: &config::Settings) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .read_timeout(Duration::from_secs(60));

    if !settings.proxy_url.trim().is_empty() {
        let proxy = reqwest::Proxy::all(settings.proxy_url.trim())
            .map_err(|error| format!("Invalid proxy URL: {error}"))?;
        builder = builder.proxy(proxy);
    }

    if !settings.ca_cert_path.trim().is_empty() {
        let pem = std::fs::read(settings.ca_cert_path.trim())
            .map_err(|error| format!("Could not read the CA certificate: {error}"))?;
        let certificate = reqwest::Certificate::from_pem(&pem)
            .map_err(|error| format!("Invalid CA certificate: {error}"))?;
        builder = builder.add_root_certificate(certificate);
    }

    builder.build().map_err(|error| error.to_string())
}

fn install_hotkey(
    app: &AppHandle,
    slot: &Mutex<Option<Shortcut>>,
    hotkey: &str,
) -> Result<(), String> {
    let parsed: Shortcut = hotkey
        .trim()
        .parse()
        .map_err(|_| format!("Atalho inválido: {hotkey}. Tente algo como Ctrl+Alt+B."))?;

    let previous = slot.lock().ok().and_then(|current| *current);

    let _ = app.global_shortcut().unregister_all();
    match app.global_shortcut().register(parsed) {
        Ok(()) => {
            if let Ok(mut current) = slot.lock() {
                *current = Some(parsed);
            }
            Ok(())
        }
        Err(error) => {
            // Never leave the app without a working shortcut.
            if let Some(previous) = previous {
                let _ = app.global_shortcut().register(previous);
            }
            Err(format!("Não foi possível registrar {hotkey}: {error}"))
        }
    }
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Result<config::Settings, String> {
    config::load_settings(&app)
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: config::Settings,
) -> Result<(), String> {
    let current = config::load_settings(&app).unwrap_or_default();
    if current.hotkey.trim() != settings.hotkey.trim() {
        install_hotkey(&app, &state.shortcut, &settings.hotkey)?;
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(settings.pinned);
    }

    config::save_settings_file(&app, &settings)?;

    if settings.ignore_capitalization {
        if let Ok(db) = state.db.lock() {
            let _ = store::purge_case_only(&db);
        }
    }

    Ok(())
}

#[tauri::command]
fn set_pinned(window: tauri::Window, pinned: bool) -> Result<(), String> {
    window.set_always_on_top(pinned).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_compact(
    window: tauri::Window,
    state: State<'_, AppState>,
    compact: bool,
) -> Result<(), String> {
    let was_compact = state.compact.swap(compact, Ordering::Relaxed);

    // The frontend re-applies the saved mode on every startup. When full mode
    // was already active, keep the geometry restored from window.json instead
    // of resetting it to the default size.
    if !compact && !was_compact {
        return Ok(());
    }

    let origin = window
        .outer_position()
        .ok()
        .map(|position| (position.x, position.y));

    if compact {
        if let (Some(position), Ok(mut slot)) = (origin, state.compact_origin.lock()) {
            if slot.is_none() {
                *slot = Some(position);
            }
        }
    }

    let restore = if compact {
        None
    } else {
        state
            .compact_origin
            .lock()
            .ok()
            .and_then(|mut slot| slot.take())
    };

    let (width, height) = if compact {
        (400.0, 280.0)
    } else {
        (420.0, 640.0)
    };
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|error| error.to_string())?;

    // Keep the window inside the current monitor and give the compact card a
    // small lift so it does not sit exactly where the tall window started.
    if let Ok(Some(monitor)) = window.current_monitor() {
        let area = monitor.work_area();
        let scale = window.scale_factor().unwrap_or(1.0);
        let target_width = (width * scale).round() as i32;
        let target_height = (height * scale).round() as i32;
        if let Some((mut x, mut y)) = restore.or(origin) {
            let max_x = area.position.x + area.size.width as i32 - target_width;
            let max_y = area.position.y + area.size.height as i32 - target_height;
            x = x.min(max_x).max(area.position.x);
            y = y.min(max_y).max(area.position.y);
            if compact {
                y = (y - 14).max(area.position.y);
            }
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        }
    } else if let Some((x, y)) = restore {
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }

    Ok(())
}

const POPUP_WIDTH: f64 = 320.0;
const POPUP_HEIGHT: f64 = 360.0;
const FACE_DIAMETER: f64 = 132.0;

/// Shape the popup window natively so the collapsed state only exposes the
/// face. The window stays 320x360 the whole time; resizing it while the
/// webview catches up is what made the face appear to jump.
#[cfg(windows)]
fn set_popup_region(window: &tauri::WebviewWindow, full: bool) -> Result<(), String> {
    use windows::Win32::Graphics::Gdi::{
        CreateEllipticRgn, CreateRectRgn, DeleteObject, SetWindowRgn,
    };

    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let width = (POPUP_WIDTH * scale).round() as i32;
    let height = (POPUP_HEIGHT * scale).round() as i32;
    let region = unsafe {
        if full {
            CreateRectRgn(0, 0, width, height)
        } else {
            let radius = (FACE_DIAMETER * scale / 2.0).round() as i32;
            let cx = (POPUP_WIDTH * scale / 2.0).round() as i32;
            let cy = (POPUP_HEIGHT * scale / 2.0).round() as i32;
            CreateEllipticRgn(cx - radius, cy - radius, cx + radius + 1, cy + radius + 1)
        }
    };
    if region.is_invalid() {
        return Err("popup region creation failed".to_string());
    }

    let applied = unsafe { SetWindowRgn(hwnd, Some(region), true) };
    if applied == 0 {
        unsafe {
            let _ = DeleteObject(region.into());
        }
        return Err("popup region apply failed".to_string());
    }
    Ok(())
}

#[cfg(not(windows))]
fn set_popup_region(_window: &tauri::WebviewWindow, _full: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn clear_popup_region(window: &tauri::WebviewWindow) -> Result<(), String> {
    use windows::Win32::Graphics::Gdi::SetWindowRgn;

    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    unsafe {
        SetWindowRgn(hwnd, None, true);
    }
    Ok(())
}

#[cfg(not(windows))]
fn clear_popup_region(_window: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

fn clamp_to_monitor(
    window: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> (i32, i32) {
    if let Ok(Some(monitor)) = window.current_monitor() {
        let area = monitor.work_area();
        let max_x = area.position.x + area.size.width as i32 - width;
        let max_y = area.position.y + area.size.height as i32 - height;
        (
            x.min(max_x).max(area.position.x),
            y.min(max_y).max(area.position.y),
        )
    } else {
        (x, y)
    }
}

#[tauri::command]
fn set_popup(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    popup: bool,
) -> Result<(), String> {
    if state.popup.load(Ordering::Relaxed) == popup {
        return Ok(());
    }

    let scale = window.scale_factor().unwrap_or(1.0);

    if popup {
        let origin = window
            .outer_position()
            .ok()
            .map(|position| (position.x, position.y));
        if let Ok(mut slot) = state.popup_origin.lock() {
            *slot = origin;
        }
        // Popup owns the geometry; compact must not restore its old origin
        // when the window comes back.
        state.compact.store(false, Ordering::Relaxed);
        if let Ok(mut slot) = state.compact_origin.lock() {
            *slot = None;
        }
        state.popup.store(true, Ordering::Relaxed);
        if let Ok(mut slot) = state.popup_stage.lock() {
            *slot = PopupStage::Face;
        }

        window
            .set_resizable(false)
            .map_err(|error| error.to_string())?;
        window
            .set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(
                POPUP_WIDTH,
                POPUP_HEIGHT,
            ))))
            .map_err(|error| error.to_string())?;
        let physical_width = (POPUP_WIDTH * scale).round() as i32;
        let physical_height = (POPUP_HEIGHT * scale).round() as i32;
        let (x, y) = if let Some(saved) = window_state::load_popup(window.app_handle()) {
            clamp_to_monitor(&window, saved.x, saved.y, physical_width, physical_height)
        } else {
            let (origin_x, origin_y) = origin.unwrap_or((0, 0));
            let margin = (24.0 * scale).round() as i32;
            let outer = window.outer_size().map_err(|error| error.to_string())?;
            let x = origin_x + outer.width as i32 - physical_width - margin;
            let y = origin_y + outer.height as i32 - physical_height - margin;
            clamp_to_monitor(&window, x, y, physical_width, physical_height)
        };
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                POPUP_WIDTH,
                POPUP_HEIGHT,
            )))
            .map_err(|error| error.to_string())?;
        window
            .set_position(tauri::PhysicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
        set_popup_region(&window, false)?;
    } else {
        state.popup.store(false, Ordering::Relaxed);
        if let Ok(mut slot) = state.popup_stage.lock() {
            *slot = PopupStage::Face;
        }
        clear_popup_region(&window)?;
        window
            .set_resizable(true)
            .map_err(|error| error.to_string())?;
        window
            .set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(
                360.0, 260.0,
            ))))
            .map_err(|error| error.to_string())?;
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize::new(420.0, 640.0)))
            .map_err(|error| error.to_string())?;
        let origin = state
            .popup_origin
            .lock()
            .ok()
            .and_then(|mut slot| slot.take());
        if let Some((x, y)) = origin {
            let (x, y) = clamp_to_monitor(&window, x, y, 420, 640);
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        } else {
            place_bottom_right(&window);
        }
    }

    Ok(())
}

#[derive(Clone, Copy, PartialEq)]
enum PopupStage {
    Face,
    Input,
    Reply,
}

#[tauri::command]
fn set_popup_stage(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    stage: String,
) -> Result<(), String> {
    if !state.popup.load(Ordering::Relaxed) {
        return Ok(());
    }

    let next = match stage.as_str() {
        "input" => PopupStage::Input,
        "reply" => PopupStage::Reply,
        _ => PopupStage::Face,
    };
    let previous = *state
        .popup_stage
        .lock()
        .map_err(|_| "popup stage lock".to_string())?;
    if previous == next {
        return Ok(());
    }

    if let Ok(mut slot) = state.popup_stage.lock() {
        *slot = next;
    }
    set_popup_region(&window, next != PopupStage::Face)
}

fn is_local_endpoint(base_url: &str) -> bool {
    let url = base_url.trim().to_lowercase();
    ["://localhost", "://127.0.0.1", "://[::1]", "://0.0.0.0"]
        .iter()
        .any(|host| url.contains(host))
}

#[tauri::command]
fn has_api_key(app: AppHandle) -> Result<bool, String> {
    if config::load_api_key()?.is_some() {
        return Ok(true);
    }
    Ok(is_local_endpoint(&config::load_settings(&app)?.base_url))
}

#[tauri::command]
fn save_api_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("The key is empty.".to_string());
    }
    config::save_api_key(key)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionTest {
    message: String,
    models: Vec<String>,
}

/// Extracts model ids from an OpenAI-compatible `/models` response body.
///
/// Accepts `{"data": [{"id": "..."}]}` (OpenAI/Groq/OpenRouter/Ollama) and, as
/// a fallback, a top-level `{"models": ["..."]}` or `{"models": [{"id": "..."}]}`.
/// Invalid or unexpected bodies yield an empty list; ids are deduped in order.
fn parse_model_ids(body: &str) -> Vec<String> {
    fn push(models: &mut Vec<String>, id: &str) {
        let id = id.trim();
        if !id.is_empty() && !models.iter().any(|existing| existing == id) {
            models.push(id.to_string());
        }
    }

    fn collect(entries: &[serde_json::Value], models: &mut Vec<String>) {
        for entry in entries {
            if let Some(id) = entry.as_str() {
                push(models, id);
            } else if let Some(id) = entry.get("id").and_then(|id| id.as_str()) {
                push(models, id);
            }
        }
    }

    let Ok(value) = serde_json::from_str::<serde_json::Value>(body) else {
        return Vec::new();
    };

    let mut models = Vec::new();
    if let Some(data) = value.get("data").and_then(|data| data.as_array()) {
        collect(data, &mut models);
    }
    if models.is_empty() {
        if let Some(entries) = value.get("models").and_then(|models| models.as_array()) {
            collect(entries, &mut models);
        }
    }

    models
}

#[tauri::command]
async fn test_connection(
    settings: config::Settings,
    api_key: Option<String>,
) -> Result<ConnectionTest, String> {
    let base = settings.base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Adicione uma URL base primeiro.".to_string());
    }

    let key = api_key
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty())
        .or_else(|| config::load_api_key().ok().flatten());

    let client = http_client(&settings)?;

    let mut request = client
        .get(format!("{base}/models"))
        .timeout(Duration::from_secs(12));
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("Não foi possível alcançar o endpoint: {error}"))?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if !status.is_success() {
        let detail: String = body.chars().take(200).collect();
        return Err(format!("{status}: {detail}"));
    }

    let models = parse_model_ids(&body);
    let message = if models.is_empty() {
        "Conectado".to_string()
    } else {
        format!("Conectado, {} modelo(s) disponível(is)", models.len())
    };

    Ok(ConnectionTest { message, models })
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| e.to_string())
    } else {
        autolaunch.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn cancel_reply(state: State<'_, AppState>, request_id: String) -> Result<(), String> {
    if let Ok(cancels) = state.cancels.lock() {
        if let Some(flag) = cancels.get(&request_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

#[tauri::command]
fn delete_message(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::delete_message(&db, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn lesson_progress(state: State<'_, AppState>) -> Result<Vec<store::LessonProgress>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::lesson_progress(&db).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_lesson_progress(
    state: State<'_, AppState>,
    lesson_id: String,
    step: i64,
    completed: bool,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::save_lesson_progress(&db, &lesson_id, step, completed).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_lesson_fix(
    state: State<'_, AppState>,
    wrong: String,
    right: String,
    note: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::save_manual_fix(&db, &wrong, &right, &note).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_assistant_message(state: State<'_, AppState>, content: String) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::insert(&db, "assistant", &content, None).map_err(|e| e.to_string())
}

#[tauri::command]
async fn chat(
    app: AppHandle,
    state: State<'_, AppState>,
    request_id: String,
    messages: Vec<prompt::ChatMsg>,
) -> Result<String, String> {
    let settings = config::load_settings(&app)?;
    let client = http_client(&settings)?;
    let api_key = config::load_api_key()?.unwrap_or_default();

    let user_row = messages
        .iter()
        .rev()
        .find(|message| message.role == "user")
        .and_then(|last| {
            state
                .db
                .lock()
                .ok()
                .and_then(|db| store::insert(&db, "user", &last.content, None).ok())
        });

    log::write(
        &app,
        "info",
        &format!(
            "reply start model={} messages={}",
            settings.model,
            messages.len()
        ),
    );

    let reply_body = prompt::reply_body(&settings, &messages);
    let cancel = Arc::new(AtomicBool::new(false));
    if let Ok(mut cancels) = state.cancels.lock() {
        cancels.insert(request_id.clone(), cancel.clone());
    }

    let outcome = llm::stream_reply(
        app.clone(),
        client.clone(),
        &settings,
        &api_key,
        reply_body,
        &request_id,
        cancel,
    )
    .await;

    if let Ok(mut cancels) = state.cancels.lock() {
        cancels.remove(&request_id);
    }

    let full = match outcome {
        Ok(reply) => {
            if reply.cancelled && reply.text.trim().is_empty() {
                if let (Ok(db), Some(id)) = (state.db.lock(), user_row) {
                    let _ = store::delete(&db, id);
                }
                log::write(&app, "info", "reply cancelled before any text");
                return Err("cancelled".to_string());
            }
            reply
        }
        Err(error) => {
            // A failed turn must not leave a dangling user message in history.
            if let (Ok(db), Some(id)) = (state.db.lock(), user_row) {
                let _ = store::delete(&db, id);
            }
            log::write(&app, "error", &format!("reply failed: {error}"));
            return Err(error);
        }
    };

    let text = full.text;

    // Persist the reply before the correction pass so a quit during corrections
    // never leaves a user message without an answer.
    let reply_row = state
        .db
        .lock()
        .ok()
        .and_then(|db| store::insert(&db, "assistant", &text, None).ok());

    let _ = app.emit(
        "bubo-saved",
        json!({ "requestId": request_id, "userId": user_row, "assistantId": reply_row }),
    );
    let _ = app.emit("bubo-reply-done", json!({ "requestId": request_id }));

    if full.cancelled {
        log::write(&app, "info", "reply cancelled, skipping corrections");
        return Ok(text);
    }

    let corrections_body = prompt::corrections_body(&settings, &messages);
    let mut fixes = match llm::complete(&app, &client, &settings, &api_key, corrections_body).await
    {
        Ok(raw) => llm::parse_fixes(&raw),
        Err(error) => {
            log::write(&app, "warn", &format!("corrections failed: {error}"));
            Vec::new()
        }
    };

    if settings.ignore_capitalization {
        fixes.retain(|fix| !llm::only_case_differs(&fix.wrong, &fix.right));
    }

    if !fixes.is_empty() {
        let _ = app.emit("bubo-fixes", llm::fixes_event_payload(&request_id, &fixes));
    }

    if let Ok(db) = state.db.lock() {
        let _ = store::save_fixes_for_message(&db, &fixes, user_row);
    }

    let fixes_json = if fixes.is_empty() {
        None
    } else {
        serde_json::to_string(&fixes).ok()
    };

    if let (Ok(db), Some(id)) = (state.db.lock(), reply_row) {
        let _ = store::set_message_fixes(&db, id, fixes_json.as_deref());
    }

    log::write(
        &app,
        "info",
        &format!("reply done chars={} fixes={}", text.len(), fixes.len()),
    );

    Ok(text)
}

#[tauri::command]
async fn explain_fix(
    app: AppHandle,
    wrong: String,
    right: String,
    note: String,
) -> Result<String, String> {
    let settings = config::load_settings(&app)?;
    let client = http_client(&settings)?;
    let api_key = config::load_api_key()?.unwrap_or_default();

    let body = prompt::explain_body(&settings, &wrong, &right, &note);
    let text = llm::complete(&app, &client, &settings, &api_key, body).await?;
    let text = llm::tidy(&text).trim().to_string();

    if text.is_empty() {
        return Err("The model returned an empty explanation. Try again.".to_string());
    }

    log::write(
        &app,
        "info",
        &format!("explanation done chars={}", text.len()),
    );

    Ok(text)
}

#[tauri::command]
fn history(state: State<'_, AppState>) -> Result<Vec<store::StoredMessage>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let session = store::current_session(&db).map_err(|e| e.to_string())?;
    store::messages_for_session(&db, session, 200).map_err(|e| e.to_string())
}

#[tauri::command]
fn current_session(state: State<'_, AppState>) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::current_session(&db).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_sessions(state: State<'_, AppState>) -> Result<Vec<store::SessionSummary>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::list_sessions(&db).map_err(|e| e.to_string())
}

#[tauri::command]
fn new_session(state: State<'_, AppState>) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::create_session(&db).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_session(state: State<'_, AppState>, id: i64) -> Result<Vec<store::StoredMessage>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::open_session(&db, id, 200).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_session(state: State<'_, AppState>, id: i64) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::delete_session(&db, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_session(state: State<'_, AppState>, id: i64, title: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::rename_session(&db, id, &title).map_err(|e| e.to_string())
}

#[tauri::command]
fn archive_session(state: State<'_, AppState>, id: i64, archived: bool) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::archive_session(&db, id, archived).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::clear(&db).map_err(|e| e.to_string())
}

#[tauri::command]
fn backup_data(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::backup_to(&db, std::path::Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn restore_data(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let source = std::path::Path::new(&path);
    if !store::is_backup(source).map_err(|e| e.to_string())? {
        return Err("Esse arquivo não é um backup do bubo.".to_string());
    }
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    store::restore_from(&mut db, source).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let dir = paths::data_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    open_folder(&dir).map_err(|error| error.to_string())
}

const FEEDBACK_URL: &str = "https://github.com/LucasInstra/bubo/issues/new";

#[tauri::command]
fn open_feedback() -> Result<(), String> {
    open_url(FEEDBACK_URL)
}

#[tauri::command]
fn open_provider_site(provider: String) -> Result<(), String> {
    let url = match provider.as_str() {
        "groq" => "https://console.groq.com/keys",
        "openai" => "https://platform.openai.com/api-keys",
        "openrouter" => "https://openrouter.ai/keys",
        "ollama" => "https://ollama.com/download",
        _ => return Err("Provedor desconhecido".to_string()),
    };
    open_url(url)
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

fn open_folder(path: &std::path::Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(path).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(path).spawn()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(path).spawn()?;
    }
    Ok(())
}

#[tauri::command]
fn diagnostics(app: AppHandle) -> Result<String, String> {
    let data_dir = paths::data_dir(&app)?;
    let settings = config::load_settings(&app).unwrap_or_default();
    let log_path = data_dir.join("bubo.log");
    let log = std::fs::read_to_string(&log_path).unwrap_or_default();
    let tail = log
        .lines()
        .rev()
        .take(80)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");

    Ok(format!(
        "bubo {version}\nOS: {os} {arch}\ndata: {data}\nbaseUrl: {base}\nmodel: {model}\nlevel: {level}\nreply: {reply}\nfocus: {focus}\nchallenge: {challenge}\n\nlog tail:\n{tail}",
        version = app.package_info().version,
        os = std::env::consts::OS,
        arch = std::env::consts::ARCH,
        data = data_dir.display(),
        base = settings.base_url,
        model = settings.model,
        level = settings.level,
        reply = settings.reply_language,
        focus = settings.study_focus,
        challenge = settings.translation_challenge,
        tail = tail,
    ))
}

#[tauri::command]
fn drill_stats(state: State<'_, AppState>) -> Result<store::DrillStats, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::drill_stats(&db).map_err(|e| e.to_string())
}

#[tauri::command]
fn progress_stats(state: State<'_, AppState>) -> Result<store::ProgressStats, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::progress_stats(&db).map_err(|e| e.to_string())
}

#[tauri::command]
fn drill_skip_due(state: State<'_, AppState>) -> Result<usize, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::skip_due(&db).map_err(|e| e.to_string())
}

#[tauri::command]
fn drill_reset(state: State<'_, AppState>) -> Result<usize, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::reset_fixes(&db).map_err(|e| e.to_string())
}

#[tauri::command]
fn drill_next(
    state: State<'_, AppState>,
    include_future: bool,
    exclude_id: Option<i64>,
) -> Result<Option<store::DrillItem>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::next_drill(&db, include_future, exclude_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn drill_review(
    state: State<'_, AppState>,
    id: i64,
    correct: bool,
) -> Result<Option<store::DrillItem>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::review_drill(&db, id, correct).map_err(|e| e.to_string())
}

#[tauri::command]
fn drill_override(state: State<'_, AppState>, id: i64) -> Result<Option<store::DrillItem>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::override_review(&db, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn drill_focus(
    state: State<'_, AppState>,
    wrong: String,
    right: String,
) -> Result<Option<store::DrillItem>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::focus_drill(&db, &wrong, &right).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_fix(
    state: State<'_, AppState>,
    message_id: i64,
    wrong: String,
    right: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::delete_fix(&db, message_id, &wrong, &right).map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn toggle(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);

    if visible && focused {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn place_bottom_right(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(
        (420.0 * scale) as u32,
        (640.0 * scale) as u32,
    ));
    let margin = (16.0 * scale) as i32;

    let x = area.position.x + area.size.width as i32 - size.width as i32 - margin;
    let y = area.position.y + area.size.height as i32 - size.height as i32 - margin;

    let _ = window.set_position(tauri::PhysicalPosition::new(
        x.max(area.position.x),
        y.max(area.position.y),
    ));
}

/// Persists the full-mode geometry. Compacting never overwrites it, and move or
/// resize events are throttled to avoid a write per pixel while dragging.
fn save_window_state(app: &AppHandle, force: bool) {
    let state = app.state::<AppState>();
    if state.compact.load(Ordering::Relaxed) {
        return;
    }

    if !force {
        let Ok(mut last) = state.last_window_save.lock() else {
            return;
        };
        if let Some(at) = *last {
            if at.elapsed() < Duration::from_millis(400) {
                return;
            }
        }
        *last = Some(Instant::now());
    }

    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    if state.popup.load(Ordering::Relaxed) {
        if let Ok(position) = window.outer_position() {
            window_state::save_popup(app, position);
        }
        return;
    }

    if let Some(captured) = window_state::capture(&window) {
        window_state::save(app, captured);
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(
            tauri_plugin_updater::Builder::new()
                // The default comparator only accepts a greater version, which would
                // hide fix builds of the running version. Accept the same version
                // too and let the build number decide in the frontend.
                .default_version_comparator(|current, release| release.version >= current)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            paths::migrate_legacy(app.handle())?;
            let data_dir = paths::data_dir(app.handle())?;
            std::fs::create_dir_all(&data_dir)?;
            let connection = store::open(data_dir.join("bubo.db"))?;
            let settings = config::load_settings(app.handle()).unwrap_or_default();

            app.manage(AppState {
                db: Mutex::new(connection),
                shortcut: Mutex::new(None),
                cancels: Mutex::new(HashMap::new()),
                compact_origin: Mutex::new(None),
                compact: AtomicBool::new(settings.compact),
                popup: AtomicBool::new(settings.popup),
                popup_origin: Mutex::new(None),
                popup_stage: Mutex::new(PopupStage::Face),
                last_window_save: Mutex::new(None),
            });

            if settings.ignore_capitalization {
                if let Ok(db) = app.state::<AppState>().db.lock() {
                    let _ = store::purge_case_only(&db);
                }
            }

            if let Some(window) = app.get_webview_window("main") {
                place_bottom_right(&window);
                // Compact mode owns its own size and origin, so only replay the
                // saved geometry when the app starts in full mode.
                if settings.popup {
                    let _ = window.set_resizable(false);
                    let _ = window.set_min_size(Some(tauri::Size::Logical(
                        tauri::LogicalSize::new(POPUP_WIDTH, POPUP_HEIGHT),
                    )));
                    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                        POPUP_WIDTH,
                        POPUP_HEIGHT,
                    )));
                    let scale = window.scale_factor().unwrap_or(1.0);
                    let physical_width = (POPUP_WIDTH * scale).round() as i32;
                    let physical_height = (POPUP_HEIGHT * scale).round() as i32;
                    if let Some(saved) = window_state::load_popup(app.handle()) {
                        let (x, y) = clamp_to_monitor(
                            &window,
                            saved.x,
                            saved.y,
                            physical_width,
                            physical_height,
                        );
                        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                    } else {
                        place_bottom_right(&window);
                    }
                    let _ = set_popup_region(&window, false);
                } else if !settings.compact {
                    let _ = window.set_resizable(true);
                    window_state::restore(&window);
                }
                let _ = window.set_always_on_top(settings.pinned);

                if settings.start_hidden && std::env::args().any(|arg| arg == "--hidden") {
                    let _ = window.hide();
                }

                let handle = app.handle().clone();
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::Resized(_) => {
                        save_window_state(&handle, false);
                        let state = handle.state::<AppState>();
                        if state.popup.load(Ordering::Relaxed) {
                            let stage = state
                                .popup_stage
                                .lock()
                                .map(|slot| *slot)
                                .unwrap_or(PopupStage::Face);
                            if let Some(window) = handle.get_webview_window("main") {
                                let _ = set_popup_region(&window, stage != PopupStage::Face);
                            }
                        }
                    }
                    tauri::WindowEvent::ScaleFactorChanged { .. } => {
                        save_window_state(&handle, false);
                        let state = handle.state::<AppState>();
                        if state.popup.load(Ordering::Relaxed) {
                            let stage = state
                                .popup_stage
                                .lock()
                                .map(|slot| *slot)
                                .unwrap_or(PopupStage::Face);
                            if let Some(window) = handle.get_webview_window("main") {
                                let _ = set_popup_region(&window, stage != PopupStage::Face);
                            }
                        }
                    }
                    tauri::WindowEvent::Moved(_) => {
                        save_window_state(&handle, false);
                    }
                    tauri::WindowEvent::Focused(false) => {
                        let _ = handle.emit("bubo-blur", ());
                    }
                    tauri::WindowEvent::CloseRequested { .. } => {
                        save_window_state(&handle, true);
                    }
                    _ => {}
                });
            }

            if let Err(error) = install_hotkey(
                app.handle(),
                &app.state::<AppState>().shortcut,
                &settings.hotkey,
            ) {
                // A bad or taken shortcut must not stop the app from starting.
                log::write(app.handle(), "error", &error);
            }

            let show_item = MenuItem::with_id(app, "show", "Show bubo", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let mut tray = TrayIconBuilder::with_id("bubo-tray")
                .tooltip("bubo")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }

            tray.build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            has_api_key,
            save_api_key,
            test_connection,
            set_autostart,
            set_pinned,
            set_compact,
            set_popup,
            set_popup_stage,
            cancel_reply,
            delete_message,
            lesson_progress,
            save_lesson_progress,
            save_lesson_fix,
            save_assistant_message,
            chat,
            explain_fix,
            history,
            current_session,
            list_sessions,
            new_session,
            open_session,
            delete_session,
            rename_session,
            archive_session,
            clear_history,
            backup_data,
            restore_data,
            open_data_folder,
            open_feedback,
            open_provider_site,
            diagnostics,
            drill_stats,
            progress_stats,
            drill_next,
            drill_review,
            drill_override,
            drill_focus,
            delete_fix,
            drill_skip_due,
            drill_reset,
            hide_window,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running bubo");
}

#[cfg(test)]
mod connection_tests {
    use super::parse_model_ids;

    #[test]
    fn feedback_url_points_at_the_issue_page() {
        assert!(super::FEEDBACK_URL.starts_with("https://github.com/LucasInstra/bubo/"));
    }

    #[test]
    fn parses_data_ids_in_order_and_dedupes() {
        let body = r#"{"data":[{"id":"b"},{"id":"a"},{"id":"a"}]}"#;
        assert_eq!(parse_model_ids(body), vec!["b", "a"]);
    }

    #[test]
    fn falls_back_to_top_level_models_array() {
        let body = r#"{"models":["x",{"id":"y"}]}"#;
        assert_eq!(parse_model_ids(body), vec!["x", "y"]);
    }

    #[test]
    fn invalid_or_unexpected_bodies_yield_empty() {
        assert!(parse_model_ids("not json").is_empty());
        assert!(parse_model_ids("{}").is_empty());
        assert!(parse_model_ids(r#"{"data":"nope"}"#).is_empty());
        assert!(parse_model_ids(r#"{"data":[{"name":"x"}]}"#).is_empty());
    }

    #[test]
    fn local_endpoints_count_as_configured_without_a_key() {
        assert!(super::is_local_endpoint("http://localhost:11434/v1"));
        assert!(super::is_local_endpoint("http://127.0.0.1:1234/v1"));
        assert!(super::is_local_endpoint("http://[::1]:8080/v1"));
        assert!(!super::is_local_endpoint("https://api.groq.com/openai/v1"));
        assert!(!super::is_local_endpoint(""));
    }
}

#[cfg(test)]
mod hotkey_tests {
    use super::Shortcut;

    #[test]
    fn recorded_chords_are_accepted_by_the_backend_parser() {
        // Keep these in sync with src/lib/hotkey.ts. global-hotkey spells the
        // Windows key as Super; META is not a valid modifier token in 0.8.
        for chord in [
            "Ctrl+Alt+B",
            "Ctrl+Alt+Shift+Super+K",
            "Ctrl+Shift+F5",
            "Alt+Space",
            "Alt+Numpad0",
            "Alt+NumpadEnter",
            "Ctrl+Comma",
            "Ctrl+Semicolon",
            "Alt+Quote",
            "Ctrl+Backquote",
            "Ctrl+Backspace",
            "Ctrl+Escape",
            "Ctrl+F24",
            "Super+PageDown",
        ] {
            assert!(chord.parse::<Shortcut>().is_ok(), "{chord} should parse");
        }
    }
}
