export type Role = "user" | "assistant";

export type OrbState = "idle" | "thinking" | "streaming";

export type Mood = "idle" | "happy" | "sad" | "surprised" | "proud";

export interface Fix {
  wrong: string;
  right: string;
  note: string;
}

export interface Msg {
  id: string;
  dbId?: number;
  role: Role;
  content: string;
  fixes: Fix[];
  streaming?: boolean;
  error?: boolean;
}

export interface Settings {
  baseUrl: string;
  model: string;
  level: string;
  persona: string;
  personality: string;
  hotkey: string;
  autostart: boolean;
  pinned: boolean;
  compact: boolean;
  ignoreCapitalization: boolean;
  shape: string;
  color: string;
  showMouth: boolean;
  mouthStyle: string;
  mouthSize: string;
  mouthColor: string;
  showStatus: boolean;
  accentFromMascot: boolean;
  textSize: string;
  eyeStyle: string;
  eyeSize: string;
  eyeSpacing: string;
  eyeTilt: string;
  eyeColor: string;
}

export interface DrillItem {
  id: number;
  wrong: string;
  right: string;
  note: string;
  streak: number;
  context: string | null;
}

export interface DrillStats {
  total: number;
  due: number;
}

export interface DayActivity {
  date: string;
  messages: number;
  reviews: number;
  correct: number;
}

export interface TopMistake {
  wrong: string;
  right: string;
  note: string;
  streak: number;
  attempts: number;
  correct: number;
}

export interface ProgressStats {
  streak: number;
  messages: number;
  cards: number;
  due: number;
  reviews: number;
  correct: number;
  accuracy: number;
  days: DayActivity[];
  top: TopMistake[];
}

export interface StoredMessage {
  id: number;
  role: Role;
  content: string;
  fixes: string | null;
  createdAt: number;
}

export interface SessionSummary {
  id: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: number;
  preview: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "https://api.groq.com/openai/v1",
  model: "openai/gpt-oss-120b",
  level: "B1",
  persona: "",
  personality: "warm_coach",
  hotkey: "Ctrl+Alt+B",
  autostart: false,
  pinned: true,
  compact: false,
  ignoreCapitalization: true,
  shape: "round",
  color: "#8b7dff",
  showMouth: true,
  mouthStyle: "line",
  mouthSize: "medium",
  mouthColor: "auto",
  showStatus: true,
  accentFromMascot: true,
  textSize: "normal",
  eyeStyle: "bars",
  eyeSize: "medium",
  eyeSpacing: "normal",
  eyeTilt: "soft",
  eyeColor: "auto",
};
