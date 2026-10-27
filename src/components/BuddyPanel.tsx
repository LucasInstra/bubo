import { useRef, useState } from "react";
import { useModalFocus } from "../lib/modal";
import { PERSONALITIES, personality } from "../lib/personalities";
import { DEFAULT_LOOK, type Settings } from "../lib/types";
import {
  EYE_COLORS,
  EYE_SIZES,
  EYE_STYLES,
  MASCOT_COLORS,
  MASCOT_SHAPES,
  Mascot,
  SHAPE_LABELS,
} from "./Mascot";

interface BuddyPanelProps {
  settings: Settings;
  pinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  onSave: (next: Settings) => Promise<void>;
}

const EYE_LABELS: Record<string, string> = {
  bars: "Barras",
  dots: "Pontos",
  arcs: "Arcos",
  sleepy: "Sonolento",
  sparkle: "Brilho",
  heart: "Coração",
  ring: "Anel",
  wink: "Piscadinha",
  angry: "Bravo",
};
const SPACING_LABELS = [
  ["close", "Perto"],
  ["normal", "Normal"],
  ["wide", "Largo"],
];
const TILT_LABELS = [
  ["soft", "Suave"],
  ["straight", "Reta"],
  ["sharp", "Acentuada"],
];
const MOUTH_STYLES = [
  ["line", "Linha"],
  ["smile", "Sorriso"],
  ["grin", "Sorrisão"],
  ["cat", "Gato"],
  ["open", "Aberto"],
  ["flat", "Plano"],
];
const MOUTH_SIZES = [
  ["small", "S"],
  ["medium", "M"],
  ["large", "L"],
];
const MOUTH_COLORS = ["auto", "#fcfcff", "#241d33", "#ec4899", "#ef4444", "#f59e0b"];

