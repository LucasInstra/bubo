import { useState } from "react";
import { MASCOT_COLORS, MASCOT_SHAPES, Mascot, SHAPE_LABELS } from "./Mascot";
import type { Settings } from "../lib/types";

interface SettingsPanelProps {
  settings: Settings;
  hasKey: boolean;
  onClose: () => void;
  onSave: (next: Settings, apiKey: string) => Promise<void>;
  onNewChat: () => Promise<void>;
}

const LEVELS = ["A2", "B1", "B2", "C1"];

export function SettingsPanel({
  settings,
  hasKey,
  onClose,
  onSave,
  onNewChat,
}: SettingsPanelProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const patch = (part: Partial<Settings>) => setDraft((current) => ({ ...current, ...part }));

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await onSave(draft, apiKey);
      setApiKey("");
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Could not save the settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings">
      <div className="settings-head">
        <button className="ghost" onClick={onClose} aria-label="Back">
          ←
        </button>
        <span>settings</span>
      </div>

      <div className="settings-body">
        <label className="field">
          <span>Groq API key {hasKey && <em className="ok">saved</em>}</span>
          <input
            type="password"
            value={apiKey}
            placeholder={hasKey ? "•••••••• (keep current)" : "gsk_..."}
            onChange={(event) => setApiKey(event.target.value)}
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>Model</span>
          <input
            value={draft.model}
            onChange={(event) => patch({ model: event.target.value })}
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>Base URL</span>
          <input
            value={draft.baseUrl}
            onChange={(event) => patch({ baseUrl: event.target.value })}
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>Show/hide hotkey</span>
          <input
            value={draft.hotkey}
            onChange={(event) => patch({ hotkey: event.target.value })}
            spellCheck={false}
            placeholder="Ctrl+Alt+B"
          />
        </label>

        <div className="field">
          <span>My English level</span>
          <div className="levels">
            {LEVELS.map((level) => (
              <button
                key={level}
                className={`chip ${draft.level === level ? "chip-on" : ""}`}
                onClick={() => patch({ level })}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Your buddy</span>
          <div className="look">
            <div className="look-preview">
              <Mascot
                state="idle"
                size={78}
                shape={draft.shape}
                color={draft.color}
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
                    <Mascot state="idle" size={24} shape={option} color={draft.color} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <label className="field">
          <span>bubo's personality (optional)</span>
          <textarea
            rows={2}
            value={draft.persona}
            placeholder="e.g. be a bit sarcastic, talk about music"
            onChange={(event) => patch({ persona: event.target.value })}
          />
        </label>

        <label className="field row">
          <span>Ignore capitalization</span>
          <input
            type="checkbox"
            checked={draft.ignoreCapitalization}
            onChange={(event) => patch({ ignoreCapitalization: event.target.checked })}
          />
        </label>

        <label className="field row">
          <span>Start with Windows</span>
          <input
            type="checkbox"
            checked={draft.autostart}
            onChange={(event) => patch({ autostart: event.target.checked })}
          />
        </label>

        <div className="field note">
          <span>
            Combine Ctrl, Alt or Shift with a key, like <code>Ctrl+Alt+B</code>. ESC hides the
            window.
          </span>
        </div>

        {error && <div className="settings-error">{error}</div>}

        <button className="primary" onClick={save} disabled={busy}>
          {busy ? "saving..." : "Save"}
        </button>
        <button
          className="ghost danger"
          onClick={async () => {
            await onNewChat();
            onClose();
          }}
        >
          Start a new chat
        </button>
      </div>
    </div>
  );
}
