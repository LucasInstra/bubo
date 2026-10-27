import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  DrillItem,
  DrillStats,
  Fix,
  LessonProgress,
  Msg,
  ProgressStats,
  SessionSummary,
  Settings,
  StoredMessage,
} from "./types";

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

export interface ConnectionTest {
  message: string;
  models: string[];
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
  testConnection: (settings: Settings, apiKey: string) =>
    invoke<ConnectionTest>("test_connection", { settings, apiKey: apiKey || null }),
  setAutostart: (enabled: boolean) => invoke<void>("set_autostart", { enabled }),
  setPinned: (pinned: boolean) => invoke<void>("set_pinned", { pinned }),
  setCompact: (compact: boolean) => invoke<void>("set_compact", { compact }),
  setPopup: (popup: boolean) => invoke<void>("set_popup", { popup }),
  setPopupStage: (stage: "face" | "input" | "reply") => invoke<void>("set_popup_stage", { stage }),
  onWindowBlur: (handler: () => void) => listen("bubo-blur", handler),
  history: () => invoke<StoredMessage[]>("history"),
  startupNotice: () => invoke<string | null>("startup_notice"),
  currentSession: () => invoke<number>("current_session"),
  listSessions: () => invoke<SessionSummary[]>("list_sessions"),
  newSession: () => invoke<number>("new_session"),
  openSession: (id: number) => invoke<StoredMessage[]>("open_session", { id }),
  deleteSession: (id: number) => invoke<number>("delete_session", { id }),
  renameSession: (id: number, title: string) => invoke<void>("rename_session", { id, title }),
  archiveSession: (id: number, archived: boolean) =>
    invoke<void>("archive_session", { id, archived }),
  clearHistory: () => invoke<void>("clear_history"),
  backupData: (path: string) => invoke<void>("backup_data", { path }),
  restoreData: (path: string) => invoke<void>("restore_data", { path }),
  openDataFolder: () => invoke<void>("open_data_folder"),
  openFeedback: () => invoke<void>("open_feedback"),
  openProviderSite: (provider: string) => invoke<void>("open_provider_site", { provider }),
  diagnostics: () => invoke<string>("diagnostics"),
  deleteMessage: (id: number) => invoke<void>("delete_message", { id }),
  lessonProgress: () => invoke<LessonProgress[]>("lesson_progress"),
  saveLessonProgress: (lessonId: string, step: number, completed: boolean) =>
    invoke<void>("save_lesson_progress", { lessonId, step, completed }),
  saveLessonFix: (wrong: string, right: string, note: string) =>
    invoke<void>("save_lesson_fix", { wrong, right, note }),
  saveAssistantMessage: (content: string) => invoke<number>("save_assistant_message", { content }),
  drillStats: () => invoke<DrillStats>("drill_stats"),
  progressStats: () => invoke<ProgressStats>("progress_stats"),
  drillNext: (includeFuture: boolean, excludeId: number | null = null) =>
    invoke<DrillItem | null>("drill_next", { includeFuture, excludeId }),
  drillReview: (id: number, correct: boolean) =>
    invoke<DrillItem | null>("drill_review", { id, correct }),
  drillOverride: (id: number) => invoke<DrillItem | null>("drill_override", { id }),
  drillFocus: (wrong: string, right: string) =>
    invoke<DrillItem | null>("drill_focus", { wrong, right }),
  deleteFix: (messageId: number, wrong: string, right: string) =>
    invoke<void>("delete_fix", { messageId, wrong, right }),
  explainFix: (wrong: string, right: string, note: string) =>
    invoke<string>("explain_fix", { wrong, right, note }),
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
