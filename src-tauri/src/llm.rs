use crate::config::Settings;
use crate::log;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone)]
pub struct Reply {
    pub text: String,
    pub cancelled: bool,
}

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

/// Models love an em dash. Dash-like characters are normalized so replies read
/// like a person typing, even when the prompt rule is ignored. True dashes
/// become commas; hyphens stay hyphens.
pub fn tidy(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();

    while let Some(character) = chars.next() {
        match character {
            '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2212}' => out.push('-'),
            '\u{2013}' | '\u{2014}' | '\u{2015}' => {
                while out.ends_with(' ') {
                    out.pop();
                }
                out.push(',');
                out.push(' ');
                while matches!(chars.peek(), Some(' ')) {
                    chars.next();
                }
            }
            _ => out.push(character),
        }
    }

    while out.contains(",  ") {
        out = out.replace(",  ", ", ");
    }

    out
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

    let mut last_error = String::from("requisição falhou");

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
                last_error = format!("erro de rede: {error}");
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
    cancel: Arc<AtomicBool>,
) -> Result<Reply, String> {
    let response = post(&client, settings, api_key, &body).await?;
    let mut chunks = response.bytes_stream();
    let mut pending: Vec<u8> = Vec::new();
    let mut full = String::new();

    while let Some(chunk) = chunks.next().await {
        if cancel.load(Ordering::Relaxed) {
            return Ok(Reply {
                text: full,
                cancelled: true,
            });
        }

        let chunk = chunk.map_err(|error| format!("erro no stream: {error}"))?;
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
                let text = tidy(text);
                full.push_str(&text);
                let _ = app.emit(
                    "bubo-delta",
                    Delta {
                        request_id,
                        delta: &text,
                    },
                );
            }
        }
    }

    if cancel.load(Ordering::Relaxed) {
        return Ok(Reply {
            text: tidy(&full),
            cancelled: true,
        });
    }

    if full.trim().is_empty() {
        return Err("the model returned an empty reply".to_string());
    }

    Ok(Reply {
        text: tidy(&full),
        cancelled: false,
    })
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
            fix.right = tidy(fix.right.trim());
            fix.note = tidy(fix.note.trim());
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
    fn replaces_dashes_with_commas() {
        use super::tidy;
        assert_eq!(tidy("a—b"), "a, b");
        assert_eq!(tidy("a — b"), "a, b");
        assert_eq!(tidy("a – b"), "a, b");
        assert_eq!(tidy("message—what now"), "message, what now");
        assert_eq!(tidy("pulse\u{2011}analytics"), "pulse-analytics");
        assert_eq!(tidy("2020\u{2013}2021"), "2020, 2021");
        assert_eq!(tidy("no dash here"), "no dash here");
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
