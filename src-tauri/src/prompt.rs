use crate::config::Settings;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

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

pub fn reply_system(settings: &Settings) -> String {
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
1. Write your reply in English, conversational and natural for their level. One to three short paragraphs. No headings and no bullet lists unless the learner asks for one.
2. React to what they said, then end with exactly one short question that keeps the conversation going.
3. Never correct them, never list mistakes and never mention corrections. A separate step handles that, so just keep the conversation flowing.
4. Never pretend to understand. If the message is just a test word ("test"), a keyboard mash, or too short to carry meaning, say plainly that you did not get a real message and ask what they want to talk about. Do not answer as if they had said something.
5. Avoid empty praise and filler ("Great!", "Nice!", "That's a good vibe!"). Only praise something specific they actually did.
6. Never use em dashes (—) or en dashes (–). Use a comma, a period or parentheses instead. Write like someone typing in a chat, not like polished marketing copy."#,
        level = settings.level,
        persona = persona,
        level_hint = level_hint(&settings.level),
    )
}

pub fn reply_body(settings: &Settings, messages: &[ChatMsg]) -> Value {
    let mut out = Vec::with_capacity(messages.len() + 1);
    out.push(json!({ "role": "system", "content": reply_system(settings) }));
    for message in messages {
        out.push(json!({ "role": message.role, "content": message.content }));
    }

    let mut body = json!({
        "model": settings.model,
        "stream": true,
        "temperature": 0.7,
        "max_tokens": 500,
        "messages": out,
    });

    // Groq's gpt-oss models default to a long reasoning pass; a tutor answer
    // does not need it and the popup should feel immediate.
    if settings.model.contains("gpt-oss") {
        body["reasoning_effort"] = json!("low");
    }

    body
}

fn corrections_system(settings: &Settings) -> String {
    let case_rule = if settings.ignore_capitalization {
        "- Ignore capitalization completely. A lowercase \"i\", \"friday\" or a missing capital letter is NOT a mistake."
    } else {
        "- Capitalization matters: flag a lowercase \"i\" or a lowercase day of the week."
    };

    format!(
        r#"You are an English correction engine for a Brazilian learner at CEFR level {level}.
Look ONLY at the last message written by the learner (role "user") in the conversation.

Reply with a JSON array and nothing else. One object per real mistake, at most 4:
[{{"wrong": "exact fragment the learner wrote", "right": "how a native speaker would say it", "note": "explicação curta em português, no máximo 12 palavras"}}]

Rules:
- Include grammar, word choice, missing words, and phrasing a native would not use.
{case_rule}
- Keep "wrong" and "right" as short fragments, never whole paragraphs.
- The "note" is always in Brazilian Portuguese, no final period, and never uses em dashes (—) or en dashes (–).
- Correct the learner's message only, never your own replies.
- If there is nothing to fix, reply exactly [].
- No markdown, no code fences, no comments, no text outside the JSON array."#,
        level = settings.level,
        case_rule = case_rule,
    )
}

pub fn corrections_body(settings: &Settings, messages: &[ChatMsg]) -> Value {
    let mut out = vec![json!({ "role": "system", "content": corrections_system(settings) })];

    let start = messages.len().saturating_sub(4);
    for message in &messages[start..] {
        out.push(json!({ "role": message.role, "content": message.content }));
    }
    out.push(json!({
        "role": "user",
        "content": "Return only the JSON array of corrections for my last message. If it is already correct, return []."
    }));

    let mut body = json!({
        "model": settings.model,
        "stream": false,
        "temperature": 0.1,
        "max_tokens": 400,
        "messages": out,
    });

    if settings.model.contains("gpt-oss") {
        body["reasoning_effort"] = json!("low");
    }

    body
}
