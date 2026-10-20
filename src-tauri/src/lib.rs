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
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct AppState {
    db: Mutex<rusqlite::Connection>,
    http: reqwest::Client,
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Result<config::Settings, String> {
    config::load_settings(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: config::Settings) -> Result<(), String> {
    config::save_settings_file(&app, &settings)
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
    let fixes = match llm::complete(&app, &client, &settings, &api_key, corrections_body).await {
        Ok(raw) => llm::parse_fixes(&raw),
        Err(error) => {
            log::write(&app, "warn", &format!("corrections failed: {error}"));
            Vec::new()
        }
    };

    if !fixes.is_empty() {
        let _ = app.emit("bubo-fixes", llm::fixes_event_payload(&request_id, &fixes));
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
            });

            if let Some(window) = app.get_webview_window("main") {
                place_bottom_right(&window);
            }

            let hotkey = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyB);
            app.global_shortcut().register(hotkey)?;

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
            chat,
            history,
            clear_history,
            hide_window,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running bubo");
}
