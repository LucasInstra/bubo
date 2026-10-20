use crate::config::Settings;
use futures_util::StreamExt;
use serde::Serialize;
use serde_json::Value;
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

pub async fn stream(
    app: AppHandle,
    client: reqwest::Client,
    settings: &Settings,
    api_key: &str,
    body: Value,
    request_id: &str,
) -> Result<String, String> {
    let url = format!(
        "{}/chat/completions",
        settings.base_url.trim_end_matches('/')
    );

    let response = client
        .post(&url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("network error: {error}"))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let detail = response.text().await.unwrap_or_default();
        return Err(format!("{status}: {}", short_error(&detail)));
    }

    let mut chunks = response.bytes_stream();
    let mut pending = String::new();
    let mut full = String::new();

    while let Some(chunk) = chunks.next().await {
        let chunk = chunk.map_err(|error| format!("stream error: {error}"))?;
        pending.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline) = pending.find('\n') {
            let line = pending[..newline].trim_end_matches('\r').to_string();
            pending.drain(..=newline);

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

    Ok(full)
}
