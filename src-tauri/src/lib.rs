mod config;
mod llm;
mod log;
mod prompt;
mod store;

use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
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
fn set_compact(window: tauri::Window, compact: bool) -> Result<(), String> {
    let (width, height) = if compact {
        (400.0, 280.0)
    } else {
        (420.0, 640.0)
    };
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|error| error.to_string())?;

    // Keep the smaller window inside the current monitor instead of letting
    // it grow past the edge when it was parked near the bottom.
    if let Ok(Some(monitor)) = window.current_monitor() {
        let area = monitor.work_area();
        let scale = window.scale_factor().unwrap_or(1.0);
        let target_width = (width * scale).round() as i32;
        let target_height = (height * scale).round() as i32;
        if let Ok(position) = window.outer_position() {
            let max_x = area.position.x + area.size.width as i32 - target_width;
            let max_y = area.position.y + area.size.height as i32 - target_height;
            let x = position.x.min(max_x).max(area.position.x);
            let y = position.y.min(max_y).max(area.position.y);
            if x != position.x || y != position.y {
                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
            }
        }
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

#[tauri::command]
async fn test_connection(
    settings: config::Settings,
    api_key: Option<String>,
) -> Result<String, String> {
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

    let count = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .get("data")
                .and_then(|data| data.as_array())
                .map(|data| data.len())
        });

    Ok(match count {
        Some(count) => format!("Connected, {count} model(s) available"),
        None => "Connected".to_string(),
    })
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
fn history(state: State<'_, AppState>) -> Result<Vec<store::StoredMessage>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::list(&db, 200).map_err(|e| e.to_string())
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

            app.manage(AppState {
                db: Mutex::new(connection),
                http: reqwest::Client::builder()
                    .connect_timeout(Duration::from_secs(10))
                    .read_timeout(Duration::from_secs(60))
                    .build()
                    .map_err(|error| std::io::Error::other(error.to_string()))?,
                shortcut: Mutex::new(None),
                cancels: Mutex::new(HashMap::new()),
            });

            let settings = config::load_settings(app.handle()).unwrap_or_default();

            if settings.ignore_capitalization {
                if let Ok(db) = app.state::<AppState>().db.lock() {
                    let _ = store::purge_case_only(&db);
                }
            }

            if let Some(window) = app.get_webview_window("main") {
                place_bottom_right(&window);
                let _ = window.set_always_on_top(settings.pinned);
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
            cancel_reply,
            delete_message,
            chat,
            history,
            clear_history,
            drill_stats,
            drill_next,
            drill_review,
            drill_skip_due,
            drill_reset,
            hide_window,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running bubo");
}
