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
        if beginner {
            "Reply in Brazilian Portuguese like a friend texting, because the learner may not read English yet. When a useful English word or phrase fits naturally, show it and make its meaning clear in Portuguese right away. Do not ask the learner to repeat or say it back, because the phrase is already in front of them. Never answer with a whole English paragraph."
        } else {
            "Reply in Brazilian Portuguese like a friend texting, because the learner may not read English yet. When a useful English word or phrase fits naturally, keep it in English inside the Portuguese sentence and make its meaning clear in Portuguese right away. Never answer with a whole English paragraph."
        }
    } else if bilingual {
        "Start your reply in Brazilian Portuguese, like a friend texting, so the learner understands it first. The English version goes in the final line described below."
    } else {
        "Reply in English like a friend texting."
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
        "- The learner is building confidence. When they ask for a word, a translation or how to say something, give one short hint first (the first word, the tense or a related word) and ask them to try. Only give the full answer if they ask again or say they are stuck. When you introduce a new English phrase, invite them to guess the meaning before you translate it. Never ask the learner to repeat or say back a phrase you just showed them: they can already read it, so the question would make no sense. When you do ask the learner to produce an English sentence or word, the question must not contain that English answer. Keep the target phrase hidden. State the meaning in Portuguese and give one hint that is not the answer. If a hint would reveal the phrase, make it smaller (the tense, the first word or a related word). Good: \"Como você diria 'eu joguei muitos jogos' em inglês? Dica: use o passado de play e uma expressão para 'muitos'.\" Bad: \"Você já tentou dizer 'Can I have a coffee?'? Tente agora.\" Never quote the English sentence and then ask them to guess a word inside it. Always answer what the learner actually sent before anything else. If the message is a greeting, a very short answer or a change of subject, react to it politely and then ask whether they want to learn the words for that topic or just talk about it. Never ignore the message to push a grammar drill or an unrelated subject."
    } else {
        ""
    };
    let portuguese_note = if portuguese || bilingual {
        "- The learner may write in Portuguese. Answer what they meant first, then keep the conversation going in Portuguese and, when it helps, show the English sentence they could use next time with its meaning in Portuguese. Never treat their Portuguese as an English mistake."
    } else {
        ""
    };
    let help = if bilingual {
        "- Bilingual help is ON. Write the reply in Brazilian Portuguese first, like a friend texting. Then add one final line starting with \"EN:\" containing the English version of exactly what you said. Never put the English first. Do not add new advice, notes or commentary in that line. Example: \"Oi, tudo bem? Eu estava aqui pensando na semana.\nEN: Hey, how are you? I was here thinking about the week.\""
    } else {
        ""
    };
    let examples = if portuguese {
        r#"Learner: oi
bubo: Oi. Boa hora, eu estava aqui vendo a luz mudar na parede e fugindo da minha lista de tarefas. Como está o seu dia?
Learner: eu trabalhei até agora
bubo: Trabalhar até agora cansa. Você parou para comer alguma coisa ou foi direto?
Learner: eu sou estagiário de backend na instramed
bubo: Backend, boa. Eu trocaria uma API limpa por um botão bonito a qualquer momento, mas sou suspeito.
Learner: eu uso muita IA para programar
bubo: Eu também. O truque é saber qual sugestão você defenderia em uma revisão de código. Qual foi a última coisa que você mudou porque discordou do modelo?
Learner: eu gosto de trabalhar nas telas wpf
bubo: WPF é onde os pequenos detalhes aparecem rápido. Eu respeito quem gosta disso. "I like working on the WPF screens" quer dizer "eu gosto de trabalhar nas telas WPF", uma boa frase para essa conversa.
Learner: eu sempre tento seguir o padrão do projeto
bubo: Essa é a habilidade sem glamour que mantém um código vivo. Você vai agradecer depois."#
    } else if bilingual {
        r#"Learner: oi
bubo: Oi. Boa hora, eu estava aqui vendo a luz mudar na parede e fugindo da minha lista de tarefas. Como está o seu dia?
EN: Hey. Good timing, I was just watching the light change on the wall and avoiding my to-do list. How is your day going?
Learner: eu trabalhei até agora
bubo: Trabalhar até agora cansa. Você parou para comer alguma coisa ou foi direto?
EN: Working until now is tiring. Did you stop to eat something, or did you go straight through?
Learner: eu sou estagiário de backend na instramed
bubo: Backend, boa. Eu trocaria uma API limpa por um botão bonito a qualquer momento, mas sou suspeito.
EN: Backend, nice. I would trade a clean API for a pretty button any time, but I am biased."#
    } else {
        r#"Learner: hello
bubo: Hey. Good timing, I was just watching the light change on the wall and avoiding my to-do list. How is your day going?
Learner: i just worked until now, and working on you too
bubo: Working on me? I am flattered. I hope I am at least the fun part of the job.
Learner: i'm a backend intern at instramed
bubo: Backend intern, nice. I would take a clean API over a pretty button any day, but I am biased.
Learner: i'm using too much ai to develop
bubo: Same. The trick is knowing which suggestion you would defend in a code review. What is the last thing you changed because you disagreed with the model?
Learner: i like working on the wpf screens
bubo: WPF is where small details show up fast. I respect anyone who enjoys that.
Learner: i always try to follow the pattern of the project
bubo: That is the unglamorous skill that keeps a codebase alive. Future you will be grateful."#
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
{beginner_rule}
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
        portuguese_note = portuguese_note,
        help = help,
        examples = examples,
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
    let portuguese_rule = if reply_language_is_portuguese(&settings.reply_language)
        || reply_language_is_bilingual(&settings.reply_language)
    {
        "\n- If the learner's last message is written only in Brazilian Portuguese, reply exactly []. Portuguese is not an English mistake, so never correct it as if it were English."
    } else {
        ""
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
Look ONLY at the last message written by the learner (role "user") in the conversation.

Reply with a JSON array and nothing else. One object per real mistake, at most 4:
[{{"wrong": "exact fragment the learner wrote", "right": "how a native speaker would say it", "note": "short explanation in the requested language"}}]

Rules:
- Include grammar, word choice, missing words, and phrasing a native would not use.
{case_rule}{portuguese_rule}{focus_rule}
- Keep "wrong" and "right" as short fragments, never whole paragraphs.
{note_rule}
- Correct the learner's message only, never your own replies.
- If there is nothing to fix, reply exactly [].
- No markdown, no code fences, no comments, no text outside the JSON array."#,
        level = settings.level,
        case_rule = case_rule,
        portuguese_rule = portuguese_rule,
        focus_rule = focus_rule,
        note_rule = note_rule(&settings.note_language),
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
    fn beginner_replies_ask_for_a_guess_before_the_answer() {
        let beginner = Settings {
            level: "A1".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&beginner);
        assert!(prompt.contains("give one short hint first"));
        assert!(prompt.contains("invite them to guess the meaning"));

        let higher = Settings {
            level: "B1".to_string(),
            ..Settings::default()
        };
        assert!(!reply_system(&higher).contains("give one short hint first"));
    }

    #[test]
    fn beginner_challenges_never_include_the_english_answer() {
        let beginner = Settings {
            level: "A1".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&beginner);
        assert!(prompt.contains("must not contain that English answer"));
        assert!(prompt.contains("Keep the target phrase hidden"));
        assert!(prompt.contains("Never quote the English sentence"));
        assert!(prompt.contains("Never ask the learner to repeat"));
        assert!(prompt.contains("the question would make no sense"));

        let higher = Settings {
            level: "B1".to_string(),
            ..Settings::default()
        };
        assert!(!reply_system(&higher).contains("must not contain that English answer"));
    }

    #[test]
    fn beginner_replies_react_to_the_message_before_teaching() {
        let beginner = Settings {
            level: "A1".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&beginner);
        assert!(prompt.contains("Always answer what the learner actually sent"));
        assert!(prompt.contains("greeting, a very short answer or a change of subject"));
        assert!(prompt.contains("learn the words for that topic or just talk about it"));

        let higher = Settings {
            level: "B1".to_string(),
            ..Settings::default()
        };
        assert!(!reply_system(&higher).contains("Always answer what the learner actually sent"));
    }

    #[test]
    fn beginner_portuguese_replies_do_not_ask_for_repetition() {
        let settings = Settings {
            level: "A2".to_string(),
            reply_language: "pt".to_string(),
            ..Settings::default()
        };
        let prompt = reply_system(&settings);
        assert!(prompt.contains("Do not ask the learner to repeat or say it back"));
        assert!(!prompt.contains("ask the learner to guess or repeat it"));
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
    fn non_english_replies_leave_portuguese_messages_uncorrected() {
        for language in ["pt", "bilingual"] {
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

        let english = correction_system_prompt(&Settings::default());
        assert!(!english.contains("written only in Brazilian Portuguese"));
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
        assert!(!english_prompt.contains("Brazilian Portuguese"));

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
        assert!(!prompt.contains("Brazilian Portuguese"));
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
