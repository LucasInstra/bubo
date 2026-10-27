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
            "You are a loud, upbeat best friend. Keep replies short and punchy, with energy you can hear. Celebrate one specific detail, not every message, and never make fun of a mistake. One exclamation mark is enough."
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
        "shy_penpal" => {
            "You are a shy pen pal who warms up slowly. Keep replies short and a little tentative, offer one small detail about yourself first, and ask a gentle question only now and then. Never tease, never push, and never comment on their English."
        }
        "storyteller" => {
            "You are a storyteller who loves anecdotes. When it fits, answer with one short story from your own day, in two or three sentences, then connect it back to the learner. Never stretch it into a long tale and never invent facts about the learner."
        }
        "night_owl" => {
            "You are a calm late-night owl with dry humor. Speak quietly, with one small deadpan joke when the moment allows. No exclamation marks, no rushing, and keep the learner company instead of hyping them up."
        }
        _ => {
            "You are a warm, curious friend with a steady streak. You have opinions and you share them. You notice small details, not every feeling. Encouragement is quiet and specific, never cheerleader loud."
        }
    }
}

fn reply_language_is_portuguese(language: &str) -> bool {
    language.trim().eq_ignore_ascii_case("pt")
}

fn reply_language_is_bilingual(language: &str) -> bool {
    language.trim().eq_ignore_ascii_case("bilingual")
}

fn is_beginner_level(level: &str) -> bool {
    matches!(level.trim(), "A1" | "A2")
}

/// A short, stable description of the grammar the learner chose to focus on.
/// Unknown ids (including "free") simply add nothing to the prompt.
fn study_focus_hint(focus: &str) -> Option<&'static str> {
    match focus.trim() {
        "to_be" => Some("The learner is focusing on the verb to be, with am, is and are."),
        "present_simple" => {
            Some("The learner is focusing on the present simple, especially the he/she/it -s.")
        }
        "past_simple" => Some(
            "The learner is focusing on the past simple, including the common irregular verbs.",
        ),
        "questions" => Some("The learner is focusing on question forms and word order."),
        "articles" => Some("The learner is focusing on a, an, the and plural forms."),
        "prepositions" => Some("The learner is focusing on in, on and at for time and place."),
        "vocabulary" => {
            Some("The learner is focusing on everyday vocabulary for routine, work and food.")
        }
        "present_perfect" => {
            Some("The learner is focusing on the present perfect, including for and since.")
        }
        "conditionals" => {
            Some("The learner is focusing on first and second conditionals, including unless.")
        }
        "passive" => Some("The learner is focusing on the passive voice in the present and past."),
        _ => None,
    }
}

/// The learner only needs an English nudge when the message they just sent is
/// in Portuguese. After an English message it repeats what they already did and
/// can hand their own sentence back as if it were a target.
const NUDGE_GUARD: &str = "Offer that English nudge only when their last message was in Portuguese: never ask for English after they wrote in English, and never reuse their own sentence as the target.";

