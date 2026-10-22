import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "../lib/ipc";
import { useModalFocus } from "../lib/modal";
import { matchProvider, PROVIDERS, type ProviderPreset } from "../lib/providers";
import type { DrillStats, Settings } from "../lib/types";
import type { UpdateStatus } from "../lib/updater";
import { HotkeyInput } from "./HotkeyInput";

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
  currentVersion: string;
  updateStatus: UpdateStatus;
  updateVersion: string;
  updateNotes: string;
  updateProgress: number;
  updateError: string;
  onCheckUpdate: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
}

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const TEXT_SIZES = [
  ["small", "Small"],
  ["normal", "Normal"],
  ["large", "Large"],
];

function updateLabel(
  status: UpdateStatus,
  version: string,
  progress: number,
  error: string,
): string {
  switch (status) {
    case "checking":
      return "Checking for updates...";
    case "available":
      return version ? `Version ${version} is available.` : "An update is available.";
    case "downloading":
      return progress >= 0 ? `Downloading ${progress}%...` : "Downloading...";
    case "ready":
      return "Restarting to finish the update...";
    case "current":
      return "You are on the latest version.";
    case "error":
      return error || "Could not check for updates.";
    default:
      return "Ready to check for updates.";
  }
}

function modelChoices(source: string[], selected: string): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const model of source) {
    const value = model.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push(value);
  }
  if (selected && !seen.has(selected)) options.push(selected);
  return options;
}

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
  currentVersion,
  updateStatus,
  updateVersion,
  updateNotes,
  updateProgress,
  updateError,
  onCheckUpdate,
  onInstallUpdate,
}: SettingsPanelProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<DrillStats>({ total: 0, due: 0 });
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [dataBusy, setDataBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [providerId, setProviderId] = useState(() => matchProvider(settings.baseUrl).id);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [testOk, setTestOk] = useState(false);
  const [testModels, setTestModels] = useState<string[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const testRun = useRef(0);

  useModalFocus(dialogRef);

  const patch = (part: Partial<Settings>) => setDraft((current) => ({ ...current, ...part }));
  const provider =
    PROVIDERS.find((preset) => preset.id === providerId) ?? matchProvider(draft.baseUrl);
  const modelOptions = modelChoices(
    testModels.length > 0 ? testModels : provider.models,
    draft.model,
  );
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
    if (!confirmRestore) return;
    const timer = setTimeout(() => setConfirmRestore(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmRestore]);

  useEffect(() => {
    if (!modelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as Node | null;
      if (!comboRef.current || !target || !comboRef.current.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      setModelOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [modelOpen]);

  const resetTest = () => {
    // Invalidate a test that is still in flight, so a late response cannot
    // repopulate the model list for an endpoint the user already changed.
    testRun.current += 1;
    setTesting(false);
    setTestResult("");
    setTestModels([]);
    setTestOk(false);
    setModelOpen(false);
  };

  const chooseProvider = (preset: ProviderPreset) => {
    setProviderId(preset.id);
    resetTest();
    if (preset.id === "custom") {
      patch({ baseUrl: "" });
      return;
    }
    patch({ baseUrl: preset.baseUrl, model: preset.models[0] ?? draft.model });
  };

  const updateBaseUrl = (value: string) => {
    setProviderId(matchProvider(value).id);
    resetTest();
    patch({ baseUrl: value });
  };

  const chooseCa = async () => {
    try {
      const path = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "Certificate", extensions: ["pem", "crt", "cer"] }],
      });
      if (path && !Array.isArray(path)) patch({ caCertPath: path });
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Could not open the certificate.");
    }
  };

  const test = async () => {
    const run = testRun.current + 1;
    testRun.current = run;
    setTesting(true);
    setTestResult("");
    setTestModels([]);
    setModelOpen(false);
    try {
      const result = await ipc.testConnection(draft, apiKey);
      if (run !== testRun.current) return;
      setTestOk(true);
      setTestResult(result.message);
      setTestModels(result.models ?? []);
    } catch (problem) {
      if (run !== testRun.current) return;
      setTestOk(false);
      setTestResult(typeof problem === "string" ? problem : "Could not connect.");
      setTestModels([]);
    } finally {
      if (run === testRun.current) setTesting(false);
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

  const backupData = async () => {
    if (dataBusy) return;
    setError("");
    setNotice("");
    setDataBusy(true);
    try {
      const path = await saveDialog({
        defaultPath: `bubo-backup-${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: "bubo backup", extensions: ["db"] }],
      });
      if (!path) return;
      await ipc.backupData(path);
      setNotice(`Backup saved to ${path}`);
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Could not write the backup.");
    } finally {
      setDataBusy(false);
    }
  };

  const restoreData = async () => {
    if (dataBusy) return;
    if (!confirmRestore) {
      setConfirmRestore(true);
      setNotice("Restoring replaces the current history. Click again to choose a backup.");
      return;
    }
    setConfirmRestore(false);
    setError("");
    setNotice("");
    setDataBusy(true);
    try {
      const path = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "bubo backup", extensions: ["db"] }],
      });
      if (!path || Array.isArray(path)) return;
      await ipc.restoreData(path);
      window.location.reload();
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Could not restore that backup.");
    } finally {
      setDataBusy(false);
    }
  };

  const copyDiagnostics = async () => {
    setError("");
    setNotice("");
    try {
      const text = await ipc.diagnostics();
      await navigator.clipboard.writeText(text);
      setNotice("Diagnostics copied to the clipboard.");
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Could not copy diagnostics.");
    }
  };

  const openDataFolder = async () => {
    setError("");
    setNotice("");
    try {
      await ipc.openDataFolder();
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Could not open the data folder.");
    }
  };

  return (
    <div
      className="settings"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="settings-head" data-tauri-drag-region>
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

        <div className="field">
          <span>Correction notes</span>
          <div className="levels">
            <button
              type="button"
              className={`chip ${draft.noteLanguage === "pt" ? "chip-on" : ""}`}
              onClick={() => patch({ noteLanguage: "pt" })}
            >
              PT-BR
            </button>
            <button
              type="button"
              className={`chip ${draft.noteLanguage === "en" ? "chip-on" : ""}`}
              onClick={() => patch({ noteLanguage: "en" })}
            >
              English
            </button>
          </div>
          <span className="hint">Language of the short note under each new correction.</span>
        </div>

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
          <span>Proxy URL (optional)</span>
          <input
            value={draft.proxyUrl}
            onChange={(event) => patch({ proxyUrl: event.target.value })}
            spellCheck={false}
            placeholder="http://proxy.company.com:8080"
          />
          <span className="hint">HTTP or HTTPS proxy for company networks.</span>
        </label>

        <div className="field">
          <span>Custom CA certificate (optional)</span>
          <div className="row-buttons">
            <input
              className="path-input"
              value={draft.caCertPath}
              onChange={(event) => patch({ caCertPath: event.target.value })}
              spellCheck={false}
              placeholder="C:\path\to\company-ca.pem"
            />
            <button className="ghost" type="button" onClick={() => void chooseCa()}>
              Choose...
            </button>
          </div>
          <span className="hint">PEM root certificate for corporate SSL inspection.</span>
        </div>

        <div className="field">
          <label htmlFor="bubo-model">Model</label>
          <div
            className="combo"
            ref={comboRef}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setModelOpen(false);
              }
            }}
          >
            <input
              id="bubo-model"
              value={draft.model}
              onChange={(event) => patch({ model: event.target.value })}
              spellCheck={false}
              placeholder="model id"
              autoComplete="off"
              aria-haspopup="listbox"
              aria-expanded={modelOpen}
              aria-controls={modelOpen ? "bubo-model-options" : undefined}
            />
            <button
              type="button"
              className={`combo-toggle ${modelOpen ? "open" : ""}`}
              aria-label="Choose model"
              aria-expanded={modelOpen}
              aria-controls="bubo-model-options"
              onClick={() => setModelOpen((open) => !open)}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {modelOpen && (
              <div
                className="combo-list"
                id="bubo-model-options"
                role="listbox"
                aria-label="Model options"
              >
                {modelOptions.length === 0 ? (
                  <span className="combo-empty">
                    No suggestions yet. Type a model id or test the connection.
                  </span>
                ) : (
                  modelOptions.map((model) => (
                    <button
                      key={model}
                      type="button"
                      role="option"
                      aria-selected={draft.model === model}
                      className={`combo-option ${draft.model === model ? "on" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        patch({ model });
                        setModelOpen(false);
                      }}
                    >
                      <span className="combo-option-label">{model}</span>
                      {draft.model === model && (
                        <span className="combo-check" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <span className="hint">
            {testModels.length > 0
              ? `${testModels.length} model${testModels.length === 1 ? "" : "s"} from the endpoint.`
              : `Type any model id, or pick a suggestion from ${provider.label}.`}
          </span>
        </div>

        <label className="field">
          <span>API key {hasKey && <em className="ok">saved</em>}</span>
          <input
            type="password"
            value={apiKey}
            placeholder={hasKey ? "•••••••• (keep current)" : provider.keyHint}
            onChange={(event) => {
              setApiKey(event.target.value);
              resetTest();
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

        <div className="field">
          <span>Show/hide hotkey</span>
          <HotkeyInput value={draft.hotkey} onChange={(hotkey) => patch({ hotkey })} />
        </div>

        <label className="field row">
          <span>Start with Windows</span>
          <input
            type="checkbox"
            checked={draft.autostart}
            onChange={(event) => patch({ autostart: event.target.checked })}
          />
        </label>

        <label className="field row">
          <span>Start hidden</span>
          <input
            type="checkbox"
            checked={draft.startHidden}
            onChange={(event) => patch({ startHidden: event.target.checked })}
          />
        </label>

        <div className="field note">
          <span>
            Combine Ctrl, Alt or Super (Win) with a key, like <code>Ctrl+Alt+B</code>. ESC hides the
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

        <div className="section-title">Data</div>

        <div className="field">
          <span>Backup and diagnostics</span>
          <div className="row-buttons data-actions">
            <button className="ghost" onClick={() => void backupData()} disabled={dataBusy}>
              Back up data
            </button>
            <button className="ghost danger" onClick={() => void restoreData()} disabled={dataBusy}>
              {confirmRestore ? "Click again to restore" : "Restore backup"}
            </button>
            <button className="ghost" onClick={() => void openDataFolder()}>
              Open data folder
            </button>
            <button className="ghost" onClick={() => void copyDiagnostics()}>
              Copy diagnostics
            </button>
          </div>
          <span className="hint">
            Backups include history, corrections and progress. The API key stays in Windows
            Credential Manager.
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

        <div className="section-title">Window</div>

        <label className="field row">
          <span>Popup mode</span>
          <input
            type="checkbox"
            checked={draft.popup}
            onChange={(event) => patch({ popup: event.target.checked, compact: false })}
          />
        </label>

        <div className="field note">
          <span>
            Leaves only bubo on the desktop. Double-click the face to open the composer; Esc
            collapses it again.
          </span>
        </div>

        <div className="section-title">Updates</div>

        <div className="update-card">
          <span className="update-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v11m0 0-4-4m4 4 4-4M5 20h14" />
            </svg>
          </span>

          <div className="update-copy">
            <strong>bubo {currentVersion || "unknown"}</strong>
            <span
              className={`update-status ${updateStatus === "error" ? "is-error" : ""}`}
              role="status"
              aria-live="polite"
            >
              {updateLabel(updateStatus, updateVersion, updateProgress, updateError)}
            </span>
            {updateStatus === "downloading" && updateProgress >= 0 && (
              <div className="update-progress" aria-hidden="true">
                <span style={{ width: `${updateProgress}%` }} />
              </div>
            )}
            {updateStatus === "available" && updateNotes && (
              <div className="update-notes">{updateNotes}</div>
            )}
            <span className="update-hint">Updates are checked when bubo starts.</span>
          </div>

          <div className="update-actions">
            {updateStatus === "available" ? (
              <button className="primary" type="button" onClick={() => void onInstallUpdate()}>
                Install {updateVersion}
              </button>
            ) : (
              <button
                className="ghost"
                type="button"
                onClick={() => void onCheckUpdate()}
                disabled={
                  updateStatus === "checking" ||
                  updateStatus === "downloading" ||
                  updateStatus === "ready"
                }
              >
                {updateStatus === "checking"
                  ? "Checking..."
                  : updateStatus === "error"
                    ? "Try again"
                    : updateStatus === "idle"
                      ? "Check for updates"
                      : "Check again"}
              </button>
            )}
          </div>
        </div>
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
