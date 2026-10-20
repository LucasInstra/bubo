import { useCallback, useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import type { DrillStats, Settings } from "../lib/types";
import { MASCOT_COLORS, MASCOT_SHAPES, Mascot, SHAPE_LABELS } from "./Mascot";

interface SettingsPanelProps {
  settings: Settings;
  hasKey: boolean;
  onClose: () => void;
  onSave: (next: Settings, apiKey: string) => Promise<void>;
  onNewChat: () => Promise<void>;
  onQueueChanged: () => void;
}

const LEVELS = ["A2", "B1", "B2", "C1"];
const TEXT_SIZES = [
  ["small", "Small"],
  ["normal", "Normal"],
  ["large", "Large"],
];

export function SettingsPanel({
  settings,
  hasKey,
  onClose,
  onSave,
  onNewChat,
  onQueueChanged,
}: SettingsPanelProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<DrillStats>({ total: 0, due: 0 });
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState("");

  const patch = (part: Partial<Settings>) => setDraft((current) => ({ ...current, ...part }));
  const dirty = apiKey.length > 0 || JSON.stringify(draft) !== JSON.stringify(settings);

  const refreshQueue = useCallback(async () => {
    try {
      setQueue(await ipc.drillStats());
    } catch (problem) {
      console.error("could not read the practice queue", problem);
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

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

  const skipDue = async () => {
    setNotice("");
    try {
      const moved = await ipc.drillSkipDue();
      await refreshQueue();
      onQueueChanged();
      setNotice(moved > 0 ? `${moved} card(s) moved to tomorrow.` : "Nothing was due right now.");
    } catch (problem) {
      setError(String(problem));
    }
  };

  const resetFixes = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setNotice("Click again to erase every saved correction.");
      return;
    }
    setNotice("");
    try {
      const removed = await ipc.drillReset();
      setConfirmReset(false);
      await refreshQueue();
      onQueueChanged();
      setNotice(`${removed} correction(s) cleared.`);
    } catch (problem) {
      setError(String(problem));
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
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="field">
          <span>Eyes</span>
          <div className="levels">
            {[
              ["bars", "Bars"],
              ["dots", "Dots"],
              ["arcs", "Arcs"],
              ["sleepy", "Sleepy"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`chip ${draft.eyeStyle === value ? "chip-on" : ""}`}
                onClick={() => patch({ eyeStyle: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Eye size</span>
          <div className="levels">
            {[
              ["small", "S"],
              ["medium", "M"],
              ["large", "L"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`chip ${draft.eyeSize === value ? "chip-on" : ""}`}
                onClick={() => patch({ eyeSize: value })}
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

        <div className="field">
          <span>Message size</span>
          <div className="levels">
            {TEXT_SIZES.map(([value, label]) => (
              <button
                key={value}
                className={`chip ${draft.textSize === value ? "chip-on" : ""}`}
                onClick={() => patch({ textSize: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="section-title">Learning</div>

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

        <label className="field row">
          <span>Ignore capitalization</span>
          <input
            type="checkbox"
            checked={draft.ignoreCapitalization}
            onChange={(event) => patch({ ignoreCapitalization: event.target.checked })}
          />
        </label>

        <label className="field">
          <span>bubo's personality (optional)</span>
          <textarea
            rows={2}
            value={draft.persona}
            placeholder="e.g. be a bit sarcastic, talk about music"
            onChange={(event) => patch({ persona: event.target.value })}
          />
        </label>

        <div className="section-title">Connection</div>

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

        <div className="section-title">Behavior</div>

        <label className="field">
          <span>Show/hide hotkey</span>
          <input
            value={draft.hotkey}
            onChange={(event) => patch({ hotkey: event.target.value })}
            spellCheck={false}
            placeholder="Ctrl+Alt+B"
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

        <div className="section-title">Practice</div>

        <div className="field">
          <span>
            {queue.due} due · {queue.total} saved
          </span>
          <div className="row-buttons">
            <button className="ghost" onClick={() => void skipDue()}>
              Skip due cards
            </button>
            <button className="ghost danger" onClick={() => void resetFixes()}>
              {confirmReset ? "Click again to erase" : "Reset corrections"}
            </button>
          </div>
          <span className="hint">
            Skipping moves the cards to tomorrow. Resetting deletes every saved correction, including
            the ones in old messages.
          </span>
        </div>

        <div className="section-title">Chat</div>

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

      <div className="settings-footer">
        {error ? (
          <span className="settings-error">{error}</span>
        ) : notice ? (
          <span className="hint">{notice}</span>
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
