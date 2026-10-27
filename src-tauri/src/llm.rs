use crate::config::Settings;
use crate::log;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
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

        let mut request = client.post(&url).json(body);
        if !api_key.trim().is_empty() {
            request = request.bearer_auth(api_key);
        }
        let response = match request.send().await {
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
    #[serde(default, deserialize_with = "deserialize_note")]
    pub note: String,
}

/// A missing note is harmless; a literal `null` should not fail the whole
/// correction pass either, so both collapse to an empty string.
fn deserialize_note<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<String>::deserialize(deserializer)?.unwrap_or_default())
}

/// Byte spans of balanced `open`/`close` pairs in `raw`, ignoring pairs inside
/// JSON strings. Only outermost pairs are returned, so `[{"a":1}]` yields the
/// array span and `{"a":{"b":1}}` yields the outer object span.
fn balanced_segments(raw: &str, open: u8, close: u8) -> Vec<(usize, usize)> {
    let mut segments = Vec::new();
    let mut stack = Vec::new();
    let mut in_string = false;
    let mut escaped = false;

    for (index, byte) in raw.as_bytes().iter().copied().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'"' {
                in_string = false;
            }
            continue;
        }

        match byte {
            b'"' => in_string = true,
            byte if byte == open => stack.push(index),
            byte if byte == close => {
                if let Some(start) = stack.pop() {
                    if stack.is_empty() {
                        segments.push((start, index + 1));
                    }
                }
            }
            _ => {}
        }
    }

    segments
}

fn sanitize_fix(mut fix: Fix) -> Option<Fix> {
    fix.wrong = fix.wrong.trim().to_string();
    fix.right = tidy(fix.right.trim());
    fix.note = tidy(fix.note.trim());

    if fix.wrong.is_empty() || fix.right.is_empty() {
        return None;
    }

    Some(fix)
}

fn fixes_from_array(raw: &str) -> Vec<Fix> {
    let Ok(items) = serde_json::from_str::<Vec<Value>>(raw) else {
        return Vec::new();
    };

    items
        .into_iter()
        .filter_map(|item| serde_json::from_value::<Fix>(item).ok())
        .filter_map(sanitize_fix)
        .collect()
}

/// Per-object salvage for a single object, a malformed array or a reply cut off
/// mid-stream: parse every complete object on its own and keep the ones that
/// look like a correction.
fn fixes_from_objects(raw: &str) -> Vec<Fix> {
    balanced_segments(raw, b'{', b'}')
        .into_iter()
        .filter_map(|(start, end)| serde_json::from_str::<Fix>(&raw[start..end]).ok())
        .filter_map(sanitize_fix)
        .collect()
}

pub fn parse_fixes(raw: &str) -> Vec<Fix> {
    let mut fixes = Vec::new();

    for (start, end) in balanced_segments(raw, b'[', b']') {
        fixes.extend(fixes_from_array(&raw[start..end]));
    }

    // Always salvage complete objects too. This covers a bare object, several
    // arrays, a malformed array and an array cut off mid-object; duplicates
    // from the well-formed path are removed below.
    fixes.extend(fixes_from_objects(raw));

    let mut seen = HashSet::new();
    fixes.retain(|fix| seen.insert((normalize_answer(&fix.wrong), normalize_answer(&fix.right))));
    fixes
}

pub fn fixes_event_payload(request_id: &str, fixes: &[Fix]) -> Value {
    json!({ "requestId": request_id, "fixes": fixes })
}

/// Comparison form shared with the lesson answer checker: lowercase,
/// punctuation removed and whitespace collapsed.
pub fn normalize_answer(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut pending_space = false;

    for character in value.chars() {
        if character.is_whitespace() {
            pending_space = !out.is_empty();
            continue;
        }

        if matches!(
            character,
            '.' | ','
                | '!'
                | '?'
                | ';'
                | ':'
                | '\u{2026}'
                | '\u{2014}'
                | '\u{2013}'
                | '\u{201c}'
                | '\u{201d}'
                | '\u{00ab}'
                | '\u{00bb}'
                | '('
                | ')'
                | '['
                | ']'
                | '{'
                | '}'
        ) {
            continue;
        }

        if pending_space {
            out.push(' ');
            pending_space = false;
        }

        let character = match character {
            '\u{2019}' | '\u{2018}' => '\'',
            other => other,
        };
        out.extend(character.to_lowercase());
    }

    out
}

