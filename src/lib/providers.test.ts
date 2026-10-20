import { describe, expect, it } from "vitest";
import { PROVIDERS, matchProvider } from "./providers";

describe("providers", () => {
  it("has unique ids and a base URL for every preset except custom", () => {
    const ids = PROVIDERS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of PROVIDERS) {
      if (preset.id === "custom") expect(preset.baseUrl).toBe("");
      else expect(preset.baseUrl.startsWith("http")).toBe(true);
    }
  });

  it("matches a known endpoint despite case and a trailing slash", () => {
    expect(matchProvider(" https://API.GROQ.COM/openai/v1/ ").id).toBe("groq");
    expect(matchProvider("http://localhost:11434/v1").id).toBe("ollama");
  });

  it("falls back to custom for anything else", () => {
    expect(matchProvider("https://example.test/v1").id).toBe("custom");
    expect(matchProvider("").id).toBe("custom");
  });
});