export function BuddyPanel({ settings, pinned, onTogglePin, onClose, onSave }: BuddyPanelProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useModalFocus(dialogRef);

  const patch = (part: Partial<Settings>) => setDraft((current) => ({ ...current, ...part }));
  const resetLook = () => patch(DEFAULT_LOOK);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await onSave(draft);
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Não foi possível salvar o bubo.");
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!dirty) {
      onClose();
      return;
    }
    await save();
  };

  return (
    <div
      className="settings buddy"
      role="dialog"
      aria-modal="true"
      aria-label="Personalizar o bubo"
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="settings-head" data-tauri-drag-region>
        <button className="ghost" onClick={() => void close()} aria-label="Voltar">
          ←
        </button>
        <span>bubo</span>
        <button
          type="button"
          className={`ghost icon settings-pin ${pinned ? "on" : ""}`}
          title={
            pinned ? "Desafixar (deixar outras janelas cobrirem o bubo)" : "Manter o bubo no topo"
          }
          aria-label="Fixar janela"
          aria-pressed={pinned}
          onClick={onTogglePin}
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
      </div>

      <div className="settings-body">
        <div className="section-title">Personalidade</div>

        <div className="field">
          <span>Voz</span>
          <div className="personalities">
            {PERSONALITIES.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`persona ${draft.personality === preset.id ? "on" : ""}`}
                title={preset.vibe}
                onClick={() => patch({ personality: preset.id })}
              >
                <Mascot
                  state="idle"
                  size={44}
                  {...preset.preview}
                  eyeColor="auto"
                  animate={false}
                />
                <span className="persona-label">{preset.label}</span>
                <span className="persona-vibe">{preset.vibe}</span>
              </button>
            ))}
          </div>
          <p className="hint">
            {personality(draft.personality).vibe}. As prévias são ilustrativas: escolher uma voz
            muda apenas o tom; o mascote é seu.
          </p>
        </div>

        <label className="field">
          <span>Toque extra e personalidade</span>
          <textarea
            rows={2}
            value={draft.persona}
            placeholder="ex.: seja um pouco sarcástico, respostas curtas, fale sobre música"
            onChange={(event) => patch({ persona: event.target.value })}
          />
          <span className="hint">
            Adiciona tópicos, manias ou uma personalidade inteira por cima da voz escolhida.
            Instruções de tom aqui vencem o preset.
          </span>
        </label>

        <div className="section-title">Aparência</div>

        <div className="look-section">
          <span className="look-label">Seu bubo</span>
          <div className="look look-sticky">
            <div className="look-preview">
              <Mascot
                state="idle"
                size={78}
                shape={draft.shape}
                color={draft.color}
                showMouth={draft.showMouth}
                mouthStyle={draft.mouthStyle}
                mouthSize={draft.mouthSize}
                mouthColor={draft.mouthColor}
                eyeStyle={draft.eyeStyle}
                eyeSize={draft.eyeSize}
                eyeSpacing={draft.eyeSpacing}
                eyeTilt={draft.eyeTilt}
                eyeColor={draft.eyeColor}
                boopable
              />
            </div>
            <div className="look-controls">
              <div className="swatches">
                {MASCOT_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`swatch ${draft.color === option ? "on" : ""}`}
                    style={{ background: option }}
                    onClick={() => patch({ color: option })}
                    aria-label={`color ${option}`}
                  />
                ))}
                <label className="swatch-custom" title="Cor personalizada">
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(event) => patch({ color: event.target.value })}
                    aria-label="Cor personalizada"
                  />
                </label>
              </div>
              <div className="shapes">
                {MASCOT_SHAPES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`shape ${draft.shape === option ? "on" : ""}`}
                    title={SHAPE_LABELS[option]}
                    onClick={() => patch({ shape: option })}
                  >
                    <Mascot
                      state="idle"
                      size={24}
                      shape={option}
                      color={draft.color}
                      showMouth={draft.showMouth}
                      mouthStyle={draft.mouthStyle}
                      mouthSize={draft.mouthSize}
                      mouthColor={draft.mouthColor}
                      eyeStyle={draft.eyeStyle}
                      eyeSize={draft.eyeSize}
                      eyeSpacing={draft.eyeSpacing}
                      eyeTilt={draft.eyeTilt}
                      eyeColor={draft.eyeColor}
                      canvasPadding={0.2}
                      animate={false}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="field row">
            <span>Voltar ao rosto original do bubo</span>
            <button className="ghost" type="button" onClick={resetLook}>
              Redefinir visual
            </button>
          </div>

          <div className="field">
            <span>Olhos</span>
            <div className="option-box">
              <div className="eye-grid">
                {EYE_STYLES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`chip ${draft.eyeStyle === value ? "chip-on" : ""}`}
                    aria-pressed={draft.eyeStyle === value}
                    onClick={() => patch({ eyeStyle: value })}
                  >
                    {EYE_LABELS[value]}
                  </button>
                ))}
              </div>

              <div className="option-row">
                <span className="option-label">Cor</span>
                <div className="swatches">
                  {EYE_COLORS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`swatch ${draft.eyeColor === option ? "on" : ""}`}
                      aria-pressed={draft.eyeColor === option}
                      style={{
                        background:
                          option === "auto"
                            ? "linear-gradient(135deg, #fcfcff 0 50%, #241d33 50% 100%)"
                            : option,
                      }}
                      onClick={() => patch({ eyeColor: option })}
                      aria-label={
                        option === "auto" ? "contraste automático" : `cor dos olhos ${option}`
                      }
                      title={option === "auto" ? "Contraste automático" : option}
                    />
                  ))}
                  <label className="swatch-custom" title="Cor dos olhos personalizada">
                    <input
                      type="color"
                      value={draft.eyeColor === "auto" ? "#fcfcff" : draft.eyeColor}
                      onChange={(event) => patch({ eyeColor: event.target.value })}
                      aria-label="Cor dos olhos personalizada"
                    />
                  </label>
                </div>
              </div>

              <div className="option-row">
                <span className="option-label">Tamanho</span>
                <div className="levels compact">
                  {EYE_SIZES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`chip ${draft.eyeSize === value ? "chip-on" : ""}`}
                      aria-pressed={draft.eyeSize === value}
                      onClick={() => patch({ eyeSize: value })}
                    >
                      {value === "small" ? "S" : value === "large" ? "L" : "M"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="option-row">
                <span className="option-label">Espaçamento</span>
                <div className="levels compact">
                  {SPACING_LABELS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`chip ${draft.eyeSpacing === value ? "chip-on" : ""}`}
                      aria-pressed={draft.eyeSpacing === value}
                      onClick={() => patch({ eyeSpacing: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="option-row">
                <span className="option-label">Inclinação</span>
                <div className="levels compact">
                  {TILT_LABELS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`chip ${draft.eyeTilt === value ? "chip-on" : ""}`}
                      aria-pressed={draft.eyeTilt === value}
                      onClick={() => patch({ eyeTilt: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="field">
            <span>Boca</span>
            <div className="option-box">
              <div className="option-row">
                <span className="option-label">Mostrar</span>
                <input
                  type="checkbox"
                  checked={draft.showMouth}
                  onChange={(event) => patch({ showMouth: event.target.checked })}
                />
              </div>

              <div className="eye-grid">
                {MOUTH_STYLES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`chip ${draft.mouthStyle === value ? "chip-on" : ""}`}
                    aria-pressed={draft.mouthStyle === value}
                    onClick={() => patch({ mouthStyle: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="option-row">
                <span className="option-label">Tamanho</span>
                <div className="levels compact">
                  {MOUTH_SIZES.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`chip ${draft.mouthSize === value ? "chip-on" : ""}`}
                      aria-pressed={draft.mouthSize === value}
                      onClick={() => patch({ mouthSize: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="option-row">
                <span className="option-label">Cor</span>
                <div className="swatches">
                  {MOUTH_COLORS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`swatch ${draft.mouthColor === option ? "on" : ""}`}
                      style={{
                        background:
                          option === "auto"
                            ? `linear-gradient(135deg, ${draft.color} 0 50%, #241d33 50% 100%)`
                            : option,
                      }}
                      onClick={() => patch({ mouthColor: option })}
                      aria-label={
                        option === "auto" ? "cor da boca automática" : `cor da boca ${option}`
                      }
                      title={option === "auto" ? "Automático (tom do corpo)" : option}
                    />
                  ))}
                  <label className="swatch-custom" title="Cor da boca personalizada">
                    <input
                      type="color"
                      value={draft.mouthColor === "auto" ? "#241d33" : draft.mouthColor}
                      onChange={(event) => patch({ mouthColor: event.target.value })}
                      aria-label="Cor da boca personalizada"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <label className="field row">
            <span>Rótulo de status embaixo do mascote</span>
            <input
              type="checkbox"
              checked={draft.showStatus}
              onChange={(event) => patch({ showStatus: event.target.checked })}
            />
          </label>

          <label className="field row">
            <span>Usar a cor do mascote no app</span>
            <input
              type="checkbox"
              checked={draft.accentFromMascot}
              onChange={(event) => patch({ accentFromMascot: event.target.checked })}
            />
          </label>
        </div>
      </div>

      <div className="settings-footer">
        {error ? (
          <span className="settings-error">{error}</span>
        ) : (
          <span className="hint">{dirty ? "unsaved changes" : ""}</span>
        )}
        <button className="primary" onClick={save} disabled={busy || !dirty}>
          {busy ? "saving..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
