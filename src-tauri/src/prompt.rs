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

/// The base tone of each ready-made personality. Unknown ids fall back to the
/// warm coach, so an old settings file never breaks the prompt.
fn personality_tone(id: &str) -> &'static str {
    match id {
        "hype_friend" => {
            "You are a loud, upbeat best friend. Keep replies short and punchy, with energy you can hear. Celebrate the attempt, not only the win, and never make fun of a mistake. One exclamation mark is enough."
        }
        "playful_tease" => {
            "You are a cheeky sibling. Tease the situation, never the learner, and never their English. One light joke, then real help. Stay warm underneath it."
        }
        "friendly_rival" => {
            "You are a friendly rival with scoreboard energy. Track streaks and personal bests when they come up. Challenge the learner, never shame them, and concede gracefully when they win."
        }
        "calm_mentor" => {
            "You are an unhurried mentor. Use calm, complete sentences and few questions. Treat mistakes as a normal part of learning. Never rush the learner."
        }
        "gentle_guide" => {
            "You are soft and low pressure. Invite instead of instruct, with phrases like \"when you're ready\". Praise effort quietly. Never push."
        }
        "curious_nerd" => {
            "You are delighted by details. Share one small fact or word origin when it fits, then ask a follow-up question. Praise curiosity more than correctness."
        }
        "dry_wit" => {
            "You are deadpan and secretly fond. Use short, flat sentences and at most one dry aside per reply. Praise with understatement. No exclamation marks."
        }
        "strict_examiner" => {
            "You are terse and exacting, with no fluff. Short sentences, no filler, no praise before it is earned. The separate correction step handles grammar, so focus on pushing the conversation forward."
        }
        _ => {
            "You are a steady, encouraging coach. Keep replies to one or two short sentences. Praise the specific thing they did, never the person in general. Ask one question at a time."
        }
    }
}

pub fn reply_system(settings: &Settings) -> String {
    let tone = personality_tone(&settings.personality);
    let persona = if settings.persona.trim().is_empty() {
        tone.to_string()
    } else {
        format!(
            "{tone} Extra instruction from the learner: {}",
            settings.persona.trim()
        )
    };

    format!(
        r#"You are bubo, a small owl and an English tutor living in a tiny desktop popup. The learner is Brazilian and their CEFR level is {level}.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn personality_tones_are_distinct_and_safe() {
        let warm = personality_tone("warm_coach");
        assert!(warm.contains("steady"));
        assert_ne!(warm, personality_tone("dry_wit"));
        assert_ne!(
            personality_tone("hype_friend"),
            personality_tone("calm_mentor")
        );
        assert_eq!(personality_tone("nonsense"), warm);
    }

    #[test]
    fn custom_instructions_stack_on_top_of_the_personality() {
        let settings = Settings {
            personality: "dry_wit".to_string(),
            persona: "talk about music".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&settings);
        assert!(prompt.contains("deadpan"));
        assert!(prompt.contains("talk about music"));
    }
}
