import { expect, test, type Page } from "@playwright/test";

interface HarnessCall {
  cmd: string;
  args: unknown;
}

async function calls(page: Page): Promise<HarnessCall[]> {
  return page.evaluate(() => (window as unknown as { __calls: HarnessCall[] }).__calls);
}

test("bilingual replies start in Portuguese and reveal the English on demand", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=bilingual-a1");

  const bubble = page.locator(".msg-bot .bubble").last();
  await expect(bubble).toContainText("Isso parece um bom fim de semana");
  await expect(bubble).not.toContainText("That sounds like a good weekend");

  await bubble.getByRole("button", { name: "ver em inglês" }).click();
  await expect(bubble.locator(".msg-english")).toContainText(
    "That sounds like a good weekend",
  );

  await bubble.getByRole("button", { name: "esconder inglês" }).click();
  await expect(bubble.locator(".msg-english")).toHaveCount(0);
  await expect(bubble.getByRole("button", { name: "ver em inglês" })).toBeVisible();
});

test("a completed lesson can set the focus for the conversation", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=empty&level=A1");

  await page.getByRole("button", { name: "Mini-lições de gramática" }).click();
  const dialog = page.getByRole("dialog", { name: "Lições" });
  await dialog.getByRole("button", { name: /Verbo to be/ }).click();

  for (const next of ["Próximo", "Próximo", "Concluir"]) {
    await dialog.getByRole("button", { name: "Ver resposta" }).click();
    await dialog.getByRole("button", { name: next }).click();
  }

  await expect(dialog.getByText("lição concluída")).toBeVisible();
  await dialog.getByRole("button", { name: "Praticar na conversa" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".focus-bar")).toContainText("Foco: To be");
  await expect(page.locator(".msg-bot .bubble").last()).toContainText(
    'We just finished the "Verbo to be" lesson',
  );

  const saved = (await calls(page)).filter((call) => call.cmd === "save_settings");
  expect(saved.at(-1)?.args).toMatchObject({
    settings: { studyFocus: "to_be" },
  });
});

test("a beginner lesson walks through steps and saves a wrong answer", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=empty&level=A1");

  await page.getByRole("button", { name: "Mini-lições de gramática" }).click();
  const dialog = page.getByRole("dialog", { name: "Lições" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: /Verbo to be/ }).click();
  await expect(dialog.getByText("passo 1 de 3")).toBeVisible();

  await dialog.getByLabel("Traduza: Eu sou desenvolvedor.").fill("I am a developer");
  await dialog.getByRole("button", { name: "Conferir" }).click();
  await expect(dialog.getByText("Boa.")).toBeVisible();

  await dialog.getByRole("button", { name: "Próximo" }).click();
  await expect(dialog.getByText("passo 2 de 3")).toBeVisible();

  const progressCalls = (await calls(page)).filter((call) => call.cmd === "save_lesson_progress");
  expect(progressCalls.at(-1)?.args).toMatchObject({
    lessonId: "to_be",
    step: 1,
    completed: false,
  });

  await dialog.getByLabel(/She ___ my boss/).fill("are");
  await dialog.getByRole("button", { name: "Conferir" }).click();
  await expect(dialog.getByText("Tente mais uma vez.")).toBeVisible();
  await expect
    .poll(async () => (await calls(page)).filter((call) => call.cmd === "save_lesson_fix").length)
    .toBe(0);

  await dialog.getByRole("button", { name: "Conferir de novo" }).click();
  await expect(dialog.getByText(/Quase\. A resposta é isn't\./)).toBeVisible();

  await expect
    .poll(async () => (await calls(page)).filter((call) => call.cmd === "save_lesson_fix").length)
    .toBe(1);
  const fixCalls = (await calls(page)).filter((call) => call.cmd === "save_lesson_fix");
  expect(fixCalls[0].args).toMatchObject({
    wrong: "are",
    right: "isn't",
    note: "Complete no negativo: She ___ my boss. · to be negativo: is not / isn't",
  });
});

test("higher levels can open their own lessons", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=empty&level=B1");

  await page.getByRole("button", { name: "Mini-lições de gramática" }).click();
  const dialog = page.getByRole("dialog", { name: "Lições" });
  await expect(dialog.getByRole("button", { name: /Present perfect/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Condicionais/ })).toBeVisible();
});

test("a fill-in exercise accepts the full sentence", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=empty&level=B1");
  await page.getByRole("button", { name: "Mini-lições de gramática" }).click();
  const dialog = page.getByRole("dialog", { name: "Lições" });

  await dialog.getByRole("button", { name: /Condicionais/ }).click();
  await dialog.getByRole("button", { name: "Ver resposta" }).click();
  await dialog.getByRole("button", { name: "Próximo" }).click();
  await expect(dialog.getByText("passo 2 de 3")).toBeVisible();

  await dialog
    .getByLabel(/If I ___ \(have\) more time/)
    .fill("if i had more time, i would travel");
  await dialog.getByRole("button", { name: "Conferir" }).click();
  await expect(dialog.getByText("Boa.")).toBeVisible();
});
