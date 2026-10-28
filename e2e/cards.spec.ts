import { expect, test } from "@playwright/test";

interface HarnessCall {
  cmd: string;
  args: unknown;
}

async function calls(page: import("@playwright/test").Page): Promise<HarnessCall[]> {
  return page.evaluate(() => (window as unknown as { __calls: HarnessCall[] }).__calls);
}

test("practice starts from a correction card", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await expect(page.getByText("correções")).toBeVisible();

  await page.getByRole("button", { name: "Praticar esta correção" }).click();

  const dialog = page.getByRole("dialog", { name: "Prática" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("i go to the gym yesterday", { exact: true })).toBeVisible();

  // The hint says what to fix before the user types, without the answer.
  await expect(dialog.locator(".drill-hint-before")).toHaveText(/past simple/);
  await expect(dialog.getByText("I went to the gym yesterday")).toHaveCount(0);

  expect(await calls(page)).toContainEqual({
    cmd: "drill_focus",
    args: {
      wrong: "i go to the gym yesterday",
      right: "I went to the gym yesterday",
    },
  });

  await dialog.getByRole("button", { name: "Voltar" }).click();
  await expect(dialog).toHaveCount(0);
});

test("corrections and drills label the before and after", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");

  const fixes = page.locator(".fixes");
  await expect(fixes.locator(".fix-label").first()).toHaveText("antes");
  await expect(fixes.locator(".fix-label").nth(1)).toHaveText("depois");

  await page.getByRole("button", { name: "Praticar esta correção" }).click();
  const dialog = page.getByRole("dialog", { name: "Prática" });
  await dialog.getByPlaceholder("digite a frase corrigida").fill("i go to the gym yesterday");
  await dialog.getByRole("button", { name: "Conferir" }).click();

  const result = dialog.locator(".drill-result");
  await expect(result.locator(".drill-answer-label").first()).toHaveText("você escreveu");
  await expect(result.locator(".drill-answer-label").nth(1)).toHaveText("correção");
  await expect(result.locator(".drill-answer-wrong")).toHaveText("i go to the gym yesterday");
  await expect(result.locator(".drill-right")).toHaveText("I went to the gym yesterday");
});

test("next never repeats the card that was just answered", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=practice");
  const dialog = page.getByRole("dialog", { name: "Prática" });
  const input = dialog.getByPlaceholder("digite a frase corrigida");

  await expect(dialog.getByText("i go to the gym yesterday", { exact: true })).toBeVisible();
  await input.fill("I went to the gym yesterday");
  await dialog.getByRole("button", { name: "Conferir" }).click();
  await expect(dialog.getByText("exatamente certo")).toBeVisible();

  await dialog.getByRole("button", { name: "Próximo card" }).click();
  await expect(dialog.getByText("she don't know", { exact: true })).toBeVisible();
  await expect(dialog.getByText("i go to the gym yesterday", { exact: true })).toHaveCount(0);

  await input.fill("she doesn't know");
  await dialog.getByRole("button", { name: "Conferir" }).click();
  await expect(dialog.getByText("exatamente certo")).toBeVisible();

  // With nothing left, the session ends instead of looping on the last card.
  await dialog.getByRole("button", { name: "Próximo card" }).click();
  await expect(dialog.getByText("Tudo em dia")).toBeVisible();
  await expect(dialog.locator(".drill-wrong")).toHaveCount(0);

  // Asking for extra practice is the explicit way to see a card again.
  await dialog.getByRole("button", { name: "Praticar mesmo assim" }).click();
  await expect(dialog.locator(".drill-wrong")).toBeVisible();
});

test("deletes a correction from the card", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await expect(page.locator(".fixes")).toBeVisible();

  const remove = page.getByRole("button", { name: "Excluir esta correção" });
  await remove.click();
  await expect(remove).toHaveText("apagar?");
  await remove.click();

  await expect(page.locator(".fixes")).toHaveCount(0);
  expect(await calls(page)).toContainEqual({
    cmd: "delete_fix",
    args: {
      messageId: 2,
      wrong: "i go to the gym yesterday",
      right: "I went to the gym yesterday",
    },
  });
});

test("explains a correction inline", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await expect(page.locator(".fixes")).toBeVisible();

  const explain = page.getByRole("button", { name: "Explicar esta correção" });
  await explain.click();

  const explanation = page.locator(".fix-explain");
  await expect(explanation).toBeVisible();
  await expect(explanation).toContainText(
    "Use the past simple for a finished action. Add a time marker when it helps.",
  );
  await expect(explanation).toContainText("I went to the gym yesterday.");
  await expect(explanation).toContainText("She called me last night.");

  expect(await calls(page)).toContainEqual({
    cmd: "explain_fix",
    args: {
      wrong: "i go to the gym yesterday",
      right: "I went to the gym yesterday",
      note: "past simple",
    },
  });

  await explain.click();
  await expect(explanation).toHaveCount(0);
});
