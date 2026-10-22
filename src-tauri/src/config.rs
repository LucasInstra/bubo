use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub base_url: String,
    pub model: String,
    pub level: String,
    pub persona: String,
    pub personality: String,
    pub hotkey: String,
    pub autostart: bool,
    pub pinned: bool,
    pub compact: bool,
    pub popup: bool,
    pub ignore_capitalization: bool,
    pub note_language: String,
    pub shape: String,
    pub color: String,
    pub show_mouth: bool,
    pub mouth_style: String,
    pub mouth_size: String,
    pub mouth_color: String,
    pub show_status: bool,
    pub accent_from_mascot: bool,
    pub text_size: String,
    pub eye_style: String,
    pub eye_size: String,
    pub eye_spacing: String,
    pub eye_tilt: String,
    pub eye_color: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            base_url: "https://api.groq.com/openai/v1".to_string(),
            model: "openai/gpt-oss-120b".to_string(),
            level: "B1".to_string(),
            persona: String::new(),
            personality: "warm_coach".to_string(),
            hotkey: "Ctrl+Alt+B".to_string(),
            autostart: false,
            pinned: true,
            compact: false,
            popup: false,
            ignore_capitalization: true,
            note_language: "en".to_string(),
            shape: "round".to_string(),
            color: "#8b7dff".to_string(),
            show_mouth: false,
            mouth_style: "line".to_string(),
            mouth_size: "medium".to_string(),
            mouth_color: "auto".to_string(),
            show_status: true,
            accent_from_mascot: true,
            text_size: "normal".to_string(),
            eye_style: "bars".to_string(),
            eye_size: "large".to_string(),
            eye_spacing: "normal".to_string(),
            eye_tilt: "straight".to_string(),
            eye_color: "auto".to_string(),
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> Result<Settings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub fn save_settings_file(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

const SERVICE: &str = "bubo";
const ACCOUNT: &str = "llm-api-key";

pub fn save_api_key(key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    entry.set_password(key).map_err(|e| e.to_string())
}

pub fn load_api_key() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
