import { useState } from "react";
import type { ReactNode } from "react";
import { ipc } from "../lib/ipc";
import { PROVIDERS, providerFromKey } from "../lib/providers";
import type { Settings } from "../lib/types";
import { Mascot } from "./Mascot";

interface OnboardingProps {
  settings: Settings;
  onConnect: (next: Settings, apiKey: string) => Promise<void>;
  /** Leaves the wizard without a key so history, practice and settings are reachable. */
  onDismiss: () => void;
  /** Optional update pill, so a new release is not hidden behind the first run. */
  updateNotice?: ReactNode;
}

type Mode = "groq" | "key" | "ollama" | "custom";
type KeyProvider = "groq" | "openai" | "openrouter";

const groq = PROVIDERS.find((provider) => provider.id === "groq")!;
const openai = PROVIDERS.find((provider) => provider.id === "openai")!;
const openrouter = PROVIDERS.find((provider) => provider.id === "openrouter")!;
const ollama = PROVIDERS.find((provider) => provider.id === "ollama")!;

const PATHS: Array<{ mode: Mode; title: string; hint: string }> = [
  { mode: "groq", title: "Groq", hint: "Grátis e rápido" },
  { mode: "key", title: "Já tenho uma chave", hint: "OpenAI, OpenRouter ou Groq" },
  { mode: "ollama", title: "Rodar no PC", hint: "Sem chave, com Ollama" },
  { mode: "custom", title: "Outro endpoint", hint: "Para quem já usa um proxy" },
];

