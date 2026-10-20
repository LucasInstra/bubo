import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Composer } from "./components/Composer";
import { Drill } from "./components/Drill";
import { Mascot } from "./components/Mascot";
import { Message } from "./components/Message";
import { SettingsPanel } from "./components/SettingsPanel";
import { parseStoredFixes } from "./lib/format";
import { ipc } from "./lib/ipc";
import type { Msg, OrbState, Settings, StoredMessage } from "./lib/types";
import { DEFAULT_SETTINGS } from "./lib/types";

const SUGGESTIONS = [
  "Hi bubo! I want to talk about my weekend.",
  "Fix this: I go to the gym yesterday.",
  "Teach me how to order coffee in a cafe.",
];

const STATUS_LABEL: Record<OrbState, string> = {
  idle: "here with you",
  thinking: "thinking",
  streaming: "writing",
};

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function fromStored(message: StoredMessage): Msg {
  return {
    id: String(message.id),
    dbId: message.id,
    role: message.role,
    content: message.content,
    fixes: parseStoredFixes(message.fixes),
  };
}

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasKey, setHasKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState<OrbState>("idle");
  const [energy, setEnergy] = useState(0);
  const [pinned, setPinned] = useState(true);
  const [due, setDue] = useState(0);
  const [showDrill, setShowDrill] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const turnRef = useRef(0);
  const busyRef = useRef(false);
  const requestRef = useRef<string | null>(null);
  const statusRef = useRef<OrbState>(status);
  statusRef.current = status;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [loadedSettings, loadedKey, stored] = await Promise.all([
          ipc.getSettings(),
          ipc.hasApiKey(),
          ipc.history(),
        ]);
        if (!alive) return;
        setSettings(loadedSettings);
        setPinned(loadedSettings.pinned);
        setHasKey(loadedKey);
        setMessages(stored.map(fromStored));
        if (!loadedKey) setShowSettings(true);
        const stats = await ipc.drillStats();
        if (alive) setDue(stats.due);
      } catch (error) {
        console.error("bubo failed to load", error);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void ipc.drillStats().then((stats) => setDue(stats.due)).catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list && stickRef.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showDrill) setShowDrill(false);
        else if (showSettings) setShowSettings(false);
        else void ipc.hideWindow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSettings, showDrill]);

  const runTurn = useCallback(
    async (text: string, base: Msg[] = messages) => {
      const value = text.trim();
      if (!value) return;

      const userMessage: Msg = {
        id: crypto.randomUUID(),
        role: "user",
        content: value,
        fixes: [],
      };
      const botMessage: Msg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        fixes: [],
        streaming: true,
      };

      const context = [...base, userMessage]
        .filter((message) => !message.error)
        .slice(-16)
        .map(({ role, content }) => ({ role, content }));

      const turn = turnRef.current + 1;
      turnRef.current = turn;
      const requestId = crypto.randomUUID();
      requestRef.current = requestId;

      setMessages((current) => [...current, userMessage, botMessage]);
      setStatus("thinking");
      setEnergy(0.15);

      let acc = "";
      try {
        const finalText = await ipc.chat(requestId, context, {
          onDelta: (delta) => {
            acc += delta;
            setStatus("streaming");
            setEnergy(Math.min(1, 0.15 + acc.length / 400));
            setMessages((current) =>
              current.map((message) =>
                message.id === botMessage.id ? { ...message, content: acc } : message,
              ),
            );
          },
          onDone: () => {
            // The reply is on screen and persisted; corrections can keep
            // running in the background without locking the composer.
            busyRef.current = false;
            setStatus("idle");
            setEnergy(0);
            setMessages((current) =>
              current.map((message) =>
                message.id === botMessage.id
                  ? { ...message, content: acc, streaming: false }
                  : message,
              ),
            );
          },
          onFixes: (fixes) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === botMessage.id ? { ...message, fixes } : message,
              ),
            );
          },
          onSaved: ({ userId, assistantId }) => {
            setMessages((current) =>
              current.map((message) => {
                if (message.id === botMessage.id) {
                  return { ...message, dbId: assistantId ?? undefined };
                }
                if (message.id === userMessage.id) {
                  return { ...message, dbId: userId ?? undefined };
                }
                return message;
              }),
            );
          },
        });

        setMessages((current) =>
          current.map((message) =>
            message.id === botMessage.id
              ? { ...message, content: finalText, streaming: false }
              : message,
          ),
        );
      } catch (problem) {
        const reason =
          typeof problem === "string"
            ? problem
            : problem instanceof Error
              ? problem.message
              : "Something went wrong.";
        if (reason === "cancelled") {
          setMessages((current) => current.filter((message) => message.id !== botMessage.id));
        } else {
          setMessages((current) =>
            current.map((message) =>
              message.id === botMessage.id
                ? { ...message, content: reason, streaming: false, error: true }
                : message,
            ),
          );
        }
      } finally {
        requestRef.current = null;
        // A newer turn owns the status now; do not reset it under its feet.
        if (turnRef.current === turn) {
          setStatus("idle");
          setEnergy(0);
        }
        busyRef.current = false;
        void ipc.drillStats().then((stats) => setDue(stats.due)).catch(console.error);
      }
    },
    [messages],
  );

  const send = useCallback(
    (text: string): boolean => {
      if (!text.trim() || busyRef.current || statusRef.current !== "idle") return false;
      if (!hasKey) {
        setShowSettings(true);
        return false;
      }
      busyRef.current = true;
      void runTurn(text);
      return true;
    },
    [hasKey, runTurn],
  );

  const retry = useCallback(
    (botMessage: Msg) => {
      if (statusRef.current !== "idle" || busyRef.current) return;
      if (!hasKey) {
        setShowSettings(true);
        return;
      }
      const index = messages.findIndex((message) => message.id === botMessage.id);
      if (index < 0) return;
      const user = messages
        .slice(0, index)
        .reverse()
        .find((message) => message.role === "user" && !message.error);
      if (!user) return;

      const base = messages.filter(
        (message) => message.id !== botMessage.id && message.id !== user.id,
      );
      setMessages(base);
      busyRef.current = true;
      void runTurn(user.content, base);
    },
    [messages, runTurn, hasKey],
  );

  const saveSettings = useCallback(
    async (next: Settings, apiKey: string) => {
      await ipc.saveSettings(next);
      if (apiKey.trim()) {
        await ipc.saveApiKey(apiKey.trim());
        setHasKey(true);
      }
      if (next.autostart !== settings.autostart) {
        await ipc.setAutostart(next.autostart);
      }
      setSettings(next);
      setPinned(next.pinned);
      setShowSettings(false);
    },
    [settings.autostart],
  );

  const togglePin = useCallback(() => {
    const next = !pinned;
    setPinned(next);
    void ipc.setPinned(next);
    const updated = { ...settings, pinned: next };
    setSettings(updated);
    void ipc.saveSettings(updated);
  }, [pinned, settings]);

  const newChat = useCallback(async () => {
    if (statusRef.current !== "idle") return;
    await ipc.clearHistory();
    setMessages([]);
  }, []);

  const stop = useCallback(() => {
    if (requestRef.current) void ipc.cancelReply(requestRef.current);
  }, []);

  const removeMessage = useCallback(async (message: Msg) => {
    if (message.dbId) {
      try {
        await ipc.deleteMessage(message.dbId);
      } catch (problem) {
        console.error("could not delete the message", problem);
        return;
      }
    }
    setMessages((current) => current.filter((item) => item.id !== message.id));
  }, []);

  const empty = messages.length === 0;
  const accent = settings.accentFromMascot ? settings.color : "#8b7dff";
  const accentVars = {
    "--accent": accent,
    "--accent-soft": withAlpha(accent, 0.16),
  } as CSSProperties;

  return (
    <div className={`app size-${settings.textSize}`} style={accentVars}>
      <div className="panel">
        <header className="head" data-tauri-drag-region>
          <div className="brand" data-tauri-drag-region>
            <strong>bubo</strong>
          </div>
          <div className="head-actions">
            <button
              className="ghost icon"
              title="New chat"
              aria-label="New chat"
              disabled={status !== "idle"}
              onClick={() => void newChat()}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              className="ghost icon"
              title={due > 0 ? `Practice ${due} corrections` : "Practice corrections"}
              aria-label="Practice"
              onClick={() => setShowDrill(true)}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="12" cy="12" r="2.6" fill="currentColor" />
              </svg>
              {due > 0 && <span className="badge">{due > 9 ? "9+" : due}</span>}
            </button>
            <button
              className={`ghost icon ${pinned ? "on" : ""}`}
              title={pinned ? "Unpin (let other windows cover bubo)" : "Keep bubo on top"}
              aria-label="Pin window"
              onClick={togglePin}
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 3h6l-1 6 3 3v1H7v-1l3-3-1-6z" />
                <path d="M12 13v8" />
              </svg>
            </button>
            <button
              className="ghost icon"
              title="Settings"
              aria-label="Settings"
              onClick={() => setShowSettings(true)}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path
                  d="M4 7h10M18 7h2M4 17h2M10 17h10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <circle cx="16" cy="7" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="8" cy="17" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
            <button
              className="ghost icon"
              title={`Hide (${settings.hotkey})`}
              aria-label="Hide"
              onClick={() => void ipc.hideWindow()}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path
                  d="M6 10l6 6 6-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </header>

        <div className="chat">
          <div className="chat-stage">
            <Mascot
              state={status}
              size={64}
              energy={energy}
              shape={settings.shape}
              color={settings.color}
              showMouth={settings.showMouth}
              eyeStyle={settings.eyeStyle}
              eyeSize={settings.eyeSize}
              boopable
            />
            {settings.showStatus && status !== "idle" && (
              <span className="status-pill">{STATUS_LABEL[status]}</span>
            )}
          </div>

          {empty && !showSettings ? (
            <div className="hero">
              <h1>Hey, I'm bubo.</h1>
              <p>
                Talk to me in English. I keep the conversation going and quietly show what a native
                speaker would have said.
              </p>
              <div className="suggestions">
                {due > 0 && (
                  <button className="chip chip-practice" onClick={() => setShowDrill(true)}>
                    Practice {due} {due === 1 ? "correction" : "corrections"} from our chats
                  </button>
                )}
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} className="chip" onClick={() => void send(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="messages"
              ref={listRef}
              onScroll={() => {
                const list = listRef.current;
                if (!list) return;
                stickRef.current =
                  list.scrollHeight - list.scrollTop - list.clientHeight < 48;
              }}
            >
              {messages.map((message) => (
                <Message
                  key={message.id}
                  message={message}
                  onRetry={message.error ? retry : undefined}
                  onDelete={removeMessage}
                />
              ))}
            </div>
          )}
        </div>

        <Composer
          disabled={status !== "idle"}
          busy={status !== "idle"}
          onSend={send}
          onStop={stop}
        />

        {showSettings && (
          <SettingsPanel
            settings={settings}
            hasKey={hasKey}
            onClose={() => setShowSettings(false)}
            onSave={saveSettings}
            onNewChat={newChat}
            onQueueChanged={() => void ipc.drillStats().then((stats) => setDue(stats.due))}
            onCorrectionsCleared={() =>
              setMessages((current) =>
                current.map((message) =>
                  message.fixes.length > 0 ? { ...message, fixes: [] } : message,
                ),
              )
            }
          />
        )}

        {showDrill && (
          <Drill
            onClose={() => {
              setShowDrill(false);
              void ipc.drillStats().then((stats) => setDue(stats.due));
            }}
          />
        )}
      </div>
    </div>
  );
}
