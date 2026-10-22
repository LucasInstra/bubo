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
  busy: boolean;
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
  busy,
  onShowInput,
  onSend,
  onStop,
  onOpenChat,
}: PopupViewProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const motion = useRef({
    active: false,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    lastX: null as number | null,
    lastY: null as number | null,
  });
  const drag = useRef({
    active: false,
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
    const session = {
      active: true,
      startX: event.screenX,
      startY: event.screenY,
      windowX: null as number | null,
      windowY: null as number | null,
      moved: false,
    };
    drag.current = session;
    const scale = window.devicePixelRatio || 1;
    void getCurrentWindow()
      .outerPosition()
      .then((position) => {
        if (drag.current !== session) return;
        session.windowX = position.x / scale;
        session.windowY = position.y / scale;
      })
      .catch(() => {});
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current.active) return;
    if (current.windowX === null || current.windowY === null) return;
    const startWindowX = current.windowX;
    const startWindowY = current.windowY;
    const dx = event.screenX - current.startX;
    const dy = event.screenY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < 6) return;
    current.moved = true;
    if (!dragging) setDragging(true);

    const distance = Math.hypot(dx, dy);
    const tilt = Math.max(-16, Math.min(16, dx * 0.22));
    const stretch = Math.min(0.16, distance * 0.0022);
    const shiftX = Math.max(-14, Math.min(14, -dx * 0.07));
    const shiftY = Math.max(-14, Math.min(14, -dy * 0.07));
    if (innerRef.current) {
      innerRef.current.style.transform = `translate(${shiftX}px, ${shiftY}px) rotate(${tilt}deg) scale(${1 + stretch}, ${1 - stretch * 0.55})`;
    }

    const movement = motion.current;
    movement.targetX = startWindowX + dx;
    movement.targetY = startWindowY + dy;
    if (movement.active) return;

    movement.active = true;
    movement.x = startWindowX;
    movement.y = startWindowY;
    movement.lastX = null;
    movement.lastY = null;
    const step = () => {
      const currentMotion = motion.current;
      if (!currentMotion.active) return;
      // The window chases the pointer instead of snapping to it: the few
      // pixels of lag are what lets the mascot's own grab deform the face.
      currentMotion.x += (currentMotion.targetX - currentMotion.x) * 0.42;
      currentMotion.y += (currentMotion.targetY - currentMotion.y) * 0.42;
      const nextX = Math.round(currentMotion.x);
      const nextY = Math.round(currentMotion.y);
      if (nextX !== currentMotion.lastX || nextY !== currentMotion.lastY) {
        currentMotion.lastX = nextX;
        currentMotion.lastY = nextY;
        void getCurrentWindow()
          .setPosition(new LogicalPosition(nextX, nextY))
          .catch(() => {});
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  const stopMotion = (snap: boolean) => {
    const movement = motion.current;
    if (movement.active && snap) {
      void getCurrentWindow()
        .setPosition(
          new LogicalPosition(Math.round(movement.targetX), Math.round(movement.targetY)),
        )
        .catch(() => {});
    }
    movement.active = false;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  };

  const cancelDrag = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    drag.current.moved = false;
    drag.current.windowX = null;
    drag.current.windowY = null;
    stopMotion(false);
    setDragging(false);
    if (innerRef.current) innerRef.current.style.transform = "";
  };

  const endDrag = () => {
    stopMotion(true);
    if (!drag.current.active) return;
    drag.current.active = false;
    drag.current.windowX = null;
    drag.current.windowY = null;
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
  const tail = (
    <svg className="popup-tail" viewBox="0 0 20 14" aria-hidden="true">
      <path d="M2 0 H18 V4 L10 14 L2 4 Z" fill="rgba(23, 19, 34, 0.97)" />
      <path
        d="M2 4 L10 14 L18 4"
        fill="none"
        stroke="rgba(255, 255, 255, 0.18)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <div className={`popup-stage stage-${stage} ${busy ? "busy" : ""}`}>
      {stage === "reply" && (
        <div className="popup-reply">
          {lastAssistant && !pending ? (
            <div className={`popup-bubble assistant ${lastAssistant.error ? "error" : ""}`}>
              {reply}
              {lastAssistant.streaming && <span className="caret" />}
              {tail}
            </div>
          ) : (
            <div className="popup-bubble assistant popup-typing">
              thinking...
              {tail}
            </div>
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
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
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
            boopable
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