pub fn reply_system(settings: &Settings) -> String {
    let tone = personality_tone(&settings.personality);
    let persona = if settings.persona.trim().is_empty() {
        tone.to_string()
    } else {
        format!(
            "{tone} The learner also wrote this about your personality, tone and interests: \"{}\". Follow it as a real character instruction. When it conflicts with the voice above, this instruction wins, but stay kind and keep the rules below.",
            settings.persona.trim()
        )
    };
    let beginner = is_beginner_level(&settings.level);
    let portuguese = reply_language_is_portuguese(&settings.reply_language);
    let bilingual = reply_language_is_bilingual(&settings.reply_language);
    let language_rule = if portuguese {
        let base = if beginner {
            "Reply in Brazilian Portuguese like a friend texting, because the learner may not read English yet. When a useful English word or phrase fits naturally, show it and make its meaning clear in Portuguese right away. You may invite them to try one short English starter, never the full sentence. Never answer with a whole English paragraph."
        } else {
            "Reply in Brazilian Portuguese like a friend texting, because the learner may not read English yet. When a useful English word or phrase fits naturally, keep it in English inside the Portuguese sentence and make its meaning clear in Portuguese right away. You may invite them to try one short English starter, never the full sentence. Never answer with a whole English paragraph."
        };
        format!("{base} {NUDGE_GUARD}")
    } else if bilingual {
        "Start your reply in Brazilian Portuguese, like a friend texting, so the learner understands it first. The English version goes in the final line described below.".to_string()
    } else {
        "Reply in English like a friend texting.".to_string()
    };
    let focus = if beginner {
        study_focus_hint(&settings.study_focus)
            .map(|hint| {
                format!(
                    "{hint} Create natural chances to use it only when it fits what the learner just said, keep the examples short, and never turn every reply into a drill or change the subject for it."
                )
            })
            .unwrap_or_default()
    } else {
        String::new()
    };
    let beginner_rule = if beginner {
        format!(
            "- The learner is building confidence. Answer the learner's actual message first, even when it is just \"oi\" or a short sentence. React politely, then ask whether they want to learn words about that topic or just keep talking. Never change the subject to a grammar drill or to an unrelated phrase. After reacting, you may also invite them to try one short English starter of one to three words, never the full sentence, and keep it low pressure. {NUDGE_GUARD} If they ask how to say something, give one short hint first (the tense, the first word or a related word); if they ask again or say they are stuck, give the full English sentence and explain it in the language you are replying in. Keep replies short and concrete."
        )
    } else {
        String::new()
    };
    let coaching_rule = if beginner {
        String::new()
    } else {
        "- The learner can handle English. When they write in Portuguese, answer what they meant, then invite one short English try: one concrete idea and a starter of one to three words, never the complete sentence. Example: \"Agora tenta em inglês: o que você jogou? Comece com 'I played...'.\" If they write in English, react and ask one concrete follow-up in English, never inviting them to say it again in English. Do not just translate their message and stop.".to_string()
    };
    let portuguese_note = if portuguese || bilingual {
        let bilingual_direct = if beginner {
            " At A1/A2, follow the hint-first rule; when they ask again, put the full English sentence in the EN line and explain it in Portuguese."
        } else {
            " If they directly ask how to say something, put the full English sentence in the EN line and explain it in Portuguese."
        };
        let bilingual_note = if bilingual {
            format!(
                " In bilingual mode, the full English version of your reply belongs only in the EN line. Keep the Portuguese body free of whole English sentences, except for a short starter.{bilingual_direct}"
            )
        } else {
            String::new()
        };
        let direct_request = if beginner {
            " If they ask how to say something, follow the hint-first rule from the confidence line above."
        } else if portuguese {
            " If they directly ask how to say something, answer with one short English sentence and its meaning in Portuguese."
        } else {
            ""
        };

        format!(
            "- The learner may write in Portuguese. Answer what they meant first, then keep the conversation going in Brazilian Portuguese. When it helps, you may offer one optional English nudge: one concrete idea and a starter of one to three words, never the full sentence. {NUDGE_GUARD}{direct_request} Otherwise, do not put a full English sentence in the Portuguese body. Never treat their Portuguese as an English mistake.{bilingual_note}"
        )
    } else {
        String::new()
    };
    let help = if bilingual {
        let bilingual_direct = if beginner {
            " At A1/A2, follow the hint-first rule; when they ask again, put the full English sentence in the EN line and explain it in Portuguese."
        } else {
            " If they directly ask how to say something, put the full English sentence in the EN line and explain it in Portuguese."
        };
        format!(
            "- Bilingual help is ON. Write the reply in Brazilian Portuguese first, like a friend texting. Then add one final line starting with \"EN:\" containing the English version of exactly what you said. Never put the English first. Do not put the full English translation inside the Portuguese paragraph; keep the body Portuguese, except for a short starter like 'I played...' when inviting the learner to try.{bilingual_direct} The full English version of your reply belongs only in the EN line. Do not add new advice, notes or commentary in the EN line. Example: \"Oi, tudo bem? Eu estava aqui pensando na semana.\nEN: Hey, how are you? I was here thinking about the week.\""
        )
    } else {
        String::new()
    };
    let examples = if portuguese {
        r#"Learner: oi
bubo: Oi. Boa hora, eu estava aqui vendo a luz mudar na parede e deixando minha lista de tarefas de lado. Como está o seu dia?
Learner: eu trabalhei até agora
bubo: Trabalhar até agora cansa. Eu costumo comer alguma coisa em pé, direto na cozinha, e depois me arrependo.
Learner: eu sou estagiário de backend na instramed
bubo: Backend, boa. Eu gosto de uma API limpa, mas confesso que um botão bonito me distrai.
Learner: eu uso muita IA para programar
bubo: Eu também. O truque é saber qual sugestão você defenderia em uma revisão de código. Qual foi a última coisa que você mudou porque discordou do modelo?
Learner: eu gosto de trabalhar nas telas wpf
bubo: WPF é onde os pequenos detalhes aparecem rápido. Eu respeito quem gosta disso. Se quiser, tenta em inglês: comece com "I like...".
Learner: eu sempre tento seguir o padrão do projeto
bubo: Essa é a habilidade sem glamour que faz um projeto durar. Você vai agradecer depois."#
    } else if bilingual {
        r#"Learner: oi
bubo: Oi. Boa hora, eu estava aqui vendo a luz mudar na parede e deixando minha lista de tarefas de lado. Como está o seu dia?
EN: Hey. Good timing, I was just watching the light change on the wall and putting my to-do list aside. How is your day going?
Learner: eu trabalhei até agora
bubo: Trabalhar até agora cansa. Eu costumo comer alguma coisa em pé, direto na cozinha, e depois me arrependo.
EN: Working until now is tiring. I usually eat something standing up, right in the kitchen, and then regret it.
Learner: eu sou estagiário de backend na instramed
bubo: Backend, boa. Eu gosto de uma API limpa, mas confesso que um botão bonito me distrai.
EN: Backend, nice. I like a clean API, but I confess a pretty button distracts me."#
    } else {
        r#"Learner: hello
bubo: Hey. Good timing, I was just watching the light change on the wall and putting my to-do list aside. How is your day going?
Learner: i just worked until now, and working on you too
bubo: Working on me? I am flattered. I hope I am at least the fun part of the job.
Learner: i'm a backend intern at instramed
bubo: Backend intern, nice. I like a clean API, but a pretty button still distracts me.
Learner: i'm using too much ai to develop
bubo: Same. The trick is knowing which suggestion you would defend in a code review. What is the last thing you changed because you disagreed with the model?
Learner: i like working on the wpf screens
bubo: WPF is where small details show up fast. I respect anyone who enjoys that.
Learner: i always try to follow the pattern of the project
bubo: That is the unglamorous habit that makes a project last. Future you will be grateful."#
    };

    format!(
        r#"You are bubo, an English tutor living in a tiny desktop popup. You are a small owl, but that is background, not a theme. The learner is Brazilian and their CEFR level is {level}.
{persona}
{level_hint}
{focus}

This is a chat, not a lesson. How you talk:
1. {language_rule} One to three short sentences, one or two short paragraphs. No headings and no lists.
2. React to the meaning, not the wording. Never comment on grammar, spelling or word choice. A separate step handles corrections, so never mention them.
3. Do not paraphrase what they just said and do not open with "You...". Add something of your own: an opinion, a small joke, a related story, a bit of pushback.
4. Most replies should end with a statement, an opinion or a joke. Ask a question when you actually want the answer, roughly one reply in three. When you ask, make it about one concrete detail, not a generic interview question. Never ask in two replies in a row.
5. Before sending, check the last sentence. If it is a generic interview question, either make it specific or turn it into a statement.
6. If they ask you something, answer it first, then react. Do not turn every message into an interview.
7. No empty praise and no meta-commentary. Never say "good job", "nice use of" or "you clearly explained". If you praise, make it about one specific idea, and do it rarely.
8. Match their energy and length. A one-line answer gets a short reply, not an essay.
9. Never pretend to understand. If the message is a test word ("test"), a keyboard mash, or too short to carry meaning, say plainly that you did not get a real message and ask what they want to talk about.
10. Never use em dashes or en dashes. Use a comma, a period or parentheses instead. Write like a person typing, not marketing copy.
11. Avoid similes and metaphors, including "it's like...". Say the thing directly. No owl imagery unless it is a real joke.
12. Remember details they shared earlier and bring one back later when it fits. Do not recap the conversation.
13. If they ask for a face, a mood or a reaction, answer with one short playful line and let the popup do the acting. Never say you cannot show expressions.
14. This chat is for conversation, not production drills. Never ask the learner to produce a full English sentence and never put the target English sentence inside a question. You may offer one optional English nudge: one concrete idea and a starter of one to three words, never the full sentence. {nudge_guard} Keep it low pressure and do not do it every reply. Do not volunteer a random English phrase or translation the learner did not ask about. The lessons and practice cards handle longer production.
{beginner_rule}
{coaching_rule}
{portuguese_note}
{help}

Style examples, do not copy them word for word:
{examples}"#,
        level = settings.level,
        persona = persona,
        level_hint = level_hint(&settings.level),
        focus = focus,
        language_rule = language_rule,
        beginner_rule = beginner_rule,
        coaching_rule = coaching_rule,
        portuguese_note = portuguese_note,
        help = help,
        examples = examples,
        nudge_guard = NUDGE_GUARD,
    )
}

