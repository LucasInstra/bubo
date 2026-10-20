import { useEffect, useState } from "react";
import { PERSONALITIES, personality } from "../lib/personalities";
import type { Settings } from "../lib/types";
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
  bars: "Bars",
  dots: "Dots",
  arcs: "Arcs",
  sleepy: "Sleepy",
  sparkle: "Sparkle",
  heart: "Heart",
  ring: "Ring",
  wink: "Wink",
  angry: "Angry",
};
const SPACING_LABELS = [
  ["close", "Close"],
  ["normal", "Normal"],
  ["wide", "Wide"],
];
const TILT_LABELS = [
  ["soft", "Soft"],
  ["straight", "Straight"],
  ["sharp", "Sharp"],
];

export function BuddyPanel({
  settings,
  pinned,
  onTogglePin,
  onClose,
  onSave,
}: BuddyPanelProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const patch = (part: Partial<Settings>) => setDraft((current) => ({ ...current, ...part }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  useEffect(() => {
    const chat = document.querySelector<HTMLElement>(".chat");
    const composer = document.querySelector<HTMLElement>(".composer");
    chat?.setAttribute("inert", "");
    composer?.setAttribute("inert", "");
    return () => {
      chat?.removeAttribute("inert");
      composer?.removeAttribute("inert");
    };
  }, []);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await onSave(draft);
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Could not save the buddy.");
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
    <div className="settings buddy" role="dialog" aria-modal="true" aria-label="Customize buddy">
      <div className="settings-head">
        <button className="ghost" onClick={() => void close()} aria-label="Back">
          ←
        </button>
        <span>buddy</span>
        <button
          type="button"
          className={`ghost icon settings-pin ${pinned ? "on" : ""}`}
          title={pinned ? "Unpin (let other windows cover bubo)" : "Keep bubo on top"}
          aria-label="Pin window"
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
        <div className="section-title">Personality</div>

        <div className="field">
          <span>Voice</span>
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
            {personality(draft.personality).vibe}. Previews are illustrative: picking a voice
            changes only the tone, the mascot is yours.
          </p>
        </div>

        <label className="field">
          <span>Extra flavor (optional)</span>
          <textarea
            rows={2}
            value={draft.persona}
            placeholder="e.g. talk about music, mention movies"
            onChange={(event) => patch({ persona: event.target.value })}
          />
          <span className="hint">Added on top of the voice you picked above.</span>
        </label>

        <div className="section-title">Look</div>

        <div className="field">
          <span>Your buddy</span>
          <div className="look">
            <div className="look-preview">
              <Mascot
                state="idle"
                size={78}
                shape={draft.shape}
                color={draft.color}
                showMouth={draft.showMouth}
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
                <label className="swatch-custom" title="Custom color">
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(event) => patch({ color: event.target.value })}
                    aria-label="Custom color"
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
        </div>

        <div className="field">
          <span>Eyes</span>
          <div className="levels wrap">
            {EYE_STYLES.map((value) => (
              <button
                key={value}
                type="button"
                className={`chip ${draft.eyeStyle === value ? "chip-on" : ""}`}
                onClick={() => patch({ eyeStyle: value })}
              >
                {EYE_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Eye color</span>
          <div className="swatches">
            {EYE_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                className={`swatch ${draft.eyeColor === option ? "on" : ""}`}
                style={{
                  background:
                    option === "auto"
                      ? "linear-gradient(135deg, #fcfcff 0 50%, #241d33 50% 100%)"
                      : option,
                }}
                onClick={() => patch({ eyeColor: option })}
                aria-label={option === "auto" ? "auto contrast" : `eye color ${option}`}
                title={option === "auto" ? "Auto contrast" : option}
              />
            ))}
            <label className="swatch-custom" title="Custom eye color">
              <input
                type="color"
                value={draft.eyeColor === "auto" ? "#fcfcff" : draft.eyeColor}
                onChange={(event) => patch({ eyeColor: event.target.value })}
                aria-label="Custom eye color"
              />
            </label>
          </div>
        </div>

        <div className="field">
          <span>Eye size</span>
          <div className="levels">
            {EYE_SIZES.map((value) => (
              <button
                key={value}
                type="button"
                className={`chip ${draft.eyeSize === value ? "chip-on" : ""}`}
                onClick={() => patch({ eyeSize: value })}
              >
                {value === "small" ? "S" : value === "large" ? "L" : "M"}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Eye spacing</span>
          <div className="levels">
            {SPACING_LABELS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`chip ${draft.eyeSpacing === value ? "chip-on" : ""}`}
                onClick={() => patch({ eyeSpacing: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Eye tilt</span>
          <div className="levels">
            {TILT_LABELS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`chip ${draft.eyeTilt === value ? "chip-on" : ""}`}
                onClick={() => patch({ eyeTilt: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="field row">
          <span>Mouth</span>
          <input
            type="checkbox"
            checked={draft.showMouth}
            onChange={(event) => patch({ showMouth: event.target.checked })}
          />
        </label>

        <label className="field row">
          <span>Status label under the mascot</span>
          <input
            type="checkbox"
            checked={draft.showStatus}
            onChange={(event) => patch({ showStatus: event.target.checked })}
          />
        </label>

        <label className="field row">
          <span>Use the mascot color across the app</span>
          <input
            type="checkbox"
            checked={draft.accentFromMascot}
            onChange={(event) => patch({ accentFromMascot: event.target.checked })}
          />
        </label>
      </div>

      <div className="settings-footer">
        {error ? (
          <span className="settings-error">{error}</span>
        ) : (
          <span className="hint">{dirty ? "unsaved changes" : ""}</span>
        )}
        <button className="primary" onClick={save} disabled={busy || !dirty}>
          {busy ? "saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
