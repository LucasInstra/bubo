import { expect, test } from "@playwright/test";

test("compact bilingual replies start in Portuguese and reveal the English", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=compact-bilingual");

  const assistant = page.locator(".compact-bubble.assistant").last();
  await expect(assistant).toBeVisible();
  await expect(assistant).toContainText("Isso parece um bom fim de semana");
  await expect(assistant).not.toContainText("That sounds like a good weekend");

  await assistant.getByRole("button", { name: "ver em inglês" }).click();
  await expect(assistant.locator(".compact-english")).toContainText(
    "That sounds like a good weekend",
  );

  await assistant.getByRole("button", { name: "esconder inglês" }).click();
  await expect(assistant.locator(".compact-english")).toHaveCount(0);
  await expect(assistant.getByRole("button", { name: "ver em inglês" })).toBeVisible();
});

test("settings switches provider and base URL", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("dialog", { name: "Configurações" }).waitFor();
  await page.getByRole("tab", { name: "Conexão" }).click();

  await page.getByRole("button", { name: "OpenAI" }).click();
  await expect(page.getByLabel("URL base")).toHaveValue("https://api.openai.com/v1");
});

test("compact mode toggles back to full", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=compact");
  await expect(page.locator(".app.compact-liquid")).toBeVisible();
  await expect(page.locator(".compact-face")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fixar janela" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ocultar" })).toBeVisible();
  await expect(page.locator(".compact-card .composer textarea")).toBeVisible();

  await page.getByRole("button", { name: "Modo completo" }).click();
  await expect(page.locator(".app.compact-liquid")).toHaveCount(0);
});

test("compact composer shows wrapped text", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=compact");
  const area = page.locator(".compact-card .composer textarea");
  await area.fill("first line\nsecond line");
  const metrics = await area.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
});

test("history delete keeps the X in frame", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Histórico" }).click();
  const del = page.locator(".session-delete").first();
  await expect(del).toHaveText("×");
  await del.click();
  await expect(del).toHaveText("×apagar");
  const overflow = await del.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("practice checks a correct answer", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=practice");
  await expect(page.getByText("como você diria isto?")).toBeVisible();

  await page.getByPlaceholder("digite a frase corrigida").fill("I went to the gym yesterday");
  await page.getByRole("button", { name: "Conferir" }).click();

  await expect(page.getByText("exatamente certo")).toBeVisible();
  await expect(page.getByText("I went to the gym yesterday", { exact: true })).toBeVisible();
});

test("light theme keeps the send button visible", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("tab", { name: "Sistema" }).click();
  await page.getByRole("button", { name: "Claro" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const send = page.locator(".composer .send");
  await expect(send).toBeVisible();
  const colors = await send.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colors.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(colors.color).not.toBe(colors.background);
});

test("the mascot announces an available update", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=update");

  const speech = page.locator(".update-speech");
  await expect(speech).toContainText("Saiu a versão 0.9.2.");
  await expect(speech.getByRole("button", { name: "Instalar e reiniciar" })).toBeVisible();

  await speech.getByRole("button", { name: "Depois" }).click();
  await expect(speech).toHaveCount(0);
});

test("mascot accepts a drag gesture", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  const hit = page.locator(".mascot-hit");
  await expect(hit).toHaveAttribute("title", /Arraste/);

  const box = await hit.boundingBox();
  if (!box) throw new Error("mascot hit area not found");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(hit).toHaveCSS("cursor", "grabbing");

  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20);
  await page.mouse.up();
  await expect(hit).toHaveCSS("cursor", "grab");

  // grabbing a cheek instead of the center should follow the cursor and
  // release just as cleanly
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  await expect(hit).toHaveCSS("cursor", "grabbing");

  await page.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.42, { steps: 6 });
  await page.mouse.up();
  await expect(hit).toHaveCSS("cursor", "grab");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
});
