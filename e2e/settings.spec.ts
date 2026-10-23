import { expect, test } from "@playwright/test";

test("test connection fills the model picker", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("dialog", { name: "Configurações" }).waitFor();
  await page.getByRole("tab", { name: "Conexão" }).click();

  await page.getByRole("button", { name: "Testar conexão" }).click();
  await expect(page.getByText("Connected, 3 model(s) available")).toBeVisible();

  await page.getByRole("button", { name: "Escolher modelo" }).click();
  await page.getByRole("option", { name: "gpt-4.1", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Modelo", exact: true })).toHaveValue("gpt-4.1");
});

test("hotkey recorder captures a chord", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("tab", { name: "Sistema" }).click();

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
  await page.getByRole("tab", { name: "Sistema" }).click();

  const recorder = page.getByRole("button", { name: "Atalho para mostrar/ocultar" });
  await recorder.click();
  await expect(recorder).toContainText("Pressione um atalho...");

  await page.keyboard.press("Escape");
  await expect(recorder).toContainText("Ctrl+Alt+B");
  await expect(page.getByRole("dialog", { name: "Configurações" })).toBeVisible();
});

test("reply language offers English, bilingual and Portuguese-only replies", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();

  await expect(page.getByRole("button", { name: "Só inglês", exact: true })).toHaveClass(/chip-on/);
  const discovery = page.getByText("Ainda não lê inglês? Escolha Só português.");
  await expect(discovery).toBeVisible();

  await page.getByRole("button", { name: "Inglês + português", exact: true }).click();
  await expect(
    page.getByText("O bubo responde em inglês e acrescenta uma tradução curta em português."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Só português", exact: true }).click();
  await expect(page.getByText(/O bubo conversa em português/)).toBeVisible();
  await expect(discovery).toHaveCount(0);
  await expect(page.getByRole("button", { name: "PT-BR", exact: true })).toHaveClass(/chip-on/);
});

test("beginner settings expose the translation challenge and study focus", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app&level=A1");
  await page.getByRole("button", { name: "Configurações" }).click();

  await expect(page.getByText("Desafio antes da tradução")).toBeVisible();
  await expect(page.getByText("Foco de estudo")).toBeVisible();

  await page.getByRole("button", { name: "B1", exact: true }).click();
  await expect(page.getByText("Desafio antes da tradução")).toHaveCount(0);
  await expect(page.getByText("Foco de estudo")).toHaveCount(0);
});

test("beginner settings open the lessons panel", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app&level=A1");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("button", { name: "Abrir lições de gramática" }).click();

  const dialog = page.getByRole("dialog", { name: "Lições" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Mini-lições")).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Portuguese replies switch the empty state to Portuguese", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=empty");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("button", { name: "Só português", exact: true }).click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();

  await expect(page.getByText("Fale comigo em português.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Oi, bubo! Quero falar sobre meu fim de semana." }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Digite em português ou inglês...")).toBeVisible();
  await expect(page.getByText("Fale comigo em inglês.")).toHaveCount(0);
});

test("feedback button opens the GitHub issue page", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("tab", { name: "Sistema" }).click();
  await page.getByRole("button", { name: "Abrir uma issue no GitHub" }).click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __calls: Array<{ cmd: string }> }).__calls.some(
          (call) => call.cmd === "open_feedback",
        ),
      ),
    )
    .toBe(true);
});

test("settings shows the compact update card", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("tab", { name: "Sistema" }).click();

  const card = page.locator(".update-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("bubo 0.5.3");
  await expect(card).toContainText("As atualizações são verificadas quando o bubo inicia.");
});
