import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DrillItem, DrillStats, Fix, Msg, Settings, StoredMessage } from "./types";

interface DeltaEvent {
  requestId: string;
  delta: string;
}

interface DoneEvent {
  requestId: string;
}

interface FixesEvent {
  requestId: string;
  fixes: Fix[];
}

interface SavedEvent {
  requestId: string;
  userId: number | null;
  assistantId: number | null;
}

export interface ChatHandlers {
  onDelta: (delta: string) => void;
  onDone: () => void;
  onFixes: (fixes: Fix[]) => void;
  onSaved: (ids: { userId: number | null; assistantId: number | null }) => void;
}

export const ipc = {
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  hasApiKey: () => invoke<boolean>("has_api_key"),
  saveApiKey: (key: string) => invoke<void>("save_api_key", { key }),
  setAutostart: (enabled: boolean) => invoke<void>("set_autostart", { enabled }),
  setPinned: (pinned: boolean) => invoke<void>("set_pinned", { pinned }),
  history: () => invoke<StoredMessage[]>("history"),
  clearHistory: () => invoke<void>("clear_history"),
  deleteMessage: (id: number) => invoke<void>("delete_message", { id }),
  drillStats: () => invoke<DrillStats>("drill_stats"),
  drillNext: (includeFuture: boolean, excludeId: number | null = null) =>
    invoke<DrillItem | null>("drill_next", { includeFuture, excludeId }),
  drillReview: (id: number, correct: boolean) =>
    invoke<DrillItem | null>("drill_review", { id, correct }),
  drillSkipDue: () => invoke<number>("drill_skip_due"),
  drillReset: () => invoke<number>("drill_reset"),
  hideWindow: () => invoke<void>("hide_window"),
  quit: () => invoke<void>("quit_app"),
  cancelReply: (requestId: string) => invoke<void>("cancel_reply", { requestId }),

  async chat(
    requestId: string,
    messages: Array<Pick<Msg, "role" | "content">>,
    handlers: ChatHandlers,
  ): Promise<string> {
    const unlisteners = await Promise.all([
      listen<DeltaEvent>("bubo-delta", (event) => {
        if (event.payload.requestId === requestId) handlers.onDelta(event.payload.delta);
      }),
      listen<DoneEvent>("bubo-reply-done", (event) => {
        if (event.payload.requestId === requestId) handlers.onDone();
      }),
      listen<FixesEvent>("bubo-fixes", (event) => {
        if (event.payload.requestId === requestId) handlers.onFixes(event.payload.fixes);
      }),
      listen<SavedEvent>("bubo-saved", (event) => {
        if (event.payload.requestId === requestId) {
          handlers.onSaved({
            userId: event.payload.userId,
            assistantId: event.payload.assistantId,
          });
        }
      }),
    ]);

    try {
      return await invoke<string>("chat", {
        requestId,
        messages: messages.map(({ role, content }) => ({ role, content })),
      });
    } finally {
      unlisteners.forEach((unlisten) => unlisten());
    }
  },
};
