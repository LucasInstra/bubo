import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "../lib/ipc";
import { isBeginnerLevel, STUDY_FOCUSES } from "../lib/lessons";
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
  onOpenLessons: () => void;
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
const REPLY_LANGUAGES = [
  ["en", "Só inglês"],
  ["bilingual", "Inglês + português"],
  ["pt", "Só português"],
];
const REPLY_LANGUAGE_HINTS: Record<string, string> = {
  en: "O bubo responde em inglês, no seu nível.",
  bilingual: "O bubo responde em inglês e acrescenta uma tradução curta em português.",
  pt: "O bubo conversa em português e mantém o inglês que você está aprendendo. As correções continuam no inglês que você escreveu.",
};
const TEXT_SIZES = [
  ["small", "Pequeno"],
  ["normal", "Normal"],
  ["large", "Grande"],
];
const THEMES = [
  ["dark", "Escuro"],
  ["light", "Claro"],
  ["system", "Sistema"],
];

function updateLabel(
  status: UpdateStatus,
  version: string,
  progress: number,
  error: string,
): string {
  switch (status) {
    case "checking":
      return "Verificando atualizações...";
    case "available":
      return version ? `A versão ${version} está disponível.` : "Uma atualização está disponível.";
    case "downloading":
      return progress >= 0 ? `Baixando ${progress}%...` : "Baixando...";
    case "ready":
      return "Reiniciando para concluir a atualização...";
    case "current":
      return "Você está na versão mais recente.";
    case "error":
      return error || "Não foi possível verificar atualizações.";
    default:
      return "Pronto para verificar atualizações.";
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
  onOpenLessons,
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
  const chooseReplyLanguage = (language: string) => {
    setDraft((current) => ({
      ...current,
      replyLanguage: language,
      // Portuguese-only is an accessibility choice, so the correction notes
      // should be readable too. The field below can still be changed back.
      noteLanguage: language === "pt" ? "pt" : current.noteLanguage,
    }));
  };
  const provider =
    PROVIDERS.find((preset) => preset.id === providerId) ?? matchProvider(draft.baseUrl);
  const modelOptions = modelChoices(
    testModels.length > 0 ? testModels : provider.models,
    draft.model,
  );
  const dirty = apiKey.length > 0 || JSON.stringify(draft) !== JSON.stringify(settings);
  const beginner = isBeginnerLevel(draft.level);

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
        filters: [{ name: "Certificado", extensions: ["pem", "crt", "cer"] }],
      });
      if (path && !Array.isArray(path)) patch({ caCertPath: path });
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Não foi possível abrir o certificado.");
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
      setTestResult(typeof problem === "string" ? problem : "Não foi possível conectar.");
      setTestModels([]);
    } finally {
      if (run === testRun.current) setTesting(false);
    }
  };

  const save = async (): Promise<boolean> => {
    setBusy(true);
    setError("");
    try {
      await onSave(draft, apiKey);
      setApiKey("");
      return true;
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Não foi possível salvar as configurações.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openLessons = async () => {
    if (dirty && !(await save())) return;
    onOpenLessons();
  };

  const skipDue = async () => {
    setNotice("");
    try {
      const moved = await ipc.drillSkipDue();
      await refreshQueue();
      onQueueChanged();
      setNotice(
        moved > 0 ? `${moved} card(s) movido(s) para amanhã.` : "Nada estava pendente agora.",
      );
    } catch (problem) {
      setError(String(problem));
    }
  };

  const resetFixes = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setNotice("Clique de novo para apagar todas as correções salvas.");
      return;
    }
    setNotice("");
    try {
      const removed = await ipc.drillReset();
      setConfirmReset(false);
      await refreshQueue();
      onQueueChanged();
      onCorrectionsCleared();
      setNotice(`${removed} correção(ões) apagada(s).`);
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
        filters: [{ name: "backup do bubo", extensions: ["db"] }],
      });
      if (!path) return;
      await ipc.backupData(path);
      setNotice(`Backup salvo em ${path}`);
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Não foi possível gravar o backup.");
    } finally {
      setDataBusy(false);
    }
  };

  const restoreData = async () => {
    if (dataBusy) return;
    if (!confirmRestore) {
      setConfirmRestore(true);
      setNotice("Restaurar substitui o histórico atual. Clique de novo para escolher um backup.");
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
        filters: [{ name: "backup do bubo", extensions: ["db"] }],
      });
      if (!path || Array.isArray(path)) return;
      await ipc.restoreData(path);
      window.location.reload();
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Não foi possível restaurar esse backup.");
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
      setNotice("Diagnóstico copiado para a área de transferência.");
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Não foi possível copiar o diagnóstico.");
    }
  };

  const openDataFolder = async () => {
    setError("");
    setNotice("");
    try {
      await ipc.openDataFolder();
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Não foi possível abrir a pasta de dados.");
    }
  };

  const openFeedback = async () => {
    setError("");
    setNotice("");
    try {
      await ipc.openFeedback();
    } catch (problem) {
      setError(
        typeof problem === "string" ? problem : "Não foi possível abrir a página de feedback.",
      );
    }
  };

  return (
    <div
      className="settings"
      role="dialog"
      aria-modal="true"
      aria-label="Configurações"
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="settings-head" data-tauri-drag-region>
        <button className="ghost" onClick={onClose} aria-label="Voltar">
          ←
        </button>
        <span>configurações</span>
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
        <div className="section-title">Aprendizado</div>

        <div className="field">
          <span>Meu nível de inglês</span>
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

        <div className="field">
          <span>Idioma das respostas</span>
          <div className="levels">
            {REPLY_LANGUAGES.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={`chip ${draft.replyLanguage === value ? "chip-on" : ""}`}
                onClick={() => chooseReplyLanguage(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="hint">
            {REPLY_LANGUAGE_HINTS[draft.replyLanguage] ?? REPLY_LANGUAGE_HINTS.en}
          </span>
          {draft.replyLanguage !== "pt" && (
            <span className="hint">Ainda não lê inglês? Escolha Só português.</span>
          )}
        </div>

        {beginner && (
          <>
            <div className="field">
              <label className="field row">
                <span>Desafio antes da tradução</span>
                <input
                  type="checkbox"
                  checked={draft.translationChallenge}
                  onChange={(event) => patch({ translationChallenge: event.target.checked })}
                />
              </label>
              <span className="hint">
                Esconde a tradução no chat completo até você tentar. Dá para revelar na hora se
                travar.
              </span>
            </div>

            <div className="field">
              <span>Foco de estudo</span>
              <div className="levels wrap focus-grid">
                {STUDY_FOCUSES.map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={`chip ${draft.studyFocus === value ? "chip-on" : ""}`}
                    onClick={() => patch({ studyFocus: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="hint">
                O bubo puxa esse assunto e prioriza correções relacionadas.
              </span>
            </div>

            <div className="field">
              <span>Mini-lições</span>
              <button
                type="button"
                className="action-button"
                disabled={busy}
                onClick={() => void openLessons()}
              >
                Abrir lições de gramática
              </button>
              <span className="hint">Sete lições curtas, com um exercício por passo.</span>
            </div>
          </>
        )}

        <label className="field row">
          <span>Ignorar maiúsculas</span>
          <input
            type="checkbox"
            checked={draft.ignoreCapitalization}
            onChange={(event) => patch({ ignoreCapitalization: event.target.checked })}
          />
        </label>

        <div className="field">
          <span>Notas das correções</span>
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
          <span className="hint">Idioma da nota curta em cada nova correção.</span>
        </div>

        <div className="section-title">Conexão</div>

        <div className="field">
          <span>Provedor</span>
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
          <span>URL base</span>
          <input
            value={draft.baseUrl}
            onChange={(event) => updateBaseUrl(event.target.value)}
            spellCheck={false}
            placeholder="https://api.example.com/v1"
          />
        </label>

        <label className="field">
          <span>URL do proxy (opcional)</span>
          <input
            value={draft.proxyUrl}
            onChange={(event) => patch({ proxyUrl: event.target.value })}
            spellCheck={false}
            placeholder="http://proxy.company.com:8080"
          />
          <span className="hint">Proxy HTTP ou HTTPS para redes corporativas.</span>
        </label>

        <div className="field">
          <span>Certificado CA personalizado (opcional)</span>
          <div className="row-buttons">
            <input
              className="path-input"
              value={draft.caCertPath}
              onChange={(event) => patch({ caCertPath: event.target.value })}
              spellCheck={false}
              placeholder="C:\path\to\company-ca.pem"
            />
            <button className="ghost" type="button" onClick={() => void chooseCa()}>
              Escolher...
            </button>
          </div>
          <span className="hint">Certificado raiz PEM para inspeção SSL corporativa.</span>
        </div>

        <div className="field">
          <label htmlFor="bubo-model">Modelo</label>
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
              placeholder="id do modelo"
              autoComplete="off"
              aria-haspopup="listbox"
              aria-expanded={modelOpen}
              aria-controls={modelOpen ? "bubo-model-options" : undefined}
            />
            <button
              type="button"
              className={`combo-toggle ${modelOpen ? "open" : ""}`}
              aria-label="Escolher modelo"
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
                aria-label="Opções de modelo"
              >
                {modelOptions.length === 0 ? (
                  <span className="combo-empty">
                    Sem sugestões ainda. Digite um id de modelo ou teste a conexão.
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
              ? `${testModels.length} modelo${testModels.length === 1 ? "" : "s"} do endpoint.`
              : `Digite qualquer id de modelo ou escolha uma sugestão de ${provider.label}.`}
          </span>
        </div>

        <label className="field">
          <span>Chave de API {hasKey && <em className="ok">salva</em>}</span>
          <input
            type="password"
            value={apiKey}
            placeholder={hasKey ? "•••••••• (manter atual)" : provider.keyHint}
            onChange={(event) => {
              setApiKey(event.target.value);
              resetTest();
            }}
            spellCheck={false}
          />
          <span className="hint">
            Armazenada no Gerenciador de Credenciais do Windows. {provider.keySite}
          </span>
        </label>

        <div className="row-buttons">
          <button className="ghost" type="button" onClick={() => void test()} disabled={testing}>
            {testing ? "testando..." : "Testar conexão"}
          </button>
          {testResult && (
            <span className={`hint ${testOk ? "test-ok" : "test-err"}`}>{testResult}</span>
          )}
        </div>

        <div className="section-title">Comportamento</div>

        <div className="field">
          <span>Atalho para mostrar/ocultar</span>
          <HotkeyInput value={draft.hotkey} onChange={(hotkey) => patch({ hotkey })} />
        </div>

        <label className="field row">
          <span>Iniciar com o Windows</span>
          <input
            type="checkbox"
            checked={draft.autostart}
            onChange={(event) => patch({ autostart: event.target.checked })}
          />
        </label>

        <label className="field row">
          <span>Iniciar oculto</span>
          <input
            type="checkbox"
            checked={draft.startHidden}
            onChange={(event) => patch({ startHidden: event.target.checked })}
          />
        </label>

        <div className="field note">
          <span>
            Combine Ctrl, Alt ou Super (Win) com uma tecla, como <code>Ctrl+Alt+B</code>. ESC oculta
            a janela.
          </span>
        </div>

        <div className="section-title">Prática</div>

        <div className="settings-card">
          <span className="settings-card-title">Meta e lembrete</span>
          <div className="field">
            <span>Meta diária de revisões</span>
            <input
              type="number"
              min={0}
              max={200}
              value={draft.dailyGoal}
              onChange={(event) =>
                patch({ dailyGoal: Math.max(0, Math.min(200, Number(event.target.value) || 0)) })
              }
            />
            <span className="hint">Revisões por dia. Use 0 para desativar a meta.</span>
          </div>
          <label className="field row">
            <span>Lembrete diário</span>
            <input
              type="checkbox"
              checked={draft.reminders}
              onChange={(event) => patch({ reminders: event.target.checked })}
            />
          </label>
        </div>

        <div className="settings-card">
          <div className="settings-card-head">
            <span className="settings-card-title">Cards</span>
            <span className="settings-count">
              {queue.due} {queue.due === 1 ? "pendente" : "pendentes"} · {queue.total}{" "}
              {queue.total === 1 ? "salvo" : "salvos"}
            </span>
          </div>
          <div className="action-grid two">
            <button className="action-button" onClick={() => void skipDue()}>
              Adiar cards pendentes
            </button>
            <button className="action-button danger" onClick={() => void resetFixes()}>
              {confirmReset ? "Clique de novo para apagar" : "Apagar correções"}
            </button>
          </div>
          <span className="hint">
            Adiar move os cards para amanhã. Apagar remove todas as correções salvas, inclusive as
            de mensagens antigas.
          </span>
        </div>

        <div className="section-title">Aparência</div>

        <div className="field">
          <span>Tamanho das mensagens</span>
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

        <div className="field">
          <span>Tema</span>
          <div className="levels">
            {THEMES.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={`chip ${draft.theme === value ? "chip-on" : ""}`}
                onClick={() => patch({ theme: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="section-title">Dados</div>

        <div className="settings-card">
          <span className="settings-card-title">Backup</span>
          <div className="action-grid two">
            <button className="action-button" onClick={() => void backupData()} disabled={dataBusy}>
              Fazer backup
            </button>
            <button
              className="action-button danger"
              onClick={() => void restoreData()}
              disabled={dataBusy}
            >
              {confirmRestore ? "Clique de novo para restaurar" : "Restaurar backup"}
            </button>
          </div>
          <span className="hint">
            O backup inclui histórico, correções e progresso. A chave de API fica no Gerenciador de
            Credenciais do Windows.
          </span>
        </div>

        <div className="settings-card">
          <span className="settings-card-title">Diagnóstico</span>
          <div className="action-grid two">
            <button className="action-button" onClick={() => void openDataFolder()}>
              Abrir pasta de dados
            </button>
            <button className="action-button" onClick={() => void copyDiagnostics()}>
              Copiar diagnóstico
            </button>
          </div>
        </div>

        <div className="settings-card">
          <span className="settings-card-title">Feedback</span>
          <button className="action-button" onClick={() => void openFeedback()}>
            Abrir uma issue no GitHub
          </button>
          <span className="hint">
            Encontrou um bug ou tem uma sugestão? Abra uma issue. Se for um bug, copie o diagnóstico
            acima e cole junto.
          </span>
        </div>

        <div className="section-title">Atualizações</div>

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
            <strong>bubo {currentVersion || "desconhecida"}</strong>
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
            <span className="update-hint">
              As atualizações são verificadas quando o bubo inicia.
            </span>
          </div>

          <div className="update-actions">
            {updateStatus === "available" ? (
              <button className="primary" type="button" onClick={() => void onInstallUpdate()}>
                Instalar {updateVersion}
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
                  ? "Verificando..."
                  : updateStatus === "error"
                    ? "Tentar de novo"
                    : updateStatus === "idle"
                      ? "Verificar atualizações"
                      : "Verificar de novo"}
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
          <span className="hint">{dirty ? "alterações não salvas" : ""}</span>
        )}
        <button className="primary" onClick={save} disabled={busy || !dirty}>
          {busy ? "salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
