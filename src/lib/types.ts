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
  proxyUrl: string;
  caCertPath: string;
  model: string;
  level: string;
  persona: string;
  personality: string;
  hotkey: string;
  autostart: boolean;
  startHidden: boolean;
  pinned: boolean;
  compact: boolean;
  popup: boolean;
  ignoreCapitalization: boolean;
  replyLanguage: string;
  translationChallenge: boolean;
  studyFocus: string;
  dailyGoal: number;
  reminders: boolean;
  theme: string;
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
  noteLanguage: string;
}

export interface DrillItem {
  id: number;
  wrong: string;
  right: string;
  note: string;
  streak: number;
  seen: number;
  context: string | null;
}

export interface DrillStats {
  total: number;
  due: number;
}

export interface LessonProgress {
  lessonId: string;
  step: number;
  completed: boolean;
  updatedAt: number;
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
  seen: number;
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
  archived: boolean;
  messages: number;
  preview: string | null;
}

export type LookSettings = Pick<
  Settings,
  | "shape"
  | "color"
  | "eyeStyle"
  | "eyeSize"
  | "eyeSpacing"
  | "eyeTilt"
  | "eyeColor"
  | "showMouth"
  | "mouthStyle"
  | "mouthSize"
  | "mouthColor"
>;

/** The original bubo face. Kept next to the default settings so the reset control never drifts. */
export const DEFAULT_LOOK: LookSettings = {
  shape: "round",
  color: "#8b7dff",
  eyeStyle: "bars",
  eyeSize: "large",
  eyeSpacing: "normal",
  eyeTilt: "straight",
  eyeColor: "auto",
  showMouth: false,
  mouthStyle: "line",
  mouthSize: "medium",
  mouthColor: "auto",
};

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "https://api.groq.com/openai/v1",
  proxyUrl: "",
  caCertPath: "",
  model: "openai/gpt-oss-120b",
  level: "B1",
  persona: "",
  personality: "warm_coach",
  hotkey: "Ctrl+Alt+B",
  autostart: false,
  startHidden: false,
  pinned: true,
  compact: false,
  popup: false,
  ignoreCapitalization: true,
  replyLanguage: "en",
  translationChallenge: true,
  studyFocus: "free",
  dailyGoal: 10,
  reminders: true,
  theme: "dark",
  ...DEFAULT_LOOK,
  showStatus: true,
  accentFromMascot: true,
  textSize: "normal",
  noteLanguage: "en",
};
