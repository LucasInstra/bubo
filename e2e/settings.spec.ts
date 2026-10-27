import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import pkg from "../package.json" with { type: "json" };
import { BUILD_NUMBER } from "../src/lib/build";

interface HarnessCall {
  cmd: string;
  args: unknown;
}

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
    page.getByText("O bubo responde em português e deixa a versão em inglês atrás de um botão."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Só português", exact: true }).click();
  await expect(page.getByText(/O bubo conversa em português/)).toBeVisible();
  await expect(discovery).toHaveCount(0);
  await expect(page.getByRole("button", { name: "PT-BR", exact: true })).toHaveClass(/chip-on/);
});

test("bilingual settings expose the English challenge and the study focus", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app&level=A1");
  await page.getByRole("button", { name: "Configurações" }).click();

  await expect(page.getByText("Foco de estudo")).toBeVisible();
  await expect(page.getByText("Desafio antes do inglês")).toHaveCount(0);

  await page.getByRole("button", { name: "Inglês + português" }).click();
  await expect(page.getByText("Desafio antes do inglês")).toBeVisible();

  await page.getByRole("button", { name: "B1", exact: true }).click();
  await expect(page.getByText("Foco de estudo")).toBeVisible();
  await expect(page.getByText("Desafio antes do inglês")).toBeVisible();
});

test("settings open the lessons panel for higher levels", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app&level=B1");
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

test("first run connects through onboarding", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=onboarding");
  const dialog = page.getByRole("dialog", { name: "Configurar o bubo" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Vamos colocar o bubo para conversar");

  await dialog.getByLabel("Cole sua chave da Groq").fill("gsk_test_123");
  await dialog.getByRole("button", { name: "Começar a conversar" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByPlaceholder("Digite em inglês...")).toBeVisible();
});

test("pinning from the settings header is not undone by saving", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();

  const dialog = page.getByRole("dialog", { name: "Configurações" });
  await dialog.waitFor();

  // A pending change makes the save button active, which is when a stale pin
  // used to travel with the draft.
  await dialog.getByRole("tab", { name: "Sistema" }).click();
  await dialog.getByRole("button", { name: "Claro" }).click();
  await dialog.getByRole("button", { name: "Fixar janela" }).click();
  await dialog.getByRole("button", { name: "Salvar" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const calls = (window as unknown as { __calls: HarnessCall[] }).__calls.filter(
          (call) => call.cmd === "save_settings",
        );
        const last = calls.at(-1)?.args as { settings?: { pinned?: boolean } } | undefined;
        return last?.settings?.pinned;
      }),
    )
    .toBe(false);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const calls = (window as unknown as { __calls: HarnessCall[] }).__calls.filter(
          (call) => call.cmd === "set_pinned",
        );
        const last = calls.at(-1)?.args as { pinned?: boolean } | undefined;
        return last?.pinned;
      }),
    )
    .toBe(false);
});

test("onboarding can connect a local Ollama without a key", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=onboarding");
  const dialog = page.getByRole("dialog", { name: "Configurar o bubo" });

  await dialog.getByRole("tab", { name: /Rodar no PC/ }).click();
  await expect(dialog).toContainText("Nenhuma chave necessária para o Ollama.");
  await dialog.getByRole("button", { name: "Começar a conversar" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByPlaceholder("Digite em inglês...")).toBeVisible();
});

test("settings shows the compact update card", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("tab", { name: "Atualizações" }).click();

  const card = page.locator(".update-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText(`bubo ${pkg.version}`);
  await expect(card).toContainText("As atualizações são verificadas quando o bubo inicia.");
});

test("settings shows what changed in the running version", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("tab", { name: "Atualizações" }).click();

  const card = page.locator(".release-card");
  await card.scrollIntoViewIfNeeded();
  const title =
    BUILD_NUMBER > 1
      ? `Novidades do build ${BUILD_NUMBER}`
      : `Novidades da versão ${pkg.version}`;
  await expect(card).toContainText(title);
  await expect(card.locator("li").first()).toBeVisible();

  // The card must show this release's own notes, not an older fallback.
  const notesFile =
    BUILD_NUMBER > 1
      ? `release-notes/${pkg.version}.build${BUILD_NUMBER}.pt.md`
      : `release-notes/${pkg.version}.pt.md`;
  const notes = readFileSync(notesFile, "utf8");
  const firstHighlight = /^- \*\*(.+?)\*\*/m.exec(notes)?.[1] ?? "";
  expect(firstHighlight).not.toBe("");
  await expect(card).toContainText(firstHighlight);
});

test("an available update shows its Portuguese highlights", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=update");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("tab", { name: "Atualizações" }).click();

  const card = page.locator(".update-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("Fala do mascote");
  await expect(card).not.toContainText("The mascot speaks up");
});
