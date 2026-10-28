import { speak, useSpeechReady } from "../lib/speech";

interface SpeakerButtonProps {
  text: string;
  label?: string;
  className?: string;
}

/** Reads an English sentence aloud. Hidden when the webview has no voices. */
export function SpeakerButton({
  text,
  label = "Ouvir a correção",
  className = "ghost",
}: SpeakerButtonProps) {
  const ready = useSpeechReady();
  if (!ready) return null;

  return (
    <button
      type="button"
      className={className}
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        speak(text);
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 10v4h4l5 4V6L8 10H4z" />
        <path d="M17 9.5a3.5 3.5 0 0 1 0 5" />
        <path d="M19.5 7a7 7 0 0 1 0 10" />
      </svg>
    </button>
  );
}
