import type { Settings } from "./types";

export interface PersonalityLook {
  shape: string;
  color: string;
  eyeStyle: string;
  eyeSize: string;
  eyeSpacing: string;
  eyeTilt: string;
}

export interface Personality {
  id: string;
  label: string;
  vibe: string;
  look: PersonalityLook;
}

/**
 * Ready-made characters. Each one bundles a tone (owned by the Rust prompt)
 * with a look, so a single click gives a coherent buddy instead of a random
 * pile of options. Looks stay editable afterwards.
 */
export const PERSONALITIES: Personality[] = [
  {
    id: "warm_coach",
    label: "Warm Coach",
    vibe: "steady, believes in you",
    look: {
      shape: "round",
      color: "#f59e0b",
      eyeStyle: "bars",
      eyeSize: "medium",
      eyeSpacing: "normal",
      eyeTilt: "soft",
    },
  },
  {
    id: "hype_friend",
    label: "Hype Friend",
    vibe: "loud best friend",
    look: {
      shape: "cloud",
      color: "#ec4899",
      eyeStyle: "sparkle",
      eyeSize: "large",
      eyeSpacing: "wide",
      eyeTilt: "sharp",
    },
  },
  {
    id: "playful_tease",
    label: "Playful Tease",
    vibe: "cheeky sibling",
    look: {
      shape: "blob",
      color: "#f97316",
      eyeStyle: "wink",
      eyeSize: "medium",
      eyeSpacing: "normal",
      eyeTilt: "sharp",
    },
  },
  {
    id: "friendly_rival",
    label: "Friendly Rival",
    vibe: "scoreboard energy",
    look: {
      shape: "star",
      color: "#22c55e",
      eyeStyle: "bars",
      eyeSize: "medium",
      eyeSpacing: "wide",
      eyeTilt: "sharp",
    },
  },
  {
    id: "calm_mentor",
    label: "Calm Mentor",
    vibe: "unhurried elder",
    look: {
      shape: "oval",
      color: "#14b8a6",
      eyeStyle: "arcs",
      eyeSize: "small",
      eyeSpacing: "close",
      eyeTilt: "soft",
    },
  },
  {
    id: "gentle_guide",
    label: "Gentle Guide",
    vibe: "soft, low pressure",
    look: {
      shape: "egg",
      color: "#8b5cf6",
      eyeStyle: "dots",
      eyeSize: "small",
      eyeSpacing: "close",
      eyeTilt: "soft",
    },
  },
  {
    id: "curious_nerd",
    label: "Curious Nerd",
    vibe: "delighted by details",
    look: {
      shape: "hexagon",
      color: "#3b82f6",
      eyeStyle: "ring",
      eyeSize: "medium",
      eyeSpacing: "wide",
      eyeTilt: "straight",
    },
  },
  {
    id: "dry_wit",
    label: "Dry Wit",
    vibe: "deadpan, secretly fond",
    look: {
      shape: "square",
      color: "#a9714b",
      eyeStyle: "sleepy",
      eyeSize: "medium",
      eyeSpacing: "normal",
      eyeTilt: "straight",
    },
  },
  {
    id: "strict_examiner",
    label: "Strict Examiner",
    vibe: "no fluff, high bar",
    look: {
      shape: "diamond",
      color: "#ef4444",
      eyeStyle: "angry",
      eyeSize: "medium",
      eyeSpacing: "close",
      eyeTilt: "sharp",
    },
  },
];

export const DEFAULT_PERSONALITY = PERSONALITIES[0].id;

export function personality(id: string): Personality {
  return PERSONALITIES.find((preset) => preset.id === id) ?? PERSONALITIES[0];
}

export function personalityPatch(id: string): Partial<Settings> {
  const preset = personality(id);
  return { personality: preset.id, ...preset.look };
}
