import { expect, test, type Page } from "@playwright/test";

interface Spoken {
  text: string;
  lang: string;
  rate: number;
}

/**
 * Replaces the Web Speech API so the test can assert what would be said
 * without depending on the voices installed on the machine.
 */
async function stubSpeech(page: Page, langs: string[] = ["en-US"]): Promise<void> {
  await page.addInitScript((voiceLangs) => {
    const spoken: Spoken[] = [];
    const state = { cancelled: 0 };
    (window as unknown as { __spoken: Spoken[] }).__spoken = spoken;
    (window as unknown as { __speech: { cancelled: number } }).__speech = state;

    class FakeUtterance {
      text: string;
      lang = "";
      rate = 1;
      voice: unknown = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: FakeUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => voiceLangs.map((lang) => ({ lang, name: lang, default: true })),
        speak: (utterance: { text: string; lang: string; rate: number }) =>
          spoken.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate }),
        cancel: () => {
          state.cancelled += 1;
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
  }, langs);
}

async function spoken(page: Page): Promise<Spoken[]> {
  return page.evaluate(() => (window as unknown as { __spoken: Spoken[] }).__spoken);
}

async function cancelled(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __speech: { cancelled: number } }).__speech.cancelled,
  );
}

test("reads a correction card aloud", async ({ page }) => {
  await stubSpeech(page);
  await page.goto("/e2e/harness.html?case=app");

  await page.getByRole("button", { name: "Ouvir a correção" }).first().click();

  await expect.poll(async () => (await spoken(page)).length).toBe(1);
  expect(await spoken(page)).toEqual([
    { text: "I went to the gym yesterday", lang: "en-US", rate: 0.95 },
  ]);
  expect(await cancelled(page)).toBeGreaterThan(0);
});

test("reads the practice answer aloud", async ({ page }) => {
  await stubSpeech(page);
  await page.goto("/e2e/harness.html?case=practice");

  const dialog = page.getByRole("dialog", { name: "Prática" });
  await dialog.getByPlaceholder("digite a frase corrigida").fill("i go to the gym");
  await dialog.getByRole("button", { name: "Conferir" }).click();
  await expect(dialog.locator(".drill-verdict")).toHaveText("quase");

  await dialog.getByRole("button", { name: "Ouvir a correção" }).click();

  await expect.poll(async () => (await spoken(page)).length).toBe(1);
  expect(await spoken(page)).toEqual([
    { text: "I went to the gym yesterday", lang: "en-US", rate: 0.95 },
  ]);
});

test("reads exactly the lesson answer that is on screen", async ({ page }) => {
  await stubSpeech(page);
  await page.goto("/e2e/harness.html?case=empty&level=A1");

  await page.getByRole("button", { name: "Mini-lições de gramática" }).click();
  const dialog = page.getByRole("dialog", { name: "Lições" });
  await dialog.getByRole("button", { name: /Verbo to be/ }).click();

  // Step 1 is a full sentence.
  await dialog.getByRole("button", { name: "Ver resposta" }).click();
  await dialog.getByRole("button", { name: "Ouvir a resposta" }).click();
  await expect.poll(async () => (await spoken(page)).length).toBe(1);
  let said = await spoken(page);
  expect(said[0].text).toContain("I am a developer");

  // Step 2 is a one-word blank: the voice must read the same word the screen shows.
  await dialog.getByRole("button", { name: "Próximo" }).click();
  await dialog.getByRole("button", { name: "Ver resposta" }).click();
  await expect(dialog.locator(".lesson-feedback")).toContainText("isn't");
  await dialog.getByRole("button", { name: "Ouvir a resposta" }).click();

  await expect.poll(async () => (await spoken(page)).length).toBe(2);
  said = await spoken(page);
  expect(said[1].text).toBe("isn't");
});

test("hides the speaker when the webview has no voices", async ({ page }) => {
  await stubSpeech(page, []);
  await page.goto("/e2e/harness.html?case=app");

  await expect(page.getByRole("button", { name: "Ouvir a correção" })).toHaveCount(0);
});

test("shows the speaker when the voices arrive after the first render", async ({ page }) => {
  await page.addInitScript(() => {
    const listeners: Array<() => void> = [];
    const state: { voices: Array<{ lang: string; name: string; default: boolean }> } = {
      voices: [],
    };
    (window as unknown as { __addVoice: () => void }).__addVoice = () => {
      state.voices = [{ lang: "en-US", name: "Late", default: true }];
      for (const listener of listeners) listener();
    };

    class FakeUtterance {
      text: string;
      lang = "";
      rate = 1;
      voice: unknown = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: FakeUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => state.voices,
        speak: () => {},
        cancel: () => {},
        addEventListener: (event: string, listener: () => void) => {
          if (event === "voiceschanged") listeners.push(listener);
        },
        removeEventListener: () => {},
      },
    });
  });
  await page.goto("/e2e/harness.html?case=app");

  await expect(page.getByRole("button", { name: "Ouvir a correção" })).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { __addVoice: () => void }).__addVoice();
  });
  await expect(page.getByRole("button", { name: "Ouvir a correção" }).first()).toBeVisible();
});
