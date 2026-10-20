import { useCallback, useEffect, useRef, useState } from "react";
import { Composer } from "./components/Composer";
import { Message } from "./components/Message";
import { Orb } from "./components/Orb";
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
  idle: "ready",
  thinking: "thinking",
  streaming: "writing",
};

function fromStored(message: StoredMessage): Msg {
  return {
    id: String(message.id),
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

  const listRef = useRef<HTMLDivElement>(null);
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
        setHasKey(loadedKey);
        setMessages(stored.map(fromStored));
        if (!loadedKey) setShowSettings(true);
      } catch (error) {
        console.error("bubo failed to load", error);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showSettings) setShowSettings(false);
        else void ipc.hideWindow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSettings]);

  const send = useCallback(
    async (text: string) => {
      const value = text.trim();
      if (!value || statusRef.current !== "idle") return;
      if (!hasKey) {
        setShowSettings(true);
        return;
      }

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

      const context = [...messages, userMessage]
        .filter((message) => !message.error)
        .slice(-16)
        .map(({ role, content }) => ({ role, content }));

      setMessages((current) => [...current, userMessage, botMessage]);
      setStatus("thinking");
      setEnergy(0.15);

      let acc = "";
      try {
        const finalText = await ipc.chat(context, {
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
        setMessages((current) =>
          current.map((message) =>
            message.id === botMessage.id
              ? { ...message, content: reason, streaming: false, error: true }
              : message,
          ),
        );
      } finally {
        setStatus("idle");
        setEnergy(0);
      }
    },
    [messages, hasKey],
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
      setShowSettings(false);
    },
    [settings.autostart],
  );

  const newChat = useCallback(async () => {
    await ipc.clearHistory();
    setMessages([]);
  }, []);

  const empty = messages.length === 0;

  return (
    <div className="app">
      <div className="panel">
        <header className="head" data-tauri-drag-region>
          <div className="brand" data-tauri-drag-region>
            <Orb state={status} size={26} energy={energy} />
            <div className="brand-text" data-tauri-drag-region>
              <strong>bubo</strong>
              <span>{STATUS_LABEL[status]}</span>
            </div>
          </div>
          <div className="head-actions">
            <button
              className="ghost icon"
              title="New chat"
              aria-label="New chat"
              onClick={() => void newChat()}
            >
              +
            </button>
            <button
              className="ghost icon"
              title="Settings"
              aria-label="Settings"
              onClick={() => setShowSettings(true)}
            >
              ⚙
            </button>
            <button
              className="ghost icon"
              title="Hide (Ctrl+Alt+B)"
              aria-label="Hide"
              onClick={() => void ipc.hideWindow()}
            >
              –
            </button>
          </div>
        </header>

        {empty && !showSettings ? (
          <div className="hero">
            <Orb state={status} size={120} energy={energy} />
            <h1>Hey, I'm bubo.</h1>
            <p>
              Talk to me in English. I keep the conversation going and quietly show what a native
              speaker would have said.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} className="chip" onClick={() => void send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages" ref={listRef}>
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
          </div>
        )}

        <Composer disabled={status !== "idle"} onSend={(text) => void send(text)} />

        {showSettings && (
          <SettingsPanel
            settings={settings}
            hasKey={hasKey}
            onClose={() => setShowSettings(false)}
            onSave={saveSettings}
            onNewChat={newChat}
          />
        )}
      </div>
    </div>
  );
}
