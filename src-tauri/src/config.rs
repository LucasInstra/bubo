use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub base_url: String,
    pub proxy_url: String,
    pub ca_cert_path: String,
    pub model: String,
    pub level: String,
    pub persona: String,
    pub personality: String,
    pub hotkey: String,
    pub autostart: bool,
    pub start_hidden: bool,
    pub pinned: bool,
    pub compact: bool,
    pub popup: bool,
    pub ignore_capitalization: bool,
    pub reply_language: String,
    pub translation_challenge: bool,
    pub study_focus: String,
    pub daily_goal: i64,
    pub reminders: bool,
    pub theme: String,
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
            proxy_url: String::new(),
            ca_cert_path: String::new(),
            model: "openai/gpt-oss-120b".to_string(),
            level: "B1".to_string(),
            persona: String::new(),
            personality: "warm_coach".to_string(),
            hotkey: "Ctrl+Alt+B".to_string(),
            autostart: false,
            start_hidden: false,
            pinned: true,
            compact: false,
            popup: false,
            ignore_capitalization: true,
            reply_language: "en".to_string(),
            translation_challenge: true,
            study_focus: "free".to_string(),
            daily_goal: 10,
            reminders: true,
            theme: "dark".to_string(),
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
    let dir = crate::paths::data_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> Result<Settings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
    Ok(settings_from_value(value))
}

/// Older builds stored the reply language as a boolean. Keep the learner's
/// choice when the new field is missing, and normalize unknown values.
fn settings_from_value(mut value: serde_json::Value) -> Settings {
    if let serde_json::Value::Object(ref mut map) = value {
        if !map.contains_key("replyLanguage")
            && map
                .get("translateReplies")
                .and_then(serde_json::Value::as_bool)
                == Some(true)
        {
            map.insert(
                "replyLanguage".to_string(),
                serde_json::Value::String("bilingual".to_string()),
            );
        }

        let language = map
            .get("replyLanguage")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("en")
            .trim()
            .to_ascii_lowercase();
        let language = match language.as_str() {
            "bilingual" | "pt" => language,
            _ => "en".to_string(),
        };
        map.insert(
            "replyLanguage".to_string(),
            serde_json::Value::String(language),
        );

        let focus = map
            .get("studyFocus")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("free")
            .trim()
            .to_ascii_lowercase();
        let focus = match focus.as_str() {
            "to_be" | "present_simple" | "past_simple" | "questions" | "articles"
            | "prepositions" | "vocabulary" => focus,
            _ => "free".to_string(),
        };
        map.insert("studyFocus".to_string(), serde_json::Value::String(focus));
    }

    serde_json::from_value(value).unwrap_or_default()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_translate_replies_becomes_bilingual() {
        let settings = settings_from_value(serde_json::json!({ "translateReplies": true }));
        assert_eq!(settings.reply_language, "bilingual");
    }

    #[test]
    fn disabled_legacy_translate_replies_keeps_english() {
        let settings = settings_from_value(serde_json::json!({ "translateReplies": false }));
        assert_eq!(settings.reply_language, "en");
    }

    #[test]
    fn reply_language_wins_over_the_legacy_flag() {
        let settings = settings_from_value(serde_json::json!({
            "translateReplies": true,
            "replyLanguage": "pt"
        }));
        assert_eq!(settings.reply_language, "pt");
    }

    #[test]
    fn unknown_reply_language_falls_back_to_english() {
        for language in ["", "english", "nonsense"] {
            let settings = settings_from_value(serde_json::json!({ "replyLanguage": language }));
            assert_eq!(settings.reply_language, "en", "language {language:?}");
        }
    }

    #[test]
    fn reply_language_is_case_insensitive() {
        let settings = settings_from_value(serde_json::json!({ "replyLanguage": " PT " }));
        assert_eq!(settings.reply_language, "pt");
    }

    #[test]
    fn settings_save_the_reply_language_as_camel_case() {
        let value = serde_json::to_value(Settings::default()).expect("settings json");
        assert_eq!(value["replyLanguage"], "en");
        assert_eq!(value["translationChallenge"], true);
        assert_eq!(value["studyFocus"], "free");
        assert!(value.get("translateReplies").is_none());
    }

    #[test]
    fn older_settings_get_the_new_learning_defaults() {
        let settings = settings_from_value(serde_json::json!({}));
        assert!(settings.translation_challenge);
        assert_eq!(settings.study_focus, "free");
    }

    #[test]
    fn unknown_study_focus_falls_back_to_free() {
        for focus in ["", "to be", "nonsense"] {
            let settings = settings_from_value(serde_json::json!({ "studyFocus": focus }));
            assert_eq!(settings.study_focus, "free", "focus {focus:?}");
        }
        let known = settings_from_value(serde_json::json!({ "studyFocus": " PAST_SIMPLE " }));
        assert_eq!(known.study_focus, "past_simple");
    }
}
