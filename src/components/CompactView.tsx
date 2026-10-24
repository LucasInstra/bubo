import { useState } from "react";
import { splitBilingual, splitTranslation, stripLegacyFixes } from "../lib/format";
import type { Mood, Msg, OrbState, Settings } from "../lib/types";
import { Composer } from "./Composer";
import { Mascot } from "./Mascot";

interface CompactViewProps {
  settings: Settings;
  messages: Msg[];
  status: OrbState;
  mood: Mood;
  pinned: boolean;
  onTogglePin: () => void;
  onFull: () => void;
  onHide: () => void;
  onSend: (text: string) => boolean;
  onStop: () => void;
}

/**
 * Minimal compact card: a static mascot, three window actions, the last
 * exchange and a composer. The mascot is intentionally not boopable or
 * draggable here; customization and the full conversation live in full mode.
 */
export function CompactView({
  settings,
  messages,
  status,
  mood,
  pinned,
  onTogglePin,
  onFull,
  onHide,
  onSend,
  onStop,
}: CompactViewProps) {
  const [englishOpen, setEnglishOpen] = useState<Record<string, boolean>>({});
  const bilingualMode = settings.replyLanguage === "bilingual";
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

  return (
    <div className="compact-stage">
      <div className="compact-card">
        <header className="compact-head" data-tauri-drag-region>
          <span className="compact-face" aria-hidden="true">
            <Mascot
              state={status}
              mood={mood}
              size={52}
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
          </span>

          <div className="compact-actions">
            <button
              className={`compact-icon ${pinned ? "on" : ""}`}
              type="button"
              title={pinned ? "Desafixar janela" : "Manter o bubo no topo"}
              aria-label="Fixar janela"
              aria-pressed={pinned}
              onClick={onTogglePin}
            >
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 3h6l-1 6 3 3v1H7v-1l3-3-1-6z" />
                <path d="M12 13v8" />
              </svg>
            </button>

            <button
              className="compact-icon"
              type="button"
              title="Modo completo"
              aria-label="Modo completo"
              onClick={onFull}
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
                <path d="M4 9h5V4M20 15h-5v5" />
              </svg>
            </button>

            <button
              className="compact-icon"
              type="button"
              title={`Ocultar (${settings.hotkey})`}
              aria-label="Ocultar"
              onClick={onHide}
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
                <path d="M6 10l6 6 6-6" />
              </svg>
            </button>
          </div>
        </header>

        <div className="compact-chat">
          {exchange.length === 0 && !pending && <p className="compact-empty">Diga oi em inglês.</p>}

          {exchange.map((message) => {
            const content = stripLegacyFixes(message.content);
            const assistant = message.role === "assistant";
            const bilingual = assistant && bilingualMode ? splitBilingual(content) : null;
            const legacy =
              assistant && !bilingualMode
                ? splitTranslation(content)
                : { body: content, translation: "" };
            const primary = bilingual ? bilingual.portuguese || bilingual.english : legacy.body;
            const english = bilingual?.portuguese ? bilingual.english : "";
            const englishShown =
              Boolean(english) && (!settings.translationChallenge || englishOpen[message.id]);
            return (
              <div
                className={`compact-bubble ${message.role} ${
                  english || legacy.translation ? "has-translation" : ""
                }`}
                key={message.id}
              >
                {primary}
                {english && englishShown && (
                  <>
                    <span className="compact-english" lang="en">
                      {english}
                    </span>
                    {settings.translationChallenge && englishOpen[message.id] && (
                      <button
                        type="button"
                        className="compact-reveal"
                        onClick={() =>
                          setEnglishOpen((current) => ({ ...current, [message.id]: false }))
                        }
                      >
                        esconder inglês
                      </button>
                    )}
                  </>
                )}
                {english && !englishShown && !message.streaming && (
                  <button
                    type="button"
                    className="compact-reveal"
                    onClick={() =>
                      setEnglishOpen((current) => ({ ...current, [message.id]: true }))
                    }
                  >
                    ver em inglês
                  </button>
                )}
                {!bilingualMode && legacy.translation && (
                  <span className="compact-translation" lang="pt-BR">
                    {legacy.translation}
                  </span>
                )}
                {message.streaming && <span className="caret" />}
              </div>
            );
          })}

          {pending && (
            <div className="compact-bubble assistant compact-typing">
              {status === "thinking" ? "pensando..." : "escrevendo..."}
            </div>
          )}
        </div>

        <Composer
          disabled={status !== "idle"}
          busy={status !== "idle"}
          placeholder={
            settings.replyLanguage === "pt"
              ? "Digite em português ou inglês..."
              : "Digite em inglês..."
          }
          onSend={onSend}
          onStop={onStop}
        />
      </div>
    </div>
  );
}
