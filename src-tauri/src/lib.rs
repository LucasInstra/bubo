mod config;
mod llm;
mod log;
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
    http: reqwest::Client,
    shortcut: Mutex<Option<Shortcut>>,
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
    compact_origin: Mutex<Option<(i32, i32)>>,
    compact: AtomicBool,
    popup: AtomicBool,
    popup_origin: Mutex<Option<(i32, i32)>>,
    popup_stage: Mutex<PopupStage>,
    last_window_save: Mutex<Option<Instant>>,
}

fn install_hotkey(
    app: &AppHandle,
    slot: &Mutex<Option<Shortcut>>,
    hotkey: &str,
) -> Result<(), String> {
    let parsed: Shortcut = hotkey
        .trim()
        .parse()
        .map_err(|_| format!("Invalid hotkey: {hotkey}. Try something like Ctrl+Alt+B."))?;

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
            Err(format!("Could not register {hotkey}: {error}"))
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

const POPUP_SIZE: f64 = 132.0;

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
            .set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(
                96.0, 96.0,
            ))))
            .map_err(|error| error.to_string())?;
        let size = (POPUP_SIZE * scale).round() as i32;
        let (origin_x, origin_y) = origin.unwrap_or((0, 0));
        let margin = (24.0 * scale).round() as i32;
        let outer = window.outer_size().map_err(|error| error.to_string())?;
        let x = origin_x + outer.width as i32 - size - margin;
        let y = origin_y + outer.height as i32 - size - margin;
        let (x, y) = clamp_to_monitor(&window, x, y, size, size);
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                POPUP_SIZE, POPUP_SIZE,
            )))
            .map_err(|error| error.to_string())?;
        window
            .set_position(tauri::PhysicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
    } else {
        state.popup.store(false, Ordering::Relaxed);
        if let Ok(mut slot) = state.popup_stage.lock() {
            *slot = PopupStage::Face;
        }
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

fn popup_size(stage: PopupStage) -> (f64, f64) {
    match stage {
        PopupStage::Face => (132.0, 132.0),
        PopupStage::Input => (320.0, 360.0),
        PopupStage::Reply => (320.0, 360.0),
    }
}

/// Where the face's center sits inside each popup layout, in logical pixels.
fn popup_face_offset(stage: PopupStage) -> (f64, f64) {
    match stage {
        PopupStage::Face => (66.0, 66.0),
        PopupStage::Input => (160.0, 180.0),
        PopupStage::Reply => (160.0, 180.0),
    }
}

#[tauri::command]
fn set_popup_stage(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    stage: String,
    resize: bool,
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

    if !resize {
        if let Ok(mut slot) = state.popup_stage.lock() {
            *slot = next;
        }
        return Ok(());
    }

    if popup_size(previous) == popup_size(next)
        && popup_face_offset(previous) == popup_face_offset(next)
    {
        if let Ok(mut slot) = state.popup_stage.lock() {
            *slot = next;
        }
        return Ok(());
    }

    let scale = window.scale_factor().unwrap_or(1.0);
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let (old_x, old_y) = popup_face_offset(previous);
    let face_x = position.x + (old_x * scale).round() as i32;
    let face_y = position.y + (old_y * scale).round() as i32;

    let (width, height) = popup_size(next);
    let (face_offset_x, face_offset_y) = popup_face_offset(next);
    let physical_width = (width * scale).round() as i32;
    let physical_height = (height * scale).round() as i32;
    let (x, y) = clamp_to_monitor(
        &window,
        face_x - (face_offset_x * scale).round() as i32,
        face_y - (face_offset_y * scale).round() as i32,
        physical_width,
        physical_height,
    );

    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;

    if let Ok(mut slot) = state.popup_stage.lock() {
        *slot = next;
    }
    Ok(())
}

#[tauri::command]
fn has_api_key() -> Result<bool, String> {
    Ok(config::load_api_key()?.is_some())
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
        return Err("Add a base URL first.".to_string());
    }

    let key = api_key
        .map(|key| key.trim().to_string())
        .filter(|key| !key.is_empty())
        .or_else(|| config::load_api_key().ok().flatten());

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| error.to_string())?;

    let mut request = client.get(format!("{base}/models"));
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("Could not reach the endpoint: {error}"))?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if !status.is_success() {
        let detail: String = body.chars().take(200).collect();
        return Err(format!("{status}: {detail}"));
    }

    let models = parse_model_ids(&body);
    let message = if models.is_empty() {
        "Connected".to_string()
    } else {
        format!("Connected, {} model(s) available", models.len())
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
async fn chat(
    app: AppHandle,
    state: State<'_, AppState>,
    request_id: String,
    messages: Vec<prompt::ChatMsg>,
) -> Result<String, String> {
    let client = state.http.clone();
    let settings = config::load_settings(&app)?;
    let api_key =
        config::load_api_key()?.ok_or("No API key yet. Open settings and paste your Groq key.")?;

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
    state: State<'_, AppState>,
    wrong: String,
    right: String,
    note: String,
) -> Result<String, String> {
    let client = state.http.clone();
    let settings = config::load_settings(&app)?;
    let api_key =
        config::load_api_key()?.ok_or("No API key yet. Open settings and paste your Groq key.")?;

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
fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::clear(&db).map_err(|e| e.to_string())
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
    if state.compact.load(Ordering::Relaxed) || state.popup.load(Ordering::Relaxed) {
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
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let connection = store::open(data_dir.join("bubo.db"))?;
            let settings = config::load_settings(app.handle()).unwrap_or_default();

            app.manage(AppState {
                db: Mutex::new(connection),
                http: reqwest::Client::builder()
                    .connect_timeout(Duration::from_secs(10))
                    .read_timeout(Duration::from_secs(60))
                    .build()
                    .map_err(|error| std::io::Error::other(error.to_string()))?,
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
                    let _ = window.set_min_size(Some(tauri::Size::Logical(
                        tauri::LogicalSize::new(96.0, 96.0),
                    )));
                    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                        POPUP_SIZE, POPUP_SIZE,
                    )));
                    place_bottom_right(&window);
                } else if !settings.compact {
                    window_state::restore(&window);
                }
                let _ = window.set_always_on_top(settings.pinned);

                let handle = app.handle().clone();
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
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
            chat,
            explain_fix,
            history,
            current_session,
            list_sessions,
            new_session,
            open_session,
            delete_session,
            clear_history,
            drill_stats,
            progress_stats,
            drill_next,
            drill_review,
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
