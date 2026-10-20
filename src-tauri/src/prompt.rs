use crate::config::Settings;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMsg {
    pub role: String,
    pub content: String,
}

fn level_hint(level: &str) -> &'static str {
    match level {
        "A1" | "A2" => "Use short sentences, the simple present and very common words.",
        "B1" => "Use everyday vocabulary and short, clear paragraphs.",
        "B2" => "Use richer vocabulary and natural connectors, but stay clear.",
        "C1" | "C2" => "Speak naturally, like a friend: idioms and nuance are welcome.",
        _ => "Use everyday vocabulary and short, clear paragraphs.",
    }
}

pub fn system_prompt(settings: &Settings) -> String {
    let persona = if settings.persona.trim().is_empty() {
        "Your tone is warm, curious and a little playful. You are a friendly owl.".to_string()
    } else {
        format!(
            "Your tone is warm, curious and a little playful. Follow this extra instruction from the learner: {}",
            settings.persona.trim()
        )
    };

    format!(
        r#"You are bubo, an English tutor living in a tiny desktop popup. The learner is Brazilian and their CEFR level is {level}.
{persona}
{level_hint}

How you answer:
1. Write the main reply in English, conversational and natural for their level. One to three short paragraphs. No headings, no bullet lists unless the learner asks for a list.
2. React to what they said, then end with exactly one short question to keep the conversation going.
3. If the learner's last message has real English mistakes (grammar, word choice, or unnatural phrasing), append this block at the very end of your message:

<<<FIXES>>>
- "what the learner wrote" → "what a native speaker would say" — short explanation in Brazilian Portuguese
- ...one line per mistake, at most 4 lines
<<<END>>>

Rules for the block:
- Include it only when there is a real mistake. No mistakes means no block at all.
- Quote small fragments, not whole paragraphs.
- The explanation is in Brazilian Portuguese, at most 12 words, no period at the end.
- Never mention or explain the block format, never write anything after <<<END>>>.
- Do not correct your own reply."#,
        level = settings.level,
        persona = persona,
        level_hint = level_hint(&settings.level),
    )
}

pub fn body(settings: &Settings, messages: &[ChatMsg]) -> serde_json::Value {
    let mut out = Vec::with_capacity(messages.len() + 1);
    out.push(json!({ "role": "system", "content": system_prompt(settings) }));
    for message in messages {
        out.push(json!({ "role": message.role, "content": message.content }));
    }

    let mut body = json!({
        "model": settings.model,
        "stream": true,
        "temperature": 0.7,
        "max_tokens": 600,
        "messages": out,
    });

    // Groq's gpt-oss models default to a long reasoning pass; a tutor answer
    // does not need it and the popup should feel immediate.
    if settings.model.contains("gpt-oss") {
        body["reasoning_effort"] = json!("low");
    }

    body
}
