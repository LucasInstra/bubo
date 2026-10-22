import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { stripLegacyFixes } from "../lib/format";
import type { Mood, Msg, OrbState, Settings } from "../lib/types";
import { Composer } from "./Composer";
import { Mascot } from "./Mascot";

export type PopupStage = "face" | "input" | "reply";

interface PopupViewProps {
  settings: Settings;
  messages: Msg[];
  status: OrbState;
  mood: Mood;
  stage: PopupStage;
  onShowInput: () => void;
  onSend: (text: string) => boolean;
  onStop: () => void;
  onOpenChat: () => void;
}

/**
 * Mascot-only mode. The face stays put; a click opens a small composer under
 * it, and the reply appears above it when bubo speaks. There is no thread and
 * no toolbar: the window itself is only as big as the current stage.
 */
export function PopupView({
  settings,
  messages,
  status,
  mood,
  stage,
  onShowInput,
  onSend,
  onStop,
  onOpenChat,
}: PopupViewProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({
    startX: 0,
    startY: 0,
    windowX: null as number | null,
    windowY: null as number | null,
    moved: false,
  });

  useEffect(
    () => () => {
      if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim());
  const pending =
    status !== "idle" &&
    (!messages.length ||
      messages[messages.length - 1].role === "user" ||
      (messages[messages.length - 1].role === "assistant" &&
        !messages[messages.length - 1].content.trim()));

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startX: event.screenX,
      startY: event.screenY,
      windowX: null,
      windowY: null,
      moved: false,
    };
    const scale = window.devicePixelRatio || 1;
    void getCurrentWindow()
      .outerPosition()
      .then((position) => {
        drag.current.windowX = position.x / scale;
        drag.current.windowY = position.y / scale;
      })
      .catch(() => {});
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current.windowX === null || current.windowY === null) return;
    const startWindowX = current.windowX;
    const startWindowY = current.windowY;
    const dx = event.screenX - current.startX;
    const dy = event.screenY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < 6) return;
    current.moved = true;
    if (!dragging) setDragging(true);
    if (innerRef.current) {
      const tilt = Math.max(-7, Math.min(7, dx * 0.1));
      const shiftX = Math.max(-5, Math.min(5, dx * 0.03));
      const shiftY = Math.max(-5, Math.min(5, dy * 0.03));
      innerRef.current.style.transform = `translate(${shiftX}px, ${shiftY}px) rotate(${tilt}deg) scale(1.04)`;
    }
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      void getCurrentWindow()
        .setPosition(
          new LogicalPosition(Math.round(startWindowX + dx), Math.round(startWindowY + dy)),
        )
        .catch(() => {});
    });
  };

  const endDrag = () => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (drag.current.moved) {
      drag.current.moved = false;
      setDragging(false);
      if (innerRef.current) innerRef.current.style.transform = "";
      return;
    }
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onOpenChat();
      return;
    }
    if (stage === "input") return;
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      onShowInput();
    }, 240);
  };

  const reply = lastAssistant ? stripLegacyFixes(lastAssistant.content) : "";

  return (
    <div className={`popup-stage stage-${stage}`}>
      {stage === "reply" && (
        <div className="popup-reply">
          {lastAssistant && !pending ? (
            <div className={`popup-bubble assistant ${lastAssistant.error ? "error" : ""}`}>
              {reply}
              {lastAssistant.streaming && <span className="caret" />}
            </div>
          ) : (
            <div className="popup-bubble assistant popup-typing">thinking...</div>
          )}
        </div>
      )}

      <div
        className={`popup-face ${dragging ? "dragging" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Chat with bubo"
        title="Click to talk · drag to move · double-click for the chat"
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onContextMenu={(event) => {
          event.preventDefault();
          onOpenChat();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onShowInput();
          }
        }}
      >
        <div className="popup-face-inner" ref={innerRef}>
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
      </div>

      {stage === "input" && (
        <Composer
          disabled={status !== "idle"}
          busy={status !== "idle"}
          autoFocus
          onSend={onSend}
          onStop={onStop}
        />
      )}
    </div>
  );
}
