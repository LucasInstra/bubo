mod config;
mod llm;
mod log;
mod prompt;
mod store;

use std::sync::Mutex;
use serde_json::json;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

struct AppState {
    db: Mutex<rusqlite::Connection>,
    http: reqwest::Client,
    shortcut: Mutex<Option<Shortcut>>,
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

    let _ = app.global_shortcut().unregister_all();
    app.global_shortcut()
        .register(parsed)
        .map_err(|error| format!("Could not register {hotkey}: {error}"))?;

    if let Ok(mut current) = slot.lock() {
        *current = Some(parsed);
    }

    Ok(())
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
    install_hotkey(&app, &state.shortcut, &settings.hotkey)?;

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
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| e.to_string())
    } else {
        autolaunch.disable().map_err(|e| e.to_string())
    }
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
    let api_key = config::load_api_key()?
        .ok_or("No API key yet. Open settings and paste your Groq key.")?;

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
        &format!("reply start model={} messages={}", settings.model, messages.len()),
    );

    let reply_body = prompt::reply_body(&settings, &messages);
    let full = match llm::stream_reply(
        app.clone(),
        client.clone(),
        &settings,
        &api_key,
        reply_body,
        &request_id,
    )
    .await
    {
        Ok(text) => text,
        Err(error) => {
            // A failed turn must not leave a dangling user message in history.
            if let (Ok(db), Some(id)) = (state.db.lock(), user_row) {
                let _ = store::delete(&db, id);
            }
            log::write(&app, "error", &format!("reply failed: {error}"));
            return Err(error);
        }
    };

    let _ = app.emit("bubo-reply-done", json!({ "requestId": request_id }));

    let corrections_body = prompt::corrections_body(&settings, &messages);
    let mut fixes = match llm::complete(&app, &client, &settings, &api_key, corrections_body).await {
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
        let _ = store::save_fixes(&db, &fixes);
    }

    let fixes_json = if fixes.is_empty() {
        None
    } else {
        serde_json::to_string(&fixes).ok()
    };

    if let Ok(db) = state.db.lock() {
        let _ = store::insert(&db, "assistant", &full, fixes_json.as_deref());
    }

    log::write(
        &app,
        "info",
        &format!("reply done chars={} fixes={}", full.len(), fixes.len()),
    );

    Ok(full)
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
) -> Result<Option<store::DrillItem>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    store::next_drill(&db, include_future).map_err(|e| e.to_string())
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
    let screen = monitor.size();
    let scale = monitor.scale_factor();
    let window_size = window.outer_size().unwrap_or_default();
    let margin = (24.0 * scale) as i32;
    let taskbar = (56.0 * scale) as i32;

    let x = screen.width as i32 - window_size.width as i32 - margin;
    let y = screen.height as i32 - window_size.height as i32 - margin - taskbar;
    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
}

pub fn run() {
    tauri::Builder::default()
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
                http: reqwest::Client::new(),
                shortcut: Mutex::new(None),
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

            install_hotkey(
                app.handle(),
                &app.state::<AppState>().shortcut,
                &settings.hotkey,
            )
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;

            let show_item = MenuItem::with_id(app, "show", "Show bubo", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::with_id("bubo-tray")
                .icon(app.default_window_icon().unwrap().clone())
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
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            has_api_key,
            save_api_key,
            set_autostart,
            set_pinned,
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
