import { expect, test } from "@playwright/test";

test("test connection fills the model picker", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();
  await expect(page.getByRole("dialog", { name: "Configurações" })).toBeVisible();

  await page.getByRole("button", { name: "Testar conexão" }).click();
  await expect(page.getByText("Connected, 3 model(s) available")).toBeVisible();

  await page.getByRole("button", { name: "Escolher modelo" }).click();
  await page.getByRole("option", { name: "gpt-4.1", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Modelo", exact: true })).toHaveValue("gpt-4.1");
});

test("hotkey recorder captures a chord", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();

  const recorder = page.getByRole("button", { name: "Atalho para mostrar/ocultar" });
  await expect(recorder).toContainText("Ctrl+Alt+B");

  await recorder.click();
  await expect(recorder).toContainText("Pressione um atalho...");

  await page.keyboard.press("Control+Alt+K");
  await expect(recorder).toContainText("Ctrl+Alt+K");
  await expect(recorder).not.toContainText("Ctrl+Alt+B");
});

test("hotkey recorder cancels with Escape without closing settings", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();

  const recorder = page.getByRole("button", { name: "Atalho para mostrar/ocultar" });
  await recorder.click();
  await expect(recorder).toContainText("Pressione um atalho...");

  await page.keyboard.press("Escape");
  await expect(recorder).toContainText("Ctrl+Alt+B");
  await expect(page.getByRole("dialog", { name: "Configurações" })).toBeVisible();
});

test("settings shows the compact update card", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();

  const card = page.locator(".update-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("bubo 0.5.3");
  await expect(card).toContainText("As atualizações são verificadas quando o bubo inicia.");
});
