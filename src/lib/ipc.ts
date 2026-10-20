import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Msg, Settings, StoredMessage } from "./types";

interface DeltaEvent {
  requestId: string;
  delta: string;
}

export const ipc = {
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  hasApiKey: () => invoke<boolean>("has_api_key"),
  saveApiKey: (key: string) => invoke<void>("save_api_key", { key }),
  setAutostart: (enabled: boolean) => invoke<void>("set_autostart", { enabled }),
  history: () => invoke<StoredMessage[]>("history"),
  clearHistory: () => invoke<void>("clear_history"),
  hideWindow: () => invoke<void>("hide_window"),
  quit: () => invoke<void>("quit_app"),

  async chat(
    messages: Array<Pick<Msg, "role" | "content">>,
    onDelta: (delta: string) => void,
  ): Promise<string> {
    const requestId = crypto.randomUUID();
    const unlisten = await listen<DeltaEvent>("bubo-delta", (event) => {
      if (event.payload.requestId === requestId) {
        onDelta(event.payload.delta);
      }
    });
    try {
      return await invoke<string>("chat", {
        requestId,
        messages: messages.map(({ role, content }) => ({ role, content })),
      });
    } finally {
      unlisten();
    }
  },
};
