import { afterEach, describe, expect, it, vi } from "vitest";
import { pickEnglishVoice, speechText } from "./speech";

const voice = (lang: string) => ({ lang, name: lang }) as SpeechSynthesisVoice;

describe("speechText", () => {
  it("strips markdown so the voice reads words instead of symbols", () => {
    expect(speechText("**Bold** and _italic_ with `code`")).toBe("Bold and italic with code");
  });

  it("keeps link labels and drops code blocks", () => {
    expect(speechText("See [the docs](https://x.test) now")).toBe("See the docs now");
    expect(speechText("A\n```\nconst x = 1;\n```\nB")).toBe("A B");
  });

  it("does not mangle code-like words", () => {
    expect(speechText("I write C# and snake_case daily")).toBe("I write C# and snake_case daily");
  });

  it("collapses whitespace", () => {
    expect(speechText("  a \n\n b  ")).toBe("a b");
  });
});

describe("pickEnglishVoice", () => {
  it("prefers an American voice, then any English one", () => {
    expect(pickEnglishVoice([voice("pt-BR"), voice("en-GB"), voice("en-US")])?.lang).toBe("en-US");
    expect(pickEnglishVoice([voice("pt-BR"), voice("en-GB")])?.lang).toBe("en-GB");
  });

  it("returns null when no English voice is installed", () => {
    expect(pickEnglishVoice([voice("pt-BR")])).toBeNull();
  });
});

interface FakeUtterance {
  text: string;
  lang: string;
  rate: number;
  voice: unknown;
}

function installSpeech(langs: string[]) {
  const calls: string[] = [];
  const utterances: FakeUtterance[] = [];

  class Utterance {
    text: string;
    lang = "";
    rate = 1;
    voice: unknown = null;
    constructor(text: string) {
      this.text = text;
      utterances.push(this);
    }
  }

  (globalThis as unknown as { window: unknown }).window = {
    speechSynthesis: {
      getVoices: () => langs.map((lang) => ({ lang, name: lang })),
      cancel: () => calls.push("cancel"),
      speak: (utterance: { text: string }) => calls.push(`speak:${utterance.text}`),
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    setTimeout: (...args: [() => void, number]) => setTimeout(...args),
    clearTimeout: (id: number) => clearTimeout(id),
  };
  (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
    Utterance;
  return { calls, utterances };
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
  vi.useRealTimers();
  vi.resetModules();
});

describe("speak", () => {
  it("cancels the current speech, strips markdown and uses the English voice", async () => {
    vi.useFakeTimers();
    const { calls, utterances } = installSpeech(["pt-BR", "en-US"]);
    const { speak } = await import("./speech");

    expect(speak("**Hello** there")).toBe(true);
    expect(calls).toEqual(["cancel"]);

    vi.runAllTimers();
    expect(calls).toEqual(["cancel", "speak:Hello there"]);
    expect(utterances[0].lang).toBe("en-US");
    expect(utterances[0].voice).toMatchObject({ lang: "en-US" });
  });

  it("does not speak text that is only markdown", async () => {
    const { calls } = installSpeech(["en-US"]);
    const { speak } = await import("./speech");

    expect(speak("**")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("replaces the pending utterance instead of stacking them", async () => {
    vi.useFakeTimers();
    const { calls } = installSpeech(["en-US"]);
    const { speak } = await import("./speech");

    speak("one");
    speak("two");
    expect(calls).toEqual(["cancel", "cancel"]);

    vi.runAllTimers();
    expect(calls).toEqual(["cancel", "cancel", "speak:two"]);
  });

  it("reports readiness only when the webview has voices", async () => {
    installSpeech([]);
    const { speechReady } = await import("./speech");
    expect(speechReady()).toBe(false);
  });
});
