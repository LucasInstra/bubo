export interface Personality {
  id: string;
  label: string;
  vibe: string;
}

/**
 * Ready-made voices for the tutor. A preset changes the tone only, never the
 * look: eyes, shape and colors stay exactly where the learner put them.
 * The matching prompt lives in src-tauri/src/prompt.rs.
 */
export const PERSONALITIES: Personality[] = [
  { id: "warm_coach", label: "Warm Coach", vibe: "steady, believes in you" },
  { id: "hype_friend", label: "Hype Friend", vibe: "loud best friend" },
  { id: "playful_tease", label: "Playful Tease", vibe: "cheeky sibling" },
  { id: "friendly_rival", label: "Friendly Rival", vibe: "scoreboard energy" },
  { id: "calm_mentor", label: "Calm Mentor", vibe: "unhurried elder" },
  { id: "gentle_guide", label: "Gentle Guide", vibe: "soft, low pressure" },
  { id: "curious_nerd", label: "Curious Nerd", vibe: "delighted by details" },
  { id: "dry_wit", label: "Dry Wit", vibe: "deadpan, secretly fond" },
  { id: "strict_examiner", label: "Strict Examiner", vibe: "no fluff, high bar" },
];

export const DEFAULT_PERSONALITY = PERSONALITIES[0].id;

export function personality(id: string): Personality {
  return PERSONALITIES.find((preset) => preset.id === id) ?? PERSONALITIES[0];
}