export function Onboarding({ settings, onConnect, onDismiss, updateNotice }: OnboardingProps) {
  const [mode, setMode] = useState<Mode>("groq");
  const [keyProvider, setKeyProvider] = useState<KeyProvider>("groq");
  const [apiKey, setApiKey] = useState("");
  const [customUrl, setCustomUrl] = useState(settings.baseUrl);
  const [customModel, setCustomModel] = useState(settings.model);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [testOk, setTestOk] = useState(false);
  const [testFailed, setTestFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const keyProviderPreset =
    keyProvider === "openai" ? openai : keyProvider === "openrouter" ? openrouter : groq;
  const provider =
    mode === "groq" ? groq : mode === "ollama" ? ollama : mode === "key" ? keyProviderPreset : null;
  const baseUrl = mode === "custom" ? customUrl.trim() : (provider?.baseUrl ?? "");
  const model = mode === "custom" ? customModel.trim() : (provider?.models[0] ?? "");
  const localCustom =
    mode === "custom" && /(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)/i.test(baseUrl);
  const keyless = mode === "ollama" || localCustom;
  const canStart = keyless || apiKey.trim().length > 0;

  const resetTest = () => {
    setTestResult("");
    setTestOk(false);
    setTestFailed(false);
    setError("");
  };

  const chooseMode = (next: Mode) => {
    setMode(next);
    resetTest();
  };

  const updateKey = (value: string) => {
    setApiKey(value);
    resetTest();
    const detected = providerFromKey(value);
    if (detected?.id === "groq" || detected?.id === "openai" || detected?.id === "openrouter") {
      setKeyProvider(detected.id);
    }
  };

  const chooseKeyProvider = (next: KeyProvider) => {
    setKeyProvider(next);
    resetTest();
  };

  const openSite = (id: string) => {
    void ipc.openProviderSite(id).catch((problem) => {
      console.error("could not open the provider site", problem);
      setError("Não foi possível abrir o site. Copie o endereço e abra no navegador.");
    });
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) updateKey(text.trim());
    } catch {
      setError("Não consegui ler a área de transferência. Use Ctrl+V.");
    }
  };

  const test = async (): Promise<boolean> => {
    if (!keyless && !apiKey.trim()) {
      setTestFailed(true);
      setTestResult("Cole sua chave primeiro.");
      return false;
    }
    if (mode === "custom" && !baseUrl) {
      setTestFailed(true);
      setTestResult("Informe a URL do endpoint.");
      return false;
    }

    setTesting(true);
    resetTest();
    try {
      const result = await ipc.testConnection(
        { ...settings, baseUrl, model },
        keyless ? "" : apiKey.trim(),
      );
      const count = result.models?.length ?? 0;
      setTestOk(true);
      setTestResult(
        count > 0
          ? `Conectado! ${count} modelos disponíveis.`
          : "Conectado! O bubo já pode conversar.",
      );
      return true;
    } catch (problem) {
      setTestFailed(true);
      setTestResult(typeof problem === "string" ? problem : "Não foi possível conectar.");
      return false;
    } finally {
      setTesting(false);
    }
  };

  const connect = async () => {
    if (!keyless && !apiKey.trim()) {
      setTestFailed(true);
      setTestResult("Cole sua chave primeiro.");
      return;
    }
    if (mode === "custom" && !baseUrl) {
      setTestFailed(true);
      setTestResult("Informe a URL do endpoint.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await onConnect({ ...settings, baseUrl, model }, keyless ? "" : apiKey.trim());
    } catch (problem) {
      setError(typeof problem === "string" ? problem : "Não foi possível salvar a conexão.");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (testing || busy) return;
    if (!testOk) {
      const passed = await test();
      if (!passed) return;
    }
    await connect();
  };

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-label="Configurar o bubo">
      <div className="onboarding-card">
        <header className="onboarding-head" data-tauri-drag-region>
          <span className="onboarding-face">
            <Mascot
              state="idle"
              mood="happy"
              size={64}
              canvasPadding={0.5}
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
          <div className="onboarding-title">
            <span className="lesson-kicker">primeiro passo</span>
            <h1>Vamos colocar o bubo para conversar</h1>
            <p>
              Ele precisa de uma chave de IA. Pense nela como uma senha: fica só no seu computador.
            </p>
          </div>
          <button
            className="ghost icon onboarding-hide"
            type="button"
            aria-label="Configurar depois"
            title="Configurar depois"
            onClick={onDismiss}
          >
            ×
          </button>
        </header>

        <div className="onboarding-body">
          {updateNotice}
          <div className="onboarding-paths" role="tablist" aria-label="Formas de conectar">
            {PATHS.map((path) => (
              <button
                key={path.mode}
                type="button"
                role="tab"
                aria-selected={mode === path.mode}
                className={`onboarding-path ${mode === path.mode ? "on" : ""}`}
                onClick={() => chooseMode(path.mode)}
              >
                <strong>{path.title}</strong>
                <span>{path.hint}</span>
              </button>
            ))}
          </div>

          {mode === "groq" && (
            <>
              <div className="onboarding-callout">
                <strong>Grátis para começar.</strong> A Groq tem um plano gratuito e é o caminho
                mais rápido. Leva uns 2 minutos.
              </div>
              <ol className="onboarding-steps">
                <li>
                  <span className="onboarding-step-number">1</span>
                  <div>
                    <strong>Abra o console da Groq</strong>
                    <p>O link abre a página de chaves. Crie a conta com Google ou GitHub.</p>
                    <button
                      type="button"
                      className="ghost onboarding-link"
                      onClick={() => openSite("groq")}
                    >
                      Abrir console da Groq
                    </button>
                  </div>
                </li>
                <li>
                  <span className="onboarding-step-number">2</span>
                  <div>
                    <strong>Clique em Create API Key</strong>
                    <p>Dê o nome "bubo" e copie a chave que começa com gsk_.</p>
                  </div>
                </li>
                <li>
                  <span className="onboarding-step-number">3</span>
                  <div>
                    <strong>Cole aqui e teste</strong>
                    <p>A chave fica no Gerenciador de Credenciais do Windows.</p>
                  </div>
                </li>
              </ol>
            </>
          )}

          {mode === "key" && (
            <div className="onboarding-callout">
              <strong>Já tem uma chave?</strong> Cole abaixo. O bubo reconhece o provedor pelo
              começo da chave, mas você pode escolher na mão.
            </div>
          )}

          {mode === "ollama" && (
            <>
              <div className="onboarding-callout">
                <strong>Sem chave.</strong> O modelo roda no seu computador e nada sai da sua
                máquina. Precisa de um PC com pelo menos 8 GB de RAM.
              </div>
              <ol className="onboarding-steps">
                <li>
                  <span className="onboarding-step-number">1</span>
                  <div>
                    <strong>Baixe o Ollama</strong>
                    <p>Instale e abra o programa. Ele fica rodando em segundo plano.</p>
                    <button
                      type="button"
                      className="ghost onboarding-link"
                      onClick={() => openSite("ollama")}
                    >
                      Abrir site do Ollama
                    </button>
                  </div>
                </li>
                <li>
                  <span className="onboarding-step-number">2</span>
                  <div>
                    <strong>Baixe um modelo</strong>
                    <p>
                      No terminal, rode <code>ollama pull llama3.2</code>. O primeiro download pode
                      demorar.
                    </p>
                  </div>
                </li>
                <li>
                  <span className="onboarding-step-number">3</span>
                  <div>
                    <strong>Volte e teste</strong>
                    <p>Com o Ollama aberto, clique em testar. Não precisa de chave.</p>
                  </div>
                </li>
              </ol>
            </>
          )}

          {mode === "custom" && (
            <div className="onboarding-custom">
              <label className="field">
                <span>URL do endpoint</span>
                <input
                  value={customUrl}
                  onChange={(event) => {
                    setCustomUrl(event.target.value);
                    resetTest();
                  }}
                  placeholder="https://seu-servidor/v1"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span>Modelo</span>
                <input
                  value={customModel}
                  onChange={(event) => {
                    setCustomModel(event.target.value);
                    resetTest();
                  }}
                  placeholder="nome-do-modelo"
                  spellCheck={false}
                />
              </label>
              <span className="hint">
                Para endpoints compatíveis com OpenAI. Se o servidor for local, a chave pode ficar
                em branco.
              </span>
            </div>
          )}

          {mode === "key" && (
            <div className="onboarding-providers" role="group" aria-label="Provedor da chave">
              {[
                ["groq", "Groq"],
                ["openai", "OpenAI"],
                ["openrouter", "OpenRouter"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`chip ${keyProvider === id ? "chip-on" : ""}`}
                  onClick={() => chooseKeyProvider(id as KeyProvider)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {!keyless && (
            <label className="field">
              <span>
                {mode === "key"
                  ? `Cole sua chave da ${keyProviderPreset.label}`
                  : mode === "custom"
                    ? "Chave de API (opcional para servidor local)"
                    : "Cole sua chave da Groq"}
              </span>
              <div className="onboarding-key">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => updateKey(event.target.value)}
                  placeholder={provider?.keyHint ?? "sua chave"}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button type="button" className="ghost" onClick={() => void paste()}>
                  Colar
                </button>
              </div>
              {mode === "key" && (
                <span className="hint">
                  Reconhecido como {keyProviderPreset.label}. Se não for, escolha o provedor acima.
                </span>
              )}
            </label>
          )}

          {mode === "ollama" && (
            <div className="onboarding-key">
              <span className="hint">Nenhuma chave necessária para o Ollama.</span>
            </div>
          )}

          <div className="onboarding-actions">
            <button
              type="button"
              className="primary"
              disabled={!canStart || testing || busy}
              onClick={() => void start()}
            >
              {busy ? "salvando..." : testing ? "testando..." : "Começar a conversar"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!canStart || testing || busy}
              onClick={() => void test()}
            >
              {testing ? "testando..." : "Testar conexão"}
            </button>
            <button
              type="button"
              className="ghost onboarding-later"
              disabled={busy}
              onClick={onDismiss}
            >
              Depois
            </button>
          </div>

          {testResult && (
            <div className={`onboarding-result ${testOk ? "good" : "bad"}`} role="status">
              {testResult}
            </div>
          )}
          {testFailed && !testOk && (
            <button
              type="button"
              className="ghost onboarding-save-anyway"
              disabled={busy}
              onClick={() => void connect()}
            >
              Salvar mesmo assim
            </button>
          )}
          {error && <div className="settings-error">{error}</div>}

          <p className="onboarding-privacy">
            A chave fica no Gerenciador de Credenciais do Windows. O bubo fala direto com o provedor
            escolhido, sem passar pelos nossos servidores.
          </p>
        </div>
      </div>
    </div>
  );
}
