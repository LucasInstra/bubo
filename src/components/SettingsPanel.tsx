import { useCallback, useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import { matchProvider, PROVIDERS, type ProviderPreset } from "../lib/providers";
import type { DrillStats, Settings } from "../lib/types";

interface SettingsPanelProps {
  settings: Settings;
  hasKey: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  onSave: (next: Settings, apiKey: string) => Promise<void>;
  onNewChat: () => Promise<void>;
  onQueueChanged: () => void;
  onCorrectionsCleared: () => void;
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
  pinned,
  onTogglePin,
  onClose,
  onSave,
  onNewChat,
  onQueueChanged,
  onCorrectionsCleared,
}: SettingsPanelProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<DrillStats>({ total: 0, due: 0 });
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState("");
  const [providerId, setProviderId] = useState(() => matchProvider(settings.baseUrl).id);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [testOk, setTestOk] = useState(false);

  const patch = (part: Partial<Settings>) => setDraft((current) => ({ ...current, ...part }));
  const provider =
    PROVIDERS.find((preset) => preset.id === providerId) ?? matchProvider(draft.baseUrl);
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

  useEffect(() => {
    if (!confirmReset) return;
    const timer = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmReset]);

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

  const chooseProvider = (preset: ProviderPreset) => {
    setProviderId(preset.id);
    setTestResult("");
    if (preset.id === "custom") {
      patch({ baseUrl: "" });
      return;
    }
    patch({ baseUrl: preset.baseUrl, model: preset.models[0] ?? draft.model });
  };

  const updateBaseUrl = (value: string) => {
    setProviderId(matchProvider(value).id);
    setTestResult("");
    patch({ baseUrl: value });
  };

  const test = async () => {
    setTesting(true);
    setTestResult("");
    try {
      const message = await ipc.testConnection(draft, apiKey);
      setTestOk(true);
      setTestResult(message);
    } catch (problem) {
      setTestOk(false);
      setTestResult(typeof problem === "string" ? problem : "Could not connect.");
    } finally {
      setTesting(false);
    }
  };

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
      onCorrectionsCleared();
      setNotice(`${removed} correction(s) cleared.`);
    } catch (problem) {
      setError(String(problem));
    }
  };

  return (
    <div className="settings" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="settings-head">
        <button className="ghost" onClick={onClose} aria-label="Back">
          ←
        </button>
        <span>settings</span>
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
        <div className="section-title">Learning</div>

        <div className="field">
          <span>My English level</span>
          <div className="levels">
            {LEVELS.map((level) => (
              <button
                type="button"
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

        <div className="section-title">Connection</div>

        <div className="field">
          <span>Provider</span>
          <div className="levels wrap">
            {PROVIDERS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`chip ${provider.id === preset.id ? "chip-on" : ""}`}
                onClick={() => chooseProvider(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Base URL</span>
          <input
            value={draft.baseUrl}
            onChange={(event) => updateBaseUrl(event.target.value)}
            spellCheck={false}
            placeholder="https://api.example.com/v1"
          />
        </label>

        <label className="field">
          <span>Model</span>
          <input
            list="bubo-models"
            value={draft.model}
            onChange={(event) => patch({ model: event.target.value })}
            spellCheck={false}
            placeholder="model id"
          />
          {provider.models.length > 0 && (
            <datalist id="bubo-models">
              {provider.models.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          )}
          <span className="hint">
            Type any model id, or pick a suggestion from {provider.label}.
          </span>
        </label>

        <label className="field">
          <span>API key {hasKey && <em className="ok">saved</em>}</span>
          <input
            type="password"
            value={apiKey}
            placeholder={hasKey ? "•••••••• (keep current)" : provider.keyHint}
            onChange={(event) => {
              setApiKey(event.target.value);
              setTestResult("");
            }}
            spellCheck={false}
          />
          <span className="hint">Stored in the Windows Credential Manager. {provider.keySite}</span>
        </label>

        <div className="row-buttons">
          <button className="ghost" type="button" onClick={() => void test()} disabled={testing}>
            {testing ? "testing..." : "Test connection"}
          </button>
          {testResult && (
            <span className={`hint ${testOk ? "test-ok" : "test-err"}`}>{testResult}</span>
          )}
        </div>

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
            Skipping moves the cards to tomorrow. Resetting deletes every saved correction,
            including the ones in old messages.
          </span>
        </div>

        <div className="section-title">Chat</div>

        <div className="field">
          <span>Message size</span>
          <div className="levels">
            {TEXT_SIZES.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={`chip ${draft.textSize === value ? "chip-on" : ""}`}
                onClick={() => patch({ textSize: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

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
