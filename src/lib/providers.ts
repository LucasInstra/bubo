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
  label: "Custom",
  baseUrl: "",
  models: [],
  keyHint: "the key from your provider",
  keySite: "",
};

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"],
    keyHint: "gsk_...",
    keySite: "Get one at console.groq.com/keys.",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
    keyHint: "sk-...",
    keySite: "Get one at platform.openai.com/api-keys.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4", "google/gemini-2.5-flash"],
    keyHint: "sk-or-...",
    keySite: "Get one at openrouter.ai/keys.",
  },
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    models: ["llama3.2", "qwen2.5:7b", "mistral"],
    keyHint: "any value works, for example ollama",
    keySite: "Any value works for a local server.",
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