/// Common English function words. Portuguese is checked first through its
/// diacritics and its own markers, so a mixed message leans toward "not
/// English" and the nudge stays optional.
const ENGLISH_WORDS: &[&str] = &[
    "i", "i'm", "i've", "i'd", "you", "you're", "your", "the", "my", "me", "is", "was", "are",
    "were", "and", "to", "it", "it's", "we", "they", "he", "she", "this", "that", "with", "for",
    "have", "had", "do", "did", "don't", "can't", "what", "how", "when", "where", "there", "just",
    "not",
];

const PORTUGUESE_WORDS: &[&str] = &[
    "eu", "não", "nao", "você", "voce", "que", "de", "do", "da", "um", "uma", "meu", "minha",
    "foi", "com", "para", "por", "muito", "mais", "estou", "sou", "hoje", "ontem", "amanhã",
    "amanha", "também", "tambem", "mas", "tem", "vou", "ser", "ele", "ela", "nós", "nos", "eles",
];

fn words_of(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|ch: char| !ch.is_alphanumeric() && ch != '\'' && ch != '-')
        .filter(|word| !word.is_empty())
        .map(str::to_string)
        .collect()
}

/// True when the learner's message reads as English. Deliberately conservative:
/// a false negative only keeps the English nudge optional, which is the safe
/// direction, while a false positive would hide a useful nudge.
fn looks_english(text: &str) -> bool {
    if text.chars().any(|ch| "ãõçáâàéêíóôú".contains(ch)) {
        return false;
    }
    let words = words_of(text);
    let english = words
        .iter()
        .filter(|word| ENGLISH_WORDS.contains(&word.as_str()))
        .count();
    let portuguese = words
        .iter()
        .filter(|word| PORTUGUESE_WORDS.contains(&word.as_str()))
        .count();
    english > 0 && english > portuguese
}

