import type { Mood } from "./types";

/**
 * Words that map to a mascot mood. Each entry is checked in order, so the
 * first mood word found in a request wins when someone asks for two at once.
 */
const MOOD_WORDS: Array<{ mood: Mood; pattern: RegExp }> = [
  { mood: "happy", pattern: /\b(happy|smiling|smile|grinning|grin|joyful|cheerful)\b/ },
  { mood: "sad", pattern: /\b(sad|unhappy|frowning|frown|crying|cry|teary)\b/ },
  {
    mood: "surprised",
    pattern: /\b(surprised|surprising|surprise|shocked|amazed|astonished)\b/,
  },
  { mood: "proud", pattern: /\b(proud)\b/ },
];

const REQUEST_VERB = /\b(do|make|show|give|put on|act|be|look|want|see)\b/;
const FACE_WORD = /\b(face|look|expression|mood)\b/;

/**
 * Detects a direct request for a face or emotion, like "do a happy face",
 * "act surprised" or "surprise me". Everyday mentions ("I had a happy
 * weekend") are ignored; the mood word has to sit next to a request verb or
 * next to a face word.
 */
export function moodRequest(text: string): Mood | null {
  const value = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!value) return null;

  if (/\bsurprise me\b/.test(value)) return "surprised";

  const standalone = value.match(
    /^(?:please\s+)?(?:can you\s+|could you\s+)?(smile|frown|grin)(?:\s+for me)?[.!?]*$/,
  );
  if (standalone) return standalone[1] === "frown" ? "sad" : "happy";

  for (const { mood, pattern } of MOOD_WORDS) {
    const match = pattern.exec(value);
    if (!match) continue;
    const index = match.index;
    const window = value.slice(Math.max(0, index - 34), index + match[0].length + 16);
    if (REQUEST_VERB.test(window) || FACE_WORD.test(window)) return mood;
  }

  return null;
}
