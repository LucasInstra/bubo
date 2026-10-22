export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  models: string[];
  keyHint: string;
  keySite: string;
}

const CUSTOM: ProviderPreset = {
  id: "custom",
  label: "Personalizado",
  baseUrl: "",
  models: [],
  keyHint: "a chave do seu provedor",
  keySite: "",
};

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"],
    keyHint: "gsk_...",
    keySite: "Obtenha uma em console.groq.com/keys.",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
    keyHint: "sk-...",
    keySite: "Obtenha uma em platform.openai.com/api-keys.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4", "google/gemini-2.5-flash"],
    keyHint: "sk-or-...",
    keySite: "Obtenha uma em openrouter.ai/keys.",
  },
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    models: ["llama3.2", "qwen2.5:7b", "mistral"],
    keyHint: "qualquer valor serve, por exemplo ollama",
    keySite: "Qualquer valor serve para um servidor local.",
  },
  CUSTOM,
];

export function matchProvider(baseUrl: string): ProviderPreset {
  const normalize = (url: string) => url.trim().replace(/\/+$/, "").toLowerCase();
  const target = normalize(baseUrl);
  return (
    PROVIDERS.find((preset) => preset.baseUrl && normalize(preset.baseUrl) === target) ?? CUSTOM
  );
}
