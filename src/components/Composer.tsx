import { useRef, useState } from "react";

interface ComposerProps {
  disabled: boolean;
  busy: boolean;
  onSend: (text: string) => boolean;
  onStop: () => void;
}

export function Composer({ disabled, busy, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 96)}px`;
  };

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    if (!onSend(text)) return;
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  return (
    <div className="composer">
      <div className="composer-inner">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          placeholder={disabled ? "bubo is writing..." : "Type in English..."}
          onChange={(event) => {
            setValue(event.target.value);
            resize();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {busy ? (
          <button className="send stop" onClick={onStop} title="Stop" aria-label="Stop">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button
            className="send"
            onClick={submit}
            disabled={value.trim().length === 0}
            title="Send"
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M4 12l15-7-4.5 7L19 19z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
