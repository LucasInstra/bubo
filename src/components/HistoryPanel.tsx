import { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "../lib/ipc";
import { useModalFocus } from "../lib/modal";
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
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useModalFocus(dialogRef);

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

  const startRename = (session: SessionSummary) => {
    setEditingId(session.id);
    setEditingTitle(session.title);
  };

  const saveRename = async (id: number) => {
    if (editingId !== id) return;
    const title = editingTitle;
    setEditingId(null);
    try {
      await ipc.renameSession(id, title);
      await load();
    } catch (problem) {
      setError(String(problem));
    }
  };

  const toggleArchive = async (session: SessionSummary) => {
    if (busy) return;
    setBusy(true);
    try {
      await ipc.archiveSession(session.id, !session.archived);
      await load();
    } catch (problem) {
      setError(String(problem));
    } finally {
      setBusy(false);
    }
  };

  const needle = query.trim().toLowerCase();
  const visible = (sessions ?? []).filter(
    (session) =>
      Boolean(session.archived) === showArchived &&
      (!needle ||
        session.title.toLowerCase().includes(needle) ||
        (session.preview ?? "").toLowerCase().includes(needle)),
  );

  return (
    <div
      className="settings history"
      role="dialog"
      aria-modal="true"
      aria-label="Histórico"
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="settings-head" data-tauri-drag-region>
        <button className="ghost" onClick={onClose} aria-label="Voltar">
          ←
        </button>
        <span>histórico</span>
        <button className="ghost history-new" onClick={() => void create()} disabled={busy}>
          + nova
        </button>
      </div>

      <div className="history-tools">
        <input
          className="history-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="buscar conversas"
          aria-label="Buscar conversas"
          spellCheck={false}
        />
        <button
          type="button"
          className={`ghost history-filter ${showArchived ? "on" : ""}`}
          aria-pressed={showArchived}
          onClick={() => setShowArchived((value) => !value)}
        >
          {showArchived ? "arquivadas" : "ativas"}
        </button>
      </div>

      <div className="settings-body history-body">
        {error ? (
          <p className="history-error">{error}</p>
        ) : sessions === null ? (
          <p className="hint">lendo suas conversas…</p>
        ) : visible.length === 0 ? (
          <p className="hint">
            {query.trim()
              ? "Nenhuma conversa corresponde a essa busca."
              : showArchived
                ? "Nenhuma conversa arquivada."
                : "Nenhuma conversa ainda. Comece uma e ela aparece aqui."}
          </p>
        ) : (
          visible.map((session) => (
            <div className="session-row" key={session.id}>
              {editingId === session.id ? (
                <input
                  className="session-rename-input"
                  value={editingTitle}
                  autoFocus
                  aria-label="Nome da conversa"
                  onChange={(event) => setEditingTitle(event.target.value)}
                  onBlur={() => void saveRename(session.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void saveRename(session.id);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingId(null);
                    }
                  }}
                />
              ) : (
                <button
                  className={`session-main ${session.id === currentSession ? "on" : ""}`}
                  onClick={() => void onOpen(session.id)}
                  onDoubleClick={() => startRename(session)}
                >
                  <span className="session-title">
                    {session.id === currentSession && <span className="session-dot" />}
                    {session.title || "Nova conversa"}
                  </span>
                  <span className="session-meta">
                    {formatDate(session.updatedAt)} · {session.messages}{" "}
                    {session.messages === 1 ? "mensagem" : "mensagens"}
                  </span>
                  {session.preview && <span className="session-preview">{session.preview}</span>}
                </button>
              )}
              <button
                className="ghost session-icon"
                title="Renomear conversa"
                aria-label="Renomear conversa"
                onClick={() => startRename(session)}
              >
                <span aria-hidden="true">✎</span>
              </button>
              <button
                className="ghost session-icon"
                title={session.archived ? "Desarquivar conversa" : "Arquivar conversa"}
                aria-label={session.archived ? "Desarquivar conversa" : "Arquivar conversa"}
                onClick={() => void toggleArchive(session)}
                disabled={busy}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 7h16M5 7v12h14V7M9 7V5h6v2" />
                  {session.archived ? <path d="M12 16v-6m0 0-2 2m2-2 2 2" /> : <path d="M9 12h6" />}
                </svg>
              </button>
              <button
                className={`ghost session-delete ${confirmId === session.id ? "confirm" : ""}`}
                title={
                  confirmId === session.id ? "Clique de novo para excluir" : "Excluir conversa"
                }
                aria-label="Excluir conversa"
                onClick={() => void remove(session.id)}
              >
                <span aria-hidden="true">×</span>
                {confirmId === session.id && <span className="session-delete-text">apagar</span>}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