/// True when the only difference is letter case, punctuation or spacing, which
/// informal chat usually does not want flagged.
pub fn only_case_differs(wrong: &str, right: &str) -> bool {
    normalize_answer(wrong) == normalize_answer(right)
}

/// True when `needle` appears as a contiguous run of whole words in `haystack`.
/// Both inputs are expected to be normalized with [`normalize_answer`].
pub fn contains_words(haystack: &str, needle: &str) -> bool {
    let hay: Vec<&str> = haystack.split_whitespace().collect();
    let needle: Vec<&str> = needle.split_whitespace().collect();
    if needle.is_empty() || needle.len() > hay.len() {
        return false;
    }
    hay.windows(needle.len())
        .any(|window| window == needle.as_slice())
}

#[cfg(test)]
mod tests {
    use super::{contains_words, normalize_answer, only_case_differs, parse_fixes};

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
    fn missing_and_null_notes_are_tolerated() {
        let missing = parse_fixes(r#"[{"wrong":"i go","right":"I went"}]"#);
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].note, "");

        let null = parse_fixes(r#"[{"wrong":"i go","right":"I went","note":null}]"#);
        assert_eq!(null.len(), 1);
        assert_eq!(null[0].note, "");
    }

    #[test]
    fn accepts_a_single_object_without_an_array() {
        let fixes = parse_fixes(r#"{"wrong":"i go","right":"I went","note":"past"}"#);
        assert_eq!(fixes.len(), 1);
        assert_eq!(fixes[0].right, "I went");
    }

    #[test]
    fn ignores_brackets_in_chatter_and_reads_every_array() {
        let raw = r#"Here [see below] is the first: [{"wrong":"a did","right":"I did","note":"x"}] and also [{"wrong":"he go","right":"he goes","note":"y"}]."#;
        let fixes = parse_fixes(raw);
        assert_eq!(fixes.len(), 2);
        assert_eq!(fixes[0].wrong, "a did");
        assert_eq!(fixes[1].wrong, "he go");
    }

    #[test]
    fn salvages_objects_from_a_truncated_reply() {
        let raw =
            r#"[{"wrong":"a did","right":"I did","note":"x"},{"wrong":"he go","right":"he go"#;
        let fixes = parse_fixes(raw);
        assert_eq!(fixes.len(), 1);
        assert_eq!(fixes[0].wrong, "a did");
    }

    #[test]
    fn salvages_objects_from_a_malformed_array() {
        let raw = r#"[{"wrong":"a did","right":"I did","note":"x"},]"#;
        let fixes = parse_fixes(raw);
        assert_eq!(fixes.len(), 1);
        assert_eq!(fixes[0].wrong, "a did");
    }

    #[test]
    fn dedupes_repeated_corrections() {
        let raw = r#"[{"wrong":"i go","right":"I went","note":""},{"wrong":"I  go","right":"I went.","note":"again"}]"#;
        assert_eq!(parse_fixes(raw).len(), 1);
    }

    #[test]
    fn keeps_every_fix_so_lib_can_filter_before_capping() {
        let raw = (0..8)
            .map(|index| format!(r#"{{"wrong":"w{index}","right":"r{index}","note":""}}"#))
            .collect::<Vec<_>>()
            .join(",");
        assert_eq!(parse_fixes(&format!("[{raw}]")).len(), 8);
    }

    #[test]
    fn detects_case_only_corrections() {
        assert!(only_case_differs(
            "i went out on friday",
            "I went out on Friday."
        ));
        assert!(only_case_differs("i  went, out", "I went out"));
        assert!(!only_case_differs("was very good", "It was very good"));
        assert!(!only_case_differs("i go", "I went"));
    }

    #[test]
    fn normalizes_like_the_answer_checker() {
        assert_eq!(normalize_answer("  I  went, out!  "), "i went out");
        assert_eq!(normalize_answer("it\u{2019}s fine"), "it's fine");
        assert_eq!(normalize_answer("a \u{2014} b"), "a b");
    }

    #[test]
    fn grounds_a_fix_on_whole_words_only() {
        assert!(contains_words("i am good at this", "good"));
        assert!(!contains_words("i am good at this", "go"));
        assert!(contains_words("she is not my boss", "is not"));
        assert!(!contains_words("she is not my boss", "not my bossy"));
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
}
