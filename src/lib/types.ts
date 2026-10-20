export type Role = "user" | "assistant";

export type OrbState = "idle" | "thinking" | "streaming";

export interface Fix {
  wrong: string;
  right: string;
  note: string;
}

export interface Msg {
  id: string;
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
  hotkey: string;
  autostart: boolean;
}

export interface StoredMessage {
  id: number;
  role: Role;
  content: string;
  fixes: string | null;
  createdAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "https://api.groq.com/openai/v1",
  model: "openai/gpt-oss-120b",
  level: "B1",
  persona: "",
  hotkey: "Ctrl+Alt+B",
  autostart: false,
};