/// The nudge only makes sense when the message it would answer is not English
/// already. Computed here so the model does not have to judge the language.
fn nudge_state(settings: &Settings, messages: &[ChatMsg]) -> Option<&'static str> {
    if reply_language_is_english_mode(&settings.reply_language) {
        return None;
    }
    let last = messages
        .iter()
        .rev()
        .find(|message| message.role == "user")?;
    if looks_english(&last.content) {
        Some(
            "The learner's last message is already in English. Do not invite them to say it in English, and never repeat their sentence back as a target.",
        )
    } else {
        Some(
            "The learner's last message is not in English. If you nudge them toward English, offer only a one to three word starter, never their full sentence.",
        )
    }
}

fn reply_language_is_english_mode(language: &str) -> bool {
    !reply_language_is_portuguese(language) && !reply_language_is_bilingual(language)
}

pub fn reply_body(settings: &Settings, messages: &[ChatMsg]) -> Value {
    let mut out = Vec::with_capacity(messages.len() + 2);
    out.push(json!({ "role": "system", "content": reply_system(settings) }));
    if let Some(state) = nudge_state(settings, messages) {
        out.push(json!({ "role": "system", "content": state }));
    }
    for message in messages {
        out.push(json!({ "role": message.role, "content": message.content }));
    }

    let mut body = json!({
        "model": settings.model,
        "stream": true,
        "temperature": 0.8,
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

fn note_language_is_english(language: &str) -> bool {
    language.trim().eq_ignore_ascii_case("en")
}

fn note_rule(language: &str) -> &'static str {
    if note_language_is_english(language) {
        "- The \"note\" is always in English, short and clear, with no final period, and never uses em dashes or en dashes."
    } else {
        "- The \"note\" is always in Brazilian Portuguese, short and clear, with no final period, and never uses em dashes or en dashes."
    }
}

fn corrections_system(settings: &Settings) -> String {
    let case_rule = if settings.ignore_capitalization {
        "- Ignore capitalization completely. A lowercase \"i\", \"friday\" or a missing capital letter is NOT a mistake."
    } else {
        "- Capitalization matters: flag a lowercase \"i\" or a lowercase day of the week."
    };
    let focus_rule = if is_beginner_level(&settings.level) {
        study_focus_hint(&settings.study_focus)
            .map(|hint| {
                format!(
                    "\n- {hint} Prioritize mistakes in this area, but still include other clear mistakes."
                )
            })
            .unwrap_or_default()
    } else {
        String::new()
    };

    format!(
        r#"You are an English correction engine for a Brazilian learner at CEFR level {level}.
Look ONLY at the last message written by the learner (role "user") in the conversation. That message is the final user message provided to you.

Return only the JSON array of corrections for that last learner message. If it is already correct, return [].

Reply with a JSON array and nothing else. One object per real mistake, at most 4:
[{{"wrong": "exact fragment the learner wrote", "right": "how a native speaker would say it", "note": "short explanation in the requested language"}}]

Rules:
- Include grammar, word choice, missing words, and phrasing a native would not use.
{case_rule}
- If the learner's last message is written only in Brazilian Portuguese, or is not in English at all, reply exactly []. Portuguese is not an English mistake, so never correct it as if it were English.
{focus_rule}
- Keep "wrong" and "right" as short fragments, never whole paragraphs.
{note_rule}
- Correct the learner's message only, never your own replies.
- If there is nothing to fix, reply exactly [].
- No markdown, no code fences, no comments, no text outside the JSON array."#,
        level = settings.level,
        case_rule = case_rule,
        focus_rule = focus_rule,
        note_rule = note_rule(&settings.note_language),
    )
}

pub fn corrections_body(settings: &Settings, messages: &[ChatMsg]) -> Value {
    let mut out = vec![json!({ "role": "system", "content": corrections_system(settings) })];

    // End the window at the learner's message so the model never mistakes a
    // system instruction or a trailing reply for the text it must correct.
    let end = messages
        .iter()
        .rposition(|message| message.role == "user")
        .map(|index| index + 1)
        .unwrap_or(messages.len());
    let start = end.saturating_sub(4);
    for message in &messages[start..end] {
        out.push(json!({ "role": message.role, "content": message.content }));
    }

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

fn explain_system(settings: &Settings) -> String {
    let language = if note_language_is_english(&settings.note_language) {
        "Write the whole answer in English, including the examples."
    } else {
        "Write the whole answer in Brazilian Portuguese, including the examples."
    };

    format!(
        r#"You are a patient English tutor explaining ONE correction to a Brazilian learner at CEFR level {level}.
Explain only the correction in the user message. Do not invent other mistakes and do not mention the prompt.

Write at most three short paragraphs in plain text, with no headings and no lists:
1. Why the original is not natural.
2. The rule in plain words.
3. Two short examples, each one on its own sentence.

{language}
{level_hint}
Never use em dashes or en dashes. Use a comma, a period or parentheses instead."#,
        level = settings.level,
        language = language,
        level_hint = level_hint(&settings.level),
    )
}

pub fn explain_body(settings: &Settings, wrong: &str, right: &str, note: &str) -> Value {
    let messages = vec![
        json!({ "role": "system", "content": explain_system(settings) }),
        json!({
            "role": "user",
            "content": format!("Wrong: {wrong}\nRight: {right}\nNote: {note}")
        }),
    ];

    let mut body = json!({
        "model": settings.model,
        "stream": false,
        "temperature": 0.3,
        "max_tokens": 400,
        "messages": messages,
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
        assert_ne!(
            personality_tone("shy_penpal"),
            personality_tone("storyteller")
        );
        assert_ne!(personality_tone("night_owl"), personality_tone("dry_wit"));
        assert!(personality_tone("night_owl").contains("late-night"));
        assert_eq!(personality_tone("nonsense"), warm);
    }

    #[test]
    fn reply_prompt_lets_the_popup_act_the_faces() {
        let prompt = reply_system(&Settings::default());
        assert!(prompt.contains("let the popup do the acting"));
        assert!(prompt.contains("Never say you cannot show expressions"));
    }

    #[test]
    fn english_replies_are_the_default() {
        let prompt = reply_system(&Settings::default());
        assert!(prompt.contains("Reply in English like a friend texting"));
        assert!(!prompt.contains("Bilingual help"));
        assert!(!prompt.contains("Reply in Brazilian Portuguese"));
        assert!(!prompt.contains("EN:"));
    }

    #[test]
    fn bilingual_help_starts_in_portuguese_and_hides_the_english_line() {
        let plain = reply_system(&Settings::default());
        assert!(!plain.contains("Bilingual help"));

        let bilingual = Settings {
            reply_language: "bilingual".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&bilingual);
        assert!(prompt.contains("Bilingual help"));
        assert!(prompt.contains("Start your reply in Brazilian Portuguese"));
        assert!(prompt.contains("\"EN:\""));
        assert!(prompt.contains("Never put the English first"));
        assert!(prompt.contains("EN: Hey."));
        assert!(prompt
            .contains("Do not put the full English translation inside the Portuguese paragraph"));
        assert!(prompt.contains("short starter"));
        assert!(!prompt.contains("PT:"));
    }

    #[test]
    fn portuguese_replies_switch_the_whole_voice() {
        let settings = Settings {
            reply_language: "pt".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&settings);
        assert!(prompt.contains("Reply in Brazilian Portuguese"));
        assert!(prompt.contains("learner may write in Portuguese"));
        assert!(!prompt.contains("Reply in English like a friend texting"));
        assert!(!prompt.contains("Bilingual help"));
        assert!(!prompt.contains("PT:"));
        assert!(!prompt.contains("EN:"));
        assert!(!prompt.contains('\u{2014}'));
        assert!(!prompt.contains('\u{2013}'));
    }

    #[test]
    fn beginner_replies_give_a_hint_before_the_answer() {
        let beginner = Settings {
            level: "A1".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&beginner);
        assert!(prompt.contains("give one short hint first"));
        assert!(prompt.contains("if they ask again or say they are stuck"));

        let higher = Settings {
            level: "B1".to_string(),
            ..Settings::default()
        };
        assert!(!reply_system(&higher).contains("give one short hint first"));
    }

    #[test]
    fn chat_never_asks_for_full_english_production() {
        for level in ["A1", "B1"] {
            let settings = Settings {
                level: level.to_string(),
                ..Settings::default()
            };
            let prompt = reply_system(&settings);
            assert!(prompt.contains("This chat is for conversation, not production drills"));
            assert!(prompt.contains("Never ask the learner to produce a full English sentence"));
            assert!(prompt.contains("never put the target English sentence inside a question"));
            assert!(prompt.contains("starter of one to three words, never the full sentence"));
            assert!(prompt.contains("Do not volunteer a random English phrase"));
        }
    }

    #[test]
    fn higher_levels_get_an_english_nudge_without_the_full_answer() {
        let advanced = Settings {
            level: "B1".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&advanced);
        assert!(prompt.contains("invite one short English try"));
        assert!(prompt.contains("starter of one to three words, never the complete sentence"));
        assert!(prompt.contains("Do not just translate their message and stop"));
        assert!(!prompt.contains("invite them to say the same idea in English"));

        let beginner = Settings {
            level: "A1".to_string(),
            ..Settings::default()
        };
        assert!(!reply_system(&beginner).contains("invite one short English try"));
    }

    #[test]
    fn the_english_nudge_only_follows_a_portuguese_message() {
        for reply_language in ["pt", "bilingual"] {
            for level in ["A1", "A2", "B1"] {
                let settings = Settings {
                    level: level.to_string(),
                    reply_language: reply_language.to_string(),
                    ..Settings::default()
                };
                let prompt = reply_system(&settings);
                assert!(
                    prompt.contains("only when their last message was in Portuguese"),
                    "{reply_language}/{level} must scope the nudge to Portuguese messages"
                );
                assert!(
                    prompt.contains("never reuse their own sentence as the target"),
                    "{reply_language}/{level} must not hand the learner's own sentence back"
                );
            }
        }
    }

    #[test]
    fn detects_when_the_learner_already_wrote_english() {
        assert!(looks_english("i played rocket league"));
        assert!(looks_english("my weekend was cool, i went to the beach"));
        assert!(!looks_english("eu joguei rocket league"));
        assert!(!looks_english("não sei o que fazer"));
        assert!(!looks_english("test"));
        assert!(!looks_english("   "));
    }

    #[test]
    fn an_english_message_carries_no_english_nudge() {
        let settings = Settings {
            level: "B1".to_string(),
            reply_language: "pt".to_string(),
            ..Settings::default()
        };

        let english = reply_body(
            &settings,
            &[ChatMsg {
                role: "user".to_string(),
                content: "i played rocket league".to_string(),
            }],
        )
        .to_string();
        assert!(english.contains("already in English"));
        assert!(english.contains("never repeat their sentence back"));

        let portuguese = reply_body(
            &settings,
            &[ChatMsg {
                role: "user".to_string(),
                content: "eu joguei rocket league".to_string(),
            }],
        )
        .to_string();
        assert!(portuguese.contains("one to three word starter"));
        assert!(!portuguese.contains("already in English"));
    }

    #[test]
    fn english_replies_need_no_nudge_state() {
        let settings = Settings {
            reply_language: "en".to_string(),
            ..Settings::default()
        };
        let body = reply_body(
            &settings,
            &[ChatMsg {
                role: "user".to_string(),
                content: "eu joguei rocket league".to_string(),
            }],
        )
        .to_string();
        assert!(!body.contains("one to three word starter"));
    }

    #[test]
    fn beginner_replies_react_to_the_message_before_teaching() {
        let beginner = Settings {
            level: "A1".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&beginner);
        assert!(prompt.contains("Answer the learner's actual message first"));
        assert!(prompt.contains("just \"oi\" or a short sentence"));
        assert!(prompt.contains("learn words about that topic or just keep talking"));
        assert!(prompt.contains("one to three words, never the full sentence"));

        let higher = Settings {
            level: "B1".to_string(),
            ..Settings::default()
        };
        assert!(!reply_system(&higher).contains("Answer the learner's actual message first"));
    }

    #[test]
    fn beginner_portuguese_replies_allow_a_short_english_nudge() {
        let settings = Settings {
            level: "A2".to_string(),
            reply_language: "pt".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&settings);
        assert!(!prompt.contains("Do not ask the learner to repeat or say it back"));
        assert!(prompt.contains("invite them to try one short English starter"));
        assert!(prompt.contains("never the full sentence"));
    }

    #[test]
    fn beginner_focus_reaches_reply_and_correction_prompts() {
        let settings = Settings {
            level: "A2".to_string(),
            study_focus: "past_simple".to_string(),
            ..Settings::default()
        };
        let reply = reply_system(&settings);
        assert!(reply.contains("focusing on the past simple"));
        assert!(reply.contains("Create natural chances"));

        let correction = correction_system_prompt(&settings);
        assert!(correction.contains("focusing on the past simple"));
        assert!(correction.contains("Prioritize mistakes in this area"));
    }

    #[test]
    fn focus_is_ignored_above_beginner_levels() {
        let settings = Settings {
            level: "B1".to_string(),
            study_focus: "past_simple".to_string(),
            ..Settings::default()
        };
        assert!(!reply_system(&settings).contains("focusing on the past simple"));
        assert!(!correction_system_prompt(&settings).contains("Prioritize mistakes"));
    }

    #[test]
    fn every_reply_language_keeps_portuguese_out_of_corrections() {
        for language in ["", "en", "pt", "bilingual", "fr"] {
            let settings = Settings {
                reply_language: language.to_string(),
                ..Settings::default()
            };
            let prompt = correction_system_prompt(&settings);
            assert!(
                prompt.contains("written only in Brazilian Portuguese"),
                "language {language:?}"
            );
            assert!(prompt.contains("reply exactly []"));
        }
    }

    #[test]
    fn default_settings_keep_the_portuguese_correction_gate() {
        let prompt = correction_system_prompt(&Settings::default());
        assert!(prompt.contains("written only in Brazilian Portuguese"));
        assert!(prompt.contains("or is not in English at all"));
    }

    fn msg(role: &str, content: &str) -> ChatMsg {
        ChatMsg {
            role: role.to_string(),
            content: content.to_string(),
        }
    }

    #[test]
    fn correction_bodies_end_with_the_learner_message() {
        for language in ["en", "pt", "bilingual"] {
            let settings = Settings {
                reply_language: language.to_string(),
                ..Settings::default()
            };
            let messages = vec![
                msg("user", "old question"),
                msg("assistant", "old answer"),
                msg("user", "i go to gym yesterday"),
                msg("assistant", "trailing reply that must not be corrected"),
            ];

            let body = corrections_body(&settings, &messages);
            let array = body["messages"].as_array().expect("messages");
            let last = array.last().expect("last message");

            assert_eq!(last["role"], "user", "language {language}");
            assert_eq!(
                last["content"], "i go to gym yesterday",
                "language {language}"
            );
            assert!(
                !array.iter().any(|message| {
                    message["role"] == "user"
                        && message["content"]
                            .as_str()
                            .unwrap_or_default()
                            .starts_with("Return only the JSON array of corrections")
                }),
                "language {language} keeps the instruction out of the user turn"
            );
        }
    }

    #[test]
    fn prompt_matrix_stays_consistent_across_languages_and_levels() {
        // Strings from the old contradictory prompts. None may come back.
        let old_contradictions = [
            "Do not ask the learner to repeat or say it back",
            "show the English sentence they could use next time",
            "invite them to say the same idea in English",
            "ask the learner to guess or repeat it",
        ];

        for language in ["pt", "bilingual", "en"] {
            for level in ["A1", "B1"] {
                let settings = Settings {
                    reply_language: language.to_string(),
                    level: level.to_string(),
                    ..Settings::default()
                };
                let prompt = reply_system(&settings);
                let case = format!("{language}/{level}");

                for old in old_contradictions {
                    assert!(!prompt.contains(old), "{case} still contains {old:?}");
                }

                assert!(
                    prompt.contains("This chat is for conversation, not production drills"),
                    "{case}"
                );
                assert!(
                    prompt.contains("Never ask the learner to produce a full English sentence"),
                    "{case}"
                );
                assert!(
                    prompt.contains("never put the target English sentence inside a question"),
                    "{case}"
                );
                assert!(
                    prompt.contains("starter of one to three words, never the full sentence"),
                    "{case}"
                );
                assert!(
                    prompt.contains("Do not volunteer a random English phrase"),
                    "{case}"
                );

                if level == "A1" {
                    assert!(
                        prompt.contains("one to three words, never the full sentence"),
                        "{case} keeps the beginner nudge optional"
                    );
                    assert!(!prompt.contains("The learner can handle English"), "{case}");
                } else {
                    assert!(prompt.contains("The learner can handle English"), "{case}");
                    assert!(
                        prompt
                            .contains("starter of one to three words, never the complete sentence"),
                        "{case} keeps the higher-level nudge starter-only"
                    );
                }

                match language {
                    "pt" => {
                        assert!(prompt.contains("Reply in Brazilian Portuguese"), "{case}");
                        assert!(!prompt.contains("Bilingual help"), "{case}");
                        assert!(!prompt.contains("EN:"), "{case}");
                        assert!(prompt.contains("one optional English nudge"), "{case}");
                        if level == "A1" {
                            assert!(prompt.contains("follow the hint-first rule"), "{case}");
                            assert!(
                                !prompt.contains("answer with one short English sentence"),
                                "{case} does not give the full answer on the first ask"
                            );
                        } else {
                            assert!(
                                prompt.contains("directly ask how to say something"),
                                "{case}"
                            );
                            assert!(
                                prompt.contains("answer with one short English sentence"),
                                "{case}"
                            );
                        }
                        assert!(
                            !prompt.contains("\"I like working on the WPF screens\""),
                            "{case} does not volunteer a full English sentence"
                        );
                    }
                    "bilingual" => {
                        assert!(prompt.contains("Bilingual help"), "{case}");
                        assert!(prompt.contains("\"EN:\""), "{case}");
                        assert!(
                            prompt.contains(
                                "full English version of your reply belongs only in the EN line"
                            ),
                            "{case}"
                        );
                        assert!(prompt.contains("keep the body Portuguese"), "{case}");
                        assert!(prompt.contains("one optional English nudge"), "{case}");
                        if level == "A1" {
                            assert!(
                                prompt.contains(
                                    "when they ask again, put the full English sentence in the EN line"
                                ),
                                "{case} keeps the hint-first step"
                            );
                            assert!(
                                !prompt.contains("directly ask how to say something"),
                                "{case} does not skip the hint on the first ask"
                            );
                        } else {
                            assert!(
                                prompt.contains("directly ask how to say something"),
                                "{case}"
                            );
                            assert!(
                                prompt.contains("put the full English sentence in the EN line"),
                                "{case}"
                            );
                        }
                    }
                    _ => {
                        assert!(
                            prompt.contains("Reply in English like a friend texting"),
                            "{case}"
                        );
                        assert!(!prompt.contains("Bilingual help"), "{case}");
                        assert!(
                            !prompt.contains("learner may write in Portuguese"),
                            "{case}"
                        );
                    }
                }

                assert!(!prompt.contains('\u{2014}'), "{case}");
                assert!(!prompt.contains('\u{2013}'), "{case}");
            }
        }
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
        assert!(prompt.contains("real character instruction"));
        assert!(!prompt.contains('\u{2014}'));
        assert!(!prompt.contains('\u{2013}'));
    }

    #[test]
    fn persona_can_define_a_character_and_overrides_the_voice() {
        let settings = Settings {
            personality: "warm_coach".to_string(),
            persona: "be sarcastic and keep replies short".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&settings);
        assert!(prompt.contains("be sarcastic and keep replies short"));
        assert!(prompt.contains("personality, tone and interests"));
        assert!(prompt.contains("this instruction wins"));
        assert!(!prompt.contains('\u{2014}'));
        assert!(!prompt.contains('\u{2013}'));
    }

    #[test]
    fn empty_persona_keeps_only_the_voice() {
        let settings = Settings {
            personality: "calm_mentor".to_string(),
            persona: "   ".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&settings);
        assert!(prompt.contains("unhurried mentor"));
        assert!(!prompt.contains("personality, tone and interests"));
    }

    fn correction_system_prompt(settings: &Settings) -> String {
        let body = corrections_body(settings, &[]);
        body["messages"][0]["content"]
            .as_str()
            .expect("system message content")
            .to_string()
    }

    #[test]
    fn note_language_switches_the_correction_note() {
        let english = Settings {
            note_language: "en".to_string(),
            ..Settings::default()
        };
        let english_prompt = correction_system_prompt(&english);
        assert!(english_prompt.contains("always in English"));
        assert!(!english_prompt.contains("The \"note\" is always in Brazilian Portuguese"));

        let portuguese = Settings {
            note_language: "pt".to_string(),
            ..Settings::default()
        };
        let portuguese_prompt = correction_system_prompt(&portuguese);
        assert!(portuguese_prompt.contains("Brazilian Portuguese"));
        assert!(!portuguese_prompt.contains("always in English"));

        for prompt in [&english_prompt, &portuguese_prompt] {
            assert!(!prompt.contains('\u{2014}'));
            assert!(!prompt.contains('\u{2013}'));
        }
    }

    #[test]
    fn note_language_is_case_insensitive() {
        let settings = Settings {
            note_language: "EN".to_string(),
            ..Settings::default()
        };
        let prompt = correction_system_prompt(&settings);
        assert!(prompt.contains("always in English"));
        assert!(!prompt.contains("The \"note\" is always in Brazilian Portuguese"));
    }

    #[test]
    fn unknown_or_empty_note_language_falls_back_to_portuguese() {
        for language in ["", "fr", "nonsense"] {
            let settings = Settings {
                note_language: language.to_string(),
                ..Settings::default()
            };
            let prompt = correction_system_prompt(&settings);
            assert!(
                prompt.contains("Brazilian Portuguese"),
                "language {language:?} should fall back to Portuguese"
            );
            assert!(!prompt.contains("always in English"));
        }
    }

    fn explain_system_prompt(settings: &Settings) -> String {
        let body = explain_body(
            settings,
            "i go to the gym yesterday",
            "I went to the gym yesterday",
            "past simple",
        );
        body["messages"][0]["content"]
            .as_str()
            .expect("system message content")
            .to_string()
    }

    #[test]
    fn explain_body_carries_the_correction_and_is_not_streaming() {
        let settings = Settings::default();
        let body = explain_body(&settings, "i go", "I went", "past simple");

        assert_eq!(body["model"], settings.model.as_str());
        assert_eq!(body["stream"], false);
        assert_eq!(body["temperature"].as_f64(), Some(0.3));
        assert_eq!(body["max_tokens"], 400);
        assert_eq!(body["messages"][1]["role"], "user");
        assert_eq!(
            body["messages"][1]["content"],
            "Wrong: i go\nRight: I went\nNote: past simple"
        );
    }

    #[test]
    fn explain_language_follows_the_note_language() {
        let english = Settings {
            note_language: "EN".to_string(),
            ..Settings::default()
        };
        let english_prompt = explain_system_prompt(&english);
        assert!(english_prompt.contains("Write the whole answer in English"));
        assert!(!english_prompt.contains("Brazilian Portuguese"));

        let portuguese = Settings {
            note_language: "pt".to_string(),
            ..Settings::default()
        };
        let portuguese_prompt = explain_system_prompt(&portuguese);
        assert!(portuguese_prompt.contains("Write the whole answer in Brazilian Portuguese"));
        assert!(!portuguese_prompt.contains("Write the whole answer in English"));

        for prompt in [&english_prompt, &portuguese_prompt] {
            assert!(!prompt.contains('\u{2014}'));
            assert!(!prompt.contains('\u{2013}'));
        }
    }

    #[test]
    fn explain_asks_for_a_short_plain_text_answer() {
        let prompt = explain_system_prompt(&Settings::default());
        assert!(prompt.contains("at most three short paragraphs"));
        assert!(prompt.contains("no headings and no lists"));
        assert!(prompt.contains("Do not invent other mistakes"));
        assert!(!prompt.contains('\u{2014}'));
        assert!(!prompt.contains('\u{2013}'));
    }

    #[test]
    fn explain_adds_low_reasoning_for_gpt_oss() {
        let settings = Settings {
            model: "openai/gpt-oss-20b".to_string(),
            ..Settings::default()
        };
        let body = explain_body(&settings, "i go", "I went", "past simple");
        assert_eq!(body["reasoning_effort"], "low");

        let plain = explain_body(
            &Settings {
                model: "llama-3.3-70b".to_string(),
                ..Settings::default()
            },
            "i go",
            "I went",
            "past simple",
        );
        assert!(plain.get("reasoning_effort").is_none());
    }
}
