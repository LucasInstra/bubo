import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { stripLegacyFixes } from "../lib/format";
import type { Mood, Msg, OrbState, Settings } from "../lib/types";
import { Composer } from "./Composer";
import { Mascot } from "./Mascot";

interface PopupViewProps {
  settings: Settings;
  messages: Msg[];
  status: OrbState;
  mood: Mood;
  open: boolean;
  onOpen: () => void;
  onCollapse: () => void;
  onOpenChat: () => void;
  onSend: (text: string) => boolean;
  onStop: () => void;
}

/**
 * Mascot-only mode. Collapsed it is the face alone; opening it grows the
 * window around the same center point, with the reply above and the composer
 * below. The window geometry is handled by the Rust side.
 */
export function PopupView({
  settings,
  messages,
  status,
  mood,
  open,
  onOpen,
  onCollapse,
  onOpenChat,
  onSend,
  onStop,
}: PopupViewProps) {
  const drag = useRef({ x: 0, y: 0, moved: false });

  const lastUser = [...messages]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim());
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim());
  const last = messages[messages.length - 1];
  const pending =
    status !== "idle" &&
    (!last || last.role === "user" || (last.role === "assistant" && !last.content.trim()));
  const exchange = [lastUser, pending ? null : lastAssistant]
    .filter((message): message is Msg => Boolean(message))
    .sort((a, b) => messages.indexOf(a) - messages.indexOf(b));

  const fixes = lastAssistant?.fixes.length ?? 0;

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current.moved) return;
    if (Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) < 6) return;
    drag.current.moved = true;
    void getCurrentWindow().startDragging();
  };

  return (
    <div className={`popup-stage ${open ? "open" : ""}`}>
      {open && (
        <>
          <div className="popup-thread">
            {exchange.length === 0 && !pending && <p className="popup-empty">Say hi in English.</p>}
            {exchange.map((message) => (
              <div className={`popup-bubble ${message.role}`} key={message.id}>
                {stripLegacyFixes(message.content)}
                {message.streaming && <span className="caret" />}
              </div>
            ))}
            {pending && <div className="popup-bubble assistant popup-typing">thinking...</div>}
            {fixes > 0 && (
              <button className="popup-fixes" type="button" onClick={onOpenChat}>
                {fixes} {fixes === 1 ? "fix" : "fixes"} · open chat
              </button>
            )}
          </div>

          <button
            className="popup-close"
            type="button"
            title="Close"
            aria-label="Close popup"
            onClick={onCollapse}
          >
            ×
          </button>
        </>
      )}

      <div
        className="popup-face"
        role="button"
        tabIndex={0}
        aria-label={open ? "Close the popup" : "Chat with bubo"}
        title={open ? "Double-click to close" : "Double-click to chat"}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onDoubleClick={() => (open ? onCollapse() : onOpen())}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) onCollapse();
            else onOpen();
          }
        }}
      >
        <Mascot
          state={status}
          mood={mood}
          size={96}
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
          boopable={false}
        />
      </div>

      {open && (
        <>
          <Composer
            disabled={status !== "idle"}
            busy={status !== "idle"}
            autoFocus
            onSend={onSend}
            onStop={onStop}
          />
          <button
            className="popup-open-chat"
            type="button"
            title="Open the full chat"
            aria-label="Open the full chat"
            onClick={onOpenChat}
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
              <path d="M4 9h5V4M20 15h-5v5" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
