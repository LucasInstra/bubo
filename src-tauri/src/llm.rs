use crate::config::Settings;
use crate::log;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Delta<'a> {
    request_id: &'a str,
    delta: &'a str,
}

fn short_error(raw: &str) -> String {
    if let Ok(value) = serde_json::from_str::<Value>(raw) {
        if let Some(message) = value
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
        {
            return message.to_string();
        }
    }
    raw.chars().take(240).collect()
}

async fn post(
    client: &reqwest::Client,
    settings: &Settings,
    api_key: &str,
    body: &Value,
) -> Result<reqwest::Response, String> {
    let url = format!(
        "{}/chat/completions",
        settings.base_url.trim_end_matches('/')
    );

    let mut last_error = String::from("request failed");

    for attempt in 0..2 {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_millis(1200)).await;
        }

        let response = match client
            .post(&url)
            .bearer_auth(api_key)
            .json(body)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                last_error = format!("network error: {error}");
                continue;
            }
        };

        let status = response.status();
        if status.is_success() {
            return Ok(response);
        }

        let detail = response.text().await.unwrap_or_default();
        last_error = format!("{}: {}", status.as_u16(), short_error(&detail));

        let retryable = status.as_u16() == 429 || status.is_server_error();
        if !retryable {
            break;
        }
    }

    Err(last_error)
}

pub async fn stream_reply(
    app: AppHandle,
    client: reqwest::Client,
    settings: &Settings,
    api_key: &str,
    body: Value,
    request_id: &str,
) -> Result<String, String> {
    let response = post(&client, settings, api_key, &body).await?;
    let mut chunks = response.bytes_stream();
    let mut pending: Vec<u8> = Vec::new();
    let mut full = String::new();

    while let Some(chunk) = chunks.next().await {
        let chunk = chunk.map_err(|error| format!("stream error: {error}"))?;
        pending.extend_from_slice(&chunk);

        while let Some(position) = pending.iter().position(|byte| *byte == b'\n') {
            let line = String::from_utf8_lossy(&pending[..position])
                .trim_end_matches('\r')
                .to_string();
            pending.drain(..=position);

            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data.is_empty() || data == "[DONE]" {
                continue;
            }

            let Ok(value) = serde_json::from_str::<Value>(data) else {
                continue;
            };
            if let Some(text) = value["choices"][0]["delta"]["content"].as_str() {
                if text.is_empty() {
                    continue;
                }
                full.push_str(text);
                let _ = app.emit(
                    "bubo-delta",
                    Delta {
                        request_id,
                        delta: text,
                    },
                );
            }
        }
    }

    if full.trim().is_empty() {
        return Err("the model returned an empty reply".to_string());
    }

    Ok(full)
}

/// Non-streaming call, used for the correction pass.
pub async fn complete(
    app: &AppHandle,
    client: &reqwest::Client,
    settings: &Settings,
    api_key: &str,
    body: Value,
) -> Result<String, String> {
    let response = post(client, settings, api_key, &body).await?;
    let value: Value = response
        .json()
        .await
        .map_err(|error| format!("invalid json: {error}"))?;

    let content = value["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .to_string();

    if content.is_empty() {
        log::write(app, "warn", "empty corrections response");
    }

    Ok(content)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fix {
    pub wrong: String,
    pub right: String,
    pub note: String,
}

pub fn parse_fixes(raw: &str) -> Vec<Fix> {
    let start = raw.find('[');
    let end = raw.rfind(']');
    let (Some(start), Some(end)) = (start, end) else {
        return Vec::new();
    };
    if end <= start {
        return Vec::new();
    }

    let Ok(items) = serde_json::from_str::<Vec<Fix>>(&raw[start..=end]) else {
        return Vec::new();
    };

    items
        .into_iter()
        .filter(|fix| !fix.wrong.trim().is_empty() && !fix.right.trim().is_empty())
        .take(4)
        .map(|mut fix| {
            fix.wrong = fix.wrong.trim().to_string();
            fix.right = fix.right.trim().to_string();
            fix.note = fix.note.trim().to_string();
            fix
        })
        .collect()
}

pub fn fixes_event_payload(request_id: &str, fixes: &[Fix]) -> Value {
    json!({ "requestId": request_id, "fixes": fixes })
}

/// True when the only difference is letter case, which informal chat usually
/// does not want flagged.
pub fn only_case_differs(wrong: &str, right: &str) -> bool {
    wrong.trim().to_lowercase() == right.trim().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::parse_fixes;

    #[test]
    fn parses_a_clean_array() {
        let raw = r#"[{"wrong":"i go","right":"I went","note":"passado"},{"wrong":"was very good","right":"it was very good","note":"sujeito"}]"#;
        let fixes = parse_fixes(raw);
        assert_eq!(fixes.len(), 2);
        assert_eq!(fixes[0].wrong, "i go");
        assert_eq!(fixes[1].right, "it was very good");
    }

    #[test]
    fn tolerates_code_fences_and_chatter() {
        let raw = "Here you go:\n```json\n[{\"wrong\":\"a did\",\"right\":\"I did\",\"note\":\"sujeito\"}]\n```";
        assert_eq!(parse_fixes(raw).len(), 1);
    }

    #[test]
    fn empty_array_means_no_mistakes() {
        assert!(parse_fixes("[]").is_empty());
    }

    #[test]
    fn garbage_is_ignored() {
        assert!(parse_fixes("no json here").is_empty());
        assert!(parse_fixes("[{\"wrong\":\"\"}]").is_empty());
    }

    #[test]
    fn detects_case_only_corrections() {
        use super::only_case_differs;
        assert!(only_case_differs(
            "i went out on friday",
            "I went out on Friday"
        ));
        assert!(!only_case_differs("was very good", "It was very good"));
        assert!(!only_case_differs("i go", "I went"));
    }

    #[test]
    fn caps_the_list_at_four() {
        let raw = (0..8)
            .map(|index| format!(r#"{{"wrong":"w{index}","right":"r{index}","note":""}}"#))
            .collect::<Vec<_>>()
            .join(",");
        assert_eq!(parse_fixes(&format!("[{raw}]")).len(), 4);
    }
}
