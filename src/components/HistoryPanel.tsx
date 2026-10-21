import { useCallback, useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import type { SessionSummary } from "../lib/types";

interface HistoryPanelProps {
  currentSession: number | null;
  onClose: () => void;
  onOpen: (id: number) => Promise<void>;
  onNew: (id: number) => Promise<void>;
  onCurrentChanged: (id: number) => Promise<void>;
}

function formatDate(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function HistoryPanel({
  currentSession,
  onClose,
  onOpen,
  onNew,
  onCurrentChanged,
}: HistoryPanelProps) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSessions(await ipc.listSessions());
      setError("");
    } catch (problem) {
      setError(String(problem));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (confirmId === null) return;
    const timer = setTimeout(() => setConfirmId(null), 4000);
    return () => clearTimeout(timer);
  }, [confirmId]);

  useEffect(() => {
    const chat = document.querySelector<HTMLElement>(".chat");
    const composer = document.querySelector<HTMLElement>(".composer");
    chat?.setAttribute("inert", "");
    composer?.setAttribute("inert", "");
    return () => {
      chat?.removeAttribute("inert");
      composer?.removeAttribute("inert");
    };
  }, []);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await ipc.newSession();
      await onNew(id);
    } catch (problem) {
      setError(String(problem));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (busy) return;
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setBusy(true);
    try {
      const next = await ipc.deleteSession(id);
      setConfirmId(null);
      await load();
      if (id === currentSession) await onCurrentChanged(next);
    } catch (problem) {
      setError(String(problem));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings history" role="dialog" aria-modal="true" aria-label="History">
      <div className="settings-head" data-tauri-drag-region>
        <button className="ghost" onClick={onClose} aria-label="Back">
          ←
        </button>
        <span>history</span>
        <button className="ghost history-new" onClick={() => void create()} disabled={busy}>
          + new
        </button>
      </div>

      <div className="settings-body history-body">
        {error ? (
          <p className="history-error">{error}</p>
        ) : sessions === null ? (
          <p className="hint">reading your conversations…</p>
        ) : sessions.length === 0 ? (
          <p className="hint">No conversations yet. Start one and it will show up here.</p>
        ) : (
          sessions.map((session) => (
            <div className="session-row" key={session.id}>
              <button
                className={`session-main ${session.id === currentSession ? "on" : ""}`}
                onClick={() => void onOpen(session.id)}
              >
                <span className="session-title">
                  {session.id === currentSession && <span className="session-dot" />}
                  {session.title || "New chat"}
                </span>
                <span className="session-meta">
                  {formatDate(session.updatedAt)} · {session.messages}{" "}
                  {session.messages === 1 ? "message" : "messages"}
                </span>
                {session.preview && <span className="session-preview">{session.preview}</span>}
              </button>
              <button
                className={`ghost session-delete ${confirmId === session.id ? "confirm" : ""}`}
                title={confirmId === session.id ? "Click again to delete" : "Delete conversation"}
                aria-label="Delete conversation"
                onClick={() => void remove(session.id)}
              >
                {confirmId === session.id ? "erase" : "×"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
