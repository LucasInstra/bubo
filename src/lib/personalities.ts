export const MOUTH_STYLES = ["line", "smile", "grin", "cat", "open", "flat"] as const;
export const MOUTH_SIZES = ["small", "medium", "large"] as const;
export const MOUTH_COLORS = [
  "auto",
  "#fcfcff",
  "#241d33",
  "#ec4899",
  "#ef4444",
  "#f59e0b",
] as const;

export interface PersonalityPreview {
  shape: string;
  color: string;
  eyeStyle: string;
  eyeSize: string;
  eyeSpacing: string;
  eyeTilt: string;
  showMouth: boolean;
  mouthStyle: string;
  mouthSize: string;
  mouthColor: string;
}

export interface Personality {
  id: string;
  label: string;
  vibe: string;
  /** Illustrative look for the picker only. Picking a voice never applies it. */
  preview: PersonalityPreview;
}

/**
 * Ready-made voices for the tutor. A preset changes the tone only, never the
 * learner's mascot. The matching prompt lives in src-tauri/src/prompt.rs.
 */
export const PERSONALITIES: Personality[] = [
  {
    id: "warm_coach",
    label: "Warm Coach",
    vibe: "steady, believes in you",
    preview: {
      shape: "round",
      color: "#f59e0b",
      eyeStyle: "bars",
      eyeSize: "medium",
      eyeSpacing: "normal",
      eyeTilt: "soft",
      showMouth: true,
      mouthStyle: "smile",
      mouthSize: "medium",
      mouthColor: "#241d33",
    },
  },
  {
    id: "hype_friend",
    label: "Hype Friend",
    vibe: "loud best friend",
    preview: {
      shape: "cloud",
      color: "#ec4899",
      eyeStyle: "sparkle",
      eyeSize: "large",
      eyeSpacing: "wide",
      eyeTilt: "sharp",
      showMouth: true,
      mouthStyle: "grin",
      mouthSize: "large",
      mouthColor: "#241d33",
    },
  },
  {
    id: "playful_tease",
    label: "Playful Tease",
    vibe: "cheeky sibling",
    preview: {
      shape: "blob",
      color: "#f97316",
      eyeStyle: "wink",
      eyeSize: "medium",
      eyeSpacing: "normal",
      eyeTilt: "sharp",
      showMouth: true,
      mouthStyle: "cat",
      mouthSize: "medium",
      mouthColor: "#241d33",
    },
  },
  {
    id: "friendly_rival",
    label: "Friendly Rival",
    vibe: "scoreboard energy",
    preview: {
      shape: "star",
      color: "#22c55e",
      eyeStyle: "bars",
      eyeSize: "medium",
      eyeSpacing: "wide",
      eyeTilt: "sharp",
      showMouth: true,
      mouthStyle: "grin",
      mouthSize: "medium",
      mouthColor: "#fcfcff",
    },
  },
  {
    id: "calm_mentor",
    label: "Calm Mentor",
    vibe: "unhurried elder",
    preview: {
      shape: "oval",
      color: "#14b8a6",
      eyeStyle: "arcs",
      eyeSize: "small",
      eyeSpacing: "close",
      eyeTilt: "soft",
      showMouth: true,
      mouthStyle: "line",
      mouthSize: "small",
      mouthColor: "#241d33",
    },
  },
  {
    id: "gentle_guide",
    label: "Gentle Guide",
    vibe: "soft, low pressure",
    preview: {
      shape: "egg",
      color: "#8b5cf6",
      eyeStyle: "dots",
      eyeSize: "small",
      eyeSpacing: "close",
      eyeTilt: "soft",
      showMouth: true,
      mouthStyle: "smile",
      mouthSize: "small",
      mouthColor: "#fcfcff",
    },
  },
  {
    id: "curious_nerd",
    label: "Curious Nerd",
    vibe: "delighted by details",
    preview: {
      shape: "hexagon",
      color: "#3b82f6",
      eyeStyle: "ring",
      eyeSize: "medium",
      eyeSpacing: "wide",
      eyeTilt: "straight",
      showMouth: true,
      mouthStyle: "open",
      mouthSize: "small",
      mouthColor: "#241d33",
    },
  },
  {
    id: "dry_wit",
    label: "Dry Wit",
    vibe: "deadpan, secretly fond",
    preview: {
      shape: "square",
      color: "#a9714b",
      eyeStyle: "sleepy",
      eyeSize: "medium",
      eyeSpacing: "normal",
      eyeTilt: "straight",
      showMouth: true,
      mouthStyle: "flat",
      mouthSize: "medium",
      mouthColor: "#fcfcff",
    },
  },
  {
    id: "strict_examiner",
    label: "Strict Examiner",
    vibe: "no fluff, high bar",
    preview: {
      shape: "diamond",
      color: "#ef4444",
      eyeStyle: "angry",
      eyeSize: "medium",
      eyeSpacing: "close",
      eyeTilt: "sharp",
      showMouth: true,
      mouthStyle: "flat",
      mouthSize: "small",
      mouthColor: "#241d33",
    },
  },
  {
    id: "shy_penpal",
    label: "Shy Pen Pal",
    vibe: "quiet at first, warm once you know them",
    preview: {
      shape: "drop",
      color: "#38bdf8",
      eyeStyle: "dots",
      eyeSize: "small",
      eyeSpacing: "close",
      eyeTilt: "straight",
      showMouth: true,
      mouthStyle: "smile",
      mouthSize: "small",
      mouthColor: "#241d33",
    },
  },
  {
    id: "storyteller",
    label: "Storyteller",
    vibe: "every reply turns into a small story",
    preview: {
      shape: "pill",
      color: "#eab308",
      eyeStyle: "sparkle",
      eyeSize: "large",
      eyeSpacing: "normal",
      eyeTilt: "soft",
      showMouth: true,
      mouthStyle: "open",
      mouthSize: "medium",
      mouthColor: "#241d33",
    },
  },
  {
    id: "night_owl",
    label: "Night Owl",
    vibe: "calm late-night company, dry humor",
    preview: {
      shape: "triangle",
      color: "#334155",
      eyeStyle: "sleepy",
      eyeSize: "large",
      eyeSpacing: "wide",
      eyeTilt: "straight",
      showMouth: true,
      mouthStyle: "flat",
      mouthSize: "medium",
      mouthColor: "#f59e0b",
    },
  },
];

export const DEFAULT_PERSONALITY = PERSONALITIES[0].id;

export function personality(id: string): Personality {
  return PERSONALITIES.find((preset) => preset.id === id) ?? PERSONALITIES[0];
}
