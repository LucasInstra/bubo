import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Composer } from "./components/Composer";
import { BuddyPanel } from "./components/BuddyPanel";
import { CompactView } from "./components/CompactView";
import { Drill } from "./components/Drill";
import { HistoryPanel } from "./components/HistoryPanel";
import { Mascot } from "./components/Mascot";
import { Message } from "./components/Message";
import { PopupView, type PopupStage } from "./components/PopupView";
import { ProgressPanel } from "./components/ProgressPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { UpdateBanner } from "./components/UpdateBanner";
import { BUILD_LABEL } from "./lib/build";
import { trimContext } from "./lib/context";
import { parseStoredFixes } from "./lib/format";
import { ipc } from "./lib/ipc";
import { moodRequest } from "./lib/mood";
import type { Fix, Mood, Msg, OrbState, Settings, StoredMessage } from "./lib/types";
import { DEFAULT_SETTINGS } from "./lib/types";
import { useUpdater } from "./lib/updater";

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
  const [showBuddy, setShowBuddy] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [mood, setMood] = useState<Mood>("idle");
  const [status, setStatus] = useState<OrbState>("idle");
  const [energy, setEnergy] = useState(0);
  const [pinned, setPinned] = useState(true);
  const [due, setDue] = useState(0);
  const [showDrill, setShowDrill] = useState(false);
  const [drillFocus, setDrillFocus] = useState<Fix | null>(null);
  const [popupStage, setPopupStage] = useState<PopupStage>("face");
  const [stageSize, setStageSize] = useState(76);
  const [contextTrimmed, setContextTrimmed] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  const updater = useUpdater();

  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const turnRef = useRef(0);
  const busyRef = useRef(false);
  const requestRef = useRef<string | null>(null);
  const moodTimer = useRef<number | null>(null);
  const statusRef = useRef<OrbState>(status);
  statusRef.current = status;
  const popupStageRef = useRef(popupStage);
  popupStageRef.current = popupStage;
  const changePopupStage = useCallback((next: PopupStage) => {
    setPopupStage(next);
    void ipc.setPopupStage(next).catch(() => {
      // the window may be gone; the stage state does not matter anymore
    });
  }, []);

  const react = useCallback((next: Mood, ms = 1500) => {
    setMood(next);
    if (moodTimer.current) window.clearTimeout(moodTimer.current);
    moodTimer.current = window.setTimeout(() => setMood("idle"), ms);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [loadedSettings, loadedKey, stored, loadedSession] = await Promise.all([
          ipc.getSettings(),
          ipc.hasApiKey(),
          ipc.history(),
          ipc.currentSession(),
        ]);
        if (!alive) return;
        setSettings(loadedSettings);
        setPinned(loadedSettings.pinned);
        setHasKey(loadedKey);
        setSessionId(loadedSession);
        setMessages(stored.map(fromStored));
        if (loadedSettings.popup) {
          if (loadedKey) void ipc.setPopup(true);
          else void ipc.setPopup(false);
        } else {
          void ipc.setCompact(loadedSettings.compact);
        }
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
      void ipc
        .drillStats()
        .then((stats) => setDue(stats.due))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list && stickRef.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (updater.status !== "available") setUpdateDismissed(false);
  }, [updater.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (settings.popup && popupStage !== "face") {
          changePopupStage("face");
        } else if (settings.popup) {
          void ipc.hideWindow();
        } else if (showDrill) {
          setShowDrill(false);
          setDrillFocus(null);
        } else if (showProgress) setShowProgress(false);
        else if (showHistory) setShowHistory(false);
        else if (showBuddy) setShowBuddy(false);
        else if (showSettings) setShowSettings(false);
        else void ipc.hideWindow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    showSettings,
    showBuddy,
    showProgress,
    showHistory,
    showDrill,
    settings.popup,
    popupStage,
    changePopupStage,
  ]);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    void ipc
      .onWindowBlur(() => {
        if (popupStageRef.current !== "face") changePopupStage("face");
      })
      .then((stop) => {
        if (alive) unlisten = stop;
        else stop();
      })
      .catch(() => {});
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [changePopupStage]);

  useEffect(
    () => () => {
      if (moodTimer.current) window.clearTimeout(moodTimer.current);
    },
    [],
  );

  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      setStageSize(Math.max(62, Math.min(104, Math.round(width * 0.19))));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [settings.compact]);

  const runTurn = useCallback(
    async (text: string, requestedMood: Mood | null = null, base: Msg[] = messages) => {
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

      const trimmed = trimContext([...base, userMessage]);
      setContextTrimmed(trimmed.trimmed);
      const context = trimmed.messages.map(({ role, content }) => ({ role, content }));

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
            // A requested face gets the stage after the reply; the usual happy
            // nod is only for regular replies.
            react(requestedMood ?? "happy", requestedMood ? 4200 : 1200);
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
          react("sad", 1600);
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
        void ipc
          .drillStats()
          .then((stats) => setDue(stats.due))
          .catch(console.error);
      }
    },
    [messages, react],
  );

  const send = useCallback(
    (text: string): boolean => {
      if (!text.trim() || busyRef.current || statusRef.current !== "idle") return false;
      if (!hasKey) {
        setShowBuddy(false);
        setShowSettings(true);
        return false;
      }
      // "do a happy face" is handled locally, but the face waits: bubo thinks
      // and answers first, then holds the requested expression for a moment.
      const requestedMood = moodRequest(text);
      busyRef.current = true;
      void runTurn(text, requestedMood);
      return true;
    },
    [hasKey, runTurn],
  );

  const sendFromPopup = useCallback(
    (text: string): boolean => {
      const sent = send(text);
      if (sent) changePopupStage("reply");
      return sent;
    },
    [send, changePopupStage],
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
      void runTurn(user.content, null, base);
    },
    [messages, runTurn, hasKey],
  );

  const saveSettings = useCallback(
    async (nextSettings: Settings, apiKey: string) => {
      const next = nextSettings.popup ? { ...nextSettings, compact: false } : nextSettings;
      await ipc.saveSettings(next);
      if (apiKey.trim()) {
        await ipc.saveApiKey(apiKey.trim());
        setHasKey(true);
      }
      if (next.autostart !== settings.autostart) {
        await ipc.setAutostart(next.autostart);
      }
      if (next.popup && !settings.popup) {
        setPopupStage("face");
        await ipc.setPopup(true);
      } else if (!next.popup && settings.popup) {
        await ipc.setPopup(false);
        setPopupStage("face");
        if (next.compact) await ipc.setCompact(true);
      } else if (!next.popup && next.compact !== settings.compact) {
        await ipc.setCompact(next.compact);
      }
      setSettings(next);
      setPinned(next.pinned);
      setShowSettings(false);
      setShowBuddy(false);
    },
    [settings.autostart, settings.compact, settings.popup],
  );

  const enterPopup = useCallback(() => {
    const updated = { ...settings, popup: true, compact: false };
    setSettings(updated);
    setPopupStage("face");
    setShowSettings(false);
    setShowBuddy(false);
    setShowProgress(false);
    setShowHistory(false);
    setShowDrill(false);
    void ipc.saveSettings(updated);
    void ipc.setPopup(true);
  }, [settings]);

  const exitPopup = useCallback(() => {
    const updated = { ...settings, popup: false, compact: false };
    setSettings(updated);
    setPopupStage("face");
    void ipc.saveSettings(updated);
    void ipc.setPopup(false);
  }, [settings]);

  const toggleCompact = useCallback(() => {
    if (settings.popup) {
      const updated = { ...settings, popup: false, compact: true };
      setSettings(updated);
      setPopupStage("face");
      void ipc.saveSettings(updated);
      void (async () => {
        await ipc.setPopup(false);
        await ipc.setCompact(true);
      })();
      return;
    }
    const next = !settings.compact;
    const updated = { ...settings, compact: next };
    setSettings(updated);
    setShowSettings(false);
    setShowBuddy(false);
    void ipc.saveSettings(updated);
    void ipc.setCompact(next);
  }, [settings]);

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
    const id = await ipc.newSession();
    setSessionId(id);
    setMessages([]);
    setContextTrimmed(false);
    setShowHistory(false);
  }, []);

  const openSession = useCallback(async (id: number) => {
    if (statusRef.current !== "idle") return;
    const stored = await ipc.openSession(id);
    setSessionId(id);
    setMessages(stored.map(fromStored));
    setContextTrimmed(false);
    setShowHistory(false);
    void ipc
      .drillStats()
      .then((stats) => setDue(stats.due))
      .catch(() => {});
  }, []);

  const reloadCurrentSession = useCallback(async () => {
    const [stored, id] = await Promise.all([ipc.history(), ipc.currentSession()]);
    setSessionId(id);
    setMessages(stored.map(fromStored));
    setContextTrimmed(false);
    void ipc
      .drillStats()
      .then((stats) => setDue(stats.due))
      .catch(() => {});
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

  const practiceFix = useCallback((_message: Msg, fix: Fix) => {
    setShowSettings(false);
    setShowBuddy(false);
    setShowProgress(false);
    setShowHistory(false);
    setDrillFocus(fix);
    setShowDrill(true);
  }, []);

  const deleteFix = useCallback(async (message: Msg, fix: Fix) => {
    if (!message.dbId) return;
    await ipc.deleteFix(message.dbId, fix.wrong, fix.right);
    // The backend removes the pair from every stored message, so mirror that
    // locally instead of leaving a duplicate card on another bubble.
    setMessages((current) =>
      current.map((item) => ({
        ...item,
        fixes: item.fixes.filter((entry) => entry.wrong !== fix.wrong || entry.right !== fix.right),
      })),
    );
    void ipc
      .drillStats()
      .then((stats) => setDue(stats.due))
      .catch(() => {});
  }, []);

  const empty = messages.length === 0;
  const accent = settings.accentFromMascot ? settings.color : "#8b7dff";
  const showUpdateBanner =
    updater.status === "downloading" ||
    updater.status === "ready" ||
    (updater.status === "available" && !updateDismissed);
  const accentVars = {
    "--accent": accent,
    "--accent-soft": withAlpha(accent, 0.16),
    "--stage-size": `${stageSize}px`,
  } as CSSProperties;

  if (settings.popup && hasKey) {
    return (
      <div className={`app size-${settings.textSize} popup`} style={accentVars}>
        <PopupView
          settings={settings}
          messages={messages}
          status={status}
          mood={mood}
          stage={popupStage}
          onShowInput={() => changePopupStage("input")}
          onOpenChat={exitPopup}
          onSend={sendFromPopup}
          onStop={stop}
        />
      </div>
    );
  }

  if (settings.compact && hasKey) {
    return (
      <div className={`app size-${settings.textSize} compact-liquid`} style={accentVars}>
        <CompactView
          settings={settings}
          messages={messages}
          status={status}
          mood={mood}
          pinned={pinned}
          onTogglePin={togglePin}
          onFull={toggleCompact}
          onHide={() => void ipc.hideWindow()}
          onSend={send}
          onStop={stop}
        />
      </div>
    );
  }

  return (
    <div
      className={`app size-${settings.textSize} ${settings.compact ? "compact" : ""}`}
      style={accentVars}
    >
      <div className="panel">
        <header className="head" data-tauri-drag-region>
          <button
            className="brand brand-button"
            type="button"
            title="Customize buddy"
            aria-label="Customize buddy"
            onClick={() => {
              setShowSettings(false);
              setShowProgress(false);
              setShowHistory(false);
              setShowBuddy(true);
            }}
          >
            {settings.compact && (
              <span className="brand-face">
                <Mascot
                  state={status}
                  mood={mood}
                  size={42}
                  shape={settings.shape}
                  color={settings.color}
                  showMouth={settings.showMouth}
                  mouthStyle={settings.mouthStyle}
                  mouthSize={settings.mouthSize}
                  mouthColor={settings.mouthColor}
                  eyeStyle={settings.eyeStyle}
                  eyeSize={settings.eyeSize}
                  eyeSpacing={settings.eyeSpacing}
                  eyeTilt={settings.eyeTilt}
                  eyeColor={settings.eyeColor}
                />
              </span>
            )}
            <span className="brand-copy">
              <strong>bubo</strong>
              <span className="brand-sub">{mood === "idle" ? "English buddy" : mood}</span>
            </span>
            <span className="brand-edit" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 20h4L18.5 9.5l-4-4L4 16v4z" />
                <path d="M13.5 6.5l4 4" />
              </svg>
            </span>
          </button>
          <div className="head-actions">
            {!settings.compact && (
              <>
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
                  title="History"
                  aria-label="History"
                  disabled={status !== "idle"}
                  onClick={() => {
                    setShowSettings(false);
                    setShowBuddy(false);
                    setShowProgress(false);
                    setShowDrill(false);
                    setShowHistory(true);
                  }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                    <circle
                      cx="12"
                      cy="12"
                      r="8.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M12 7.5V12l3 1.8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <button
                  className="ghost icon"
                  title="Progress"
                  aria-label="Progress"
                  onClick={() => {
                    setShowSettings(false);
                    setShowBuddy(false);
                    setShowHistory(false);
                    setShowDrill(false);
                    setShowProgress(true);
                  }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                    <path
                      d="M5 19v-6M12 19V6M19 19v-9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <button
                  className="ghost icon"
                  title={due > 0 ? `Practice ${due} corrections` : "Practice corrections"}
                  aria-label="Practice"
                  onClick={() => {
                    setDrillFocus(null);
                    setShowDrill(true);
                  }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                    <circle
                      cx="12"
                      cy="12"
                      r="8.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <circle cx="12" cy="12" r="2.6" fill="currentColor" />
                  </svg>
                  {due > 0 && <span className="badge">{due > 9 ? "9+" : due}</span>}
                </button>
                <span className="head-sep" aria-hidden="true" />
              </>
            )}
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
              className={`ghost icon ${settings.compact ? "on" : ""}`}
              title={settings.compact ? "Full mode" : "Compact mode"}
              aria-label={settings.compact ? "Full mode" : "Compact mode"}
              aria-pressed={settings.compact}
              onClick={toggleCompact}
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {settings.compact ? (
                  <path d="M4 9h5V4M20 15h-5v5" />
                ) : (
                  <path d="M9 4v5H4M15 20v-5h5" />
                )}
              </svg>
            </button>
            <button
              className="ghost icon"
              title="Popup mode"
              aria-label="Popup mode"
              disabled={!hasKey}
              onClick={enterPopup}
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
              </svg>
            </button>
            {!settings.compact && (
              <button
                className="ghost icon"
                title="Settings"
                aria-label="Settings"
                onClick={() => {
                  setShowBuddy(false);
                  setShowProgress(false);
                  setShowHistory(false);
                  setShowSettings(true);
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                  <path
                    d="M4 7h10M18 7h2M4 17h2M10 17h10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="16"
                    cy="7"
                    r="2.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <circle
                    cx="8"
                    cy="17"
                    r="2.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                </svg>
              </button>
            )}
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
          {!settings.compact && (
            <div className="chat-stage">
              <Mascot
                state={status}
                mood={mood}
                size={stageSize}
                energy={energy}
                shape={settings.shape}
                color={settings.color}
                showMouth={settings.showMouth}
                mouthStyle={settings.mouthStyle}
                mouthSize={settings.mouthSize}
                mouthColor={settings.mouthColor}
                eyeStyle={settings.eyeStyle}
                eyeSize={settings.eyeSize}
                eyeSpacing={settings.eyeSpacing}
                eyeTilt={settings.eyeTilt}
                eyeColor={settings.eyeColor}
                boopable
              />
              {settings.showStatus && status !== "idle" && (
                <span className="status-pill">{STATUS_LABEL[status]}</span>
              )}
            </div>
          )}

          {empty && !showSettings && !showBuddy ? (
            <div className="hero">
              <h1>Hey, I'm bubo.</h1>
              <p>
                Talk to me in English. I keep the conversation going and quietly show what a native
                speaker would have said.
              </p>
              <div className="suggestions">
                {due > 0 && (
                  <button
                    className="chip chip-practice"
                    onClick={() => {
                      setDrillFocus(null);
                      setShowDrill(true);
                    }}
                  >
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
                stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
              }}
            >
              {contextTrimmed && (
                <div className="context-hint">
                  Long conversation: bubo is using the most recent messages.
                </div>
              )}
              {messages.map((message) => (
                <Message
                  key={message.id}
                  message={message}
                  onRetry={message.error ? retry : undefined}
                  onDelete={removeMessage}
                  onPracticeFix={practiceFix}
                  onDeleteFix={deleteFix}
                />
              ))}
            </div>
          )}
        </div>

        {showUpdateBanner && (
          <UpdateBanner
            version={updater.version}
            status={updater.status}
            progress={updater.progress}
            onInstall={() => void updater.install()}
            onLater={() => setUpdateDismissed(true)}
          />
        )}

        <Composer
          disabled={status !== "idle"}
          busy={status !== "idle"}
          onSend={send}
          onStop={stop}
        />

        {showHistory && (
          <HistoryPanel
            currentSession={sessionId}
            onClose={() => setShowHistory(false)}
            onOpen={openSession}
            onNew={async (id) => {
              setSessionId(id);
              setMessages([]);
              setShowHistory(false);
            }}
            onCurrentChanged={async () => {
              await reloadCurrentSession();
            }}
          />
        )}

        {showProgress && (
          <ProgressPanel
            onClose={() => setShowProgress(false)}
            onPractice={() => {
              setShowProgress(false);
              setDrillFocus(null);
              setShowDrill(true);
            }}
          />
        )}

        {showBuddy && (
          <BuddyPanel
            settings={settings}
            pinned={pinned}
            onTogglePin={togglePin}
            onClose={() => setShowBuddy(false)}
            onSave={(next) => saveSettings(next, "")}
          />
        )}

        {showSettings && (
          <SettingsPanel
            settings={settings}
            hasKey={hasKey}
            pinned={pinned}
            onTogglePin={togglePin}
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
            currentVersion={
              updater.currentVersion
                ? `${updater.currentVersion} · ${BUILD_LABEL}`
                : updater.currentVersion
            }
            updateStatus={updater.status}
            updateVersion={updater.version}
            updateNotes={updater.notes}
            updateProgress={updater.progress}
            updateError={updater.error}
            onCheckUpdate={updater.checkNow}
            onInstallUpdate={updater.install}
          />
        )}

        {showDrill && (
          <Drill
            settings={settings}
            focus={drillFocus}
            onClose={() => {
              setShowDrill(false);
              setDrillFocus(null);
              void ipc.drillStats().then((stats) => setDue(stats.due));
            }}
          />
        )}
      </div>
    </div>
  );
}
