import { useEffect, useId, useRef, useState } from "react";
import { describeHotkey, modifierPreview } from "../lib/hotkey";

export interface HotkeyInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
}

const DEFAULT_HINT =
  "Click and press the combination. Use at least one of Ctrl, Alt or Super (Win) plus a key. Esc cancels.";

/**
 * Click-to-record control for the global show/hide shortcut. While armed it
 * captures the next chord on window (capture phase) so the app-level Escape
 * handler never sees keys meant for the recorder.
 */
export function HotkeyInput({ value, onChange, id, label = "Show/hide hotkey" }: HotkeyInputProps) {
  const [armed, setArmed] = useState(false);
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");

  const generatedId = useId();
  const controlId = id ?? `hotkey-${generatedId}`;
  const hintId = `${controlId}-hint`;

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!armed) return;

    const cancel = () => {
      setArmed(false);
      setPreview("");
      setMessage("");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Tab should still move focus, but it also means the user left the
      // recorder, so drop the armed state instead of swallowing it.
      if (event.key === "Tab") {
        cancel();
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape" || event.code === "Escape") {
        cancel();
        return;
      }
      if (event.repeat) return;

      const captured = describeHotkey(event);
      setPreview(captured.preview);
      setMessage(captured.hint);

      if (captured.value) {
        onChangeRef.current(captured.value);
        cancel();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      setPreview(modifierPreview(event));
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", cancel);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", cancel);
    };
  }, [armed]);

  const toggle = () => {
    if (armed) {
      setArmed(false);
      setPreview("");
      setMessage("");
      return;
    }
    setPreview("");
    setMessage("");
    setArmed(true);
  };

  return (
    <>
      <button
        type="button"
        id={controlId}
        className={`hotkey-input ${armed ? "armed" : ""}`}
        aria-label={label}
        aria-describedby={hintId}
        onClick={toggle}
        onBlur={() => {
          setArmed(false);
          setPreview("");
          setMessage("");
        }}
      >
        <span className="hotkey-value" aria-live="polite">
          {armed ? preview || "Press a shortcut..." : value || "Not set"}
        </span>
        <span className="hotkey-action" aria-hidden="true">
          {armed ? "recording" : "record"}
        </span>
      </button>
      <span className="hint" id={hintId}>
        {armed && message ? message : DEFAULT_HINT}
      </span>
    </>
  );
}
