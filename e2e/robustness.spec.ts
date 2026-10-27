import { expect, test } from "@playwright/test";
import pkg from "../package.json" with { type: "json" };

const nextVersion = (() => {
  const [major, minor] = pkg.version.split(".");
  return `${major}.${Number(minor) + 1}.0`;
})();

interface HarnessCall {
  cmd: string;
  args: unknown;
}

async function calls(page: import("@playwright/test").Page): Promise<HarnessCall[]> {
  return page.evaluate(() => (window as unknown as { __calls: HarnessCall[] }).__calls);
}

test("the popup keeps a typed draft when it collapses", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=popup");

  await page.locator(".popup-face").click();
  const input = page.locator(".popup-stage .composer textarea");
  await expect(input).toBeVisible();
  await input.fill("a message I do not want to lose");

  await page.keyboard.press("Escape");
  await expect(page.locator(".popup-stage")).toHaveClass(/stage-face/);

  await page.locator(".popup-face").click();
  await expect(page.locator(".popup-stage .composer textarea")).toHaveValue(
    "a message I do not want to lose",
  );
});

test("the popup offers Stop while an answer is being written", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=popup-reply&status=thinking");

  await expect(page.getByRole("button", { name: "Parar" })).toBeVisible();
});

test("compact and popup announce new answers", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=compact");
  const log = page.locator(".compact-chat");
  await expect(log).toHaveAttribute("role", "log");
  await expect(log).toHaveAttribute("aria-live", "polite");

  await page.goto("/e2e/harness.html?case=popup-reply");
  const status = page.locator(".popup-stage [role='status']").first();
  await expect(status).toHaveAttribute("aria-live", "polite");
});

test("an update installs and restarts", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=update");

  await expect(page.locator(".update-speech")).toContainText(nextVersion);
  await page.getByRole("button", { name: "Instalar e reiniciar" }).click();

  await expect(page.locator(".update-banner")).toContainText(
    "Reiniciando para concluir a atualização",
  );
  await expect
    .poll(async () => (await calls(page)).some((call) => call.cmd === "plugin:process|restart"))
    .toBe(true);
});

test("a failed install explains itself and offers a retry", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=update-error");

  await page.getByRole("button", { name: "Instalar e reiniciar" }).click();

  const banner = page.locator(".update-banner");
  await expect(banner).toContainText("assinatura do instalador inválida");
  await expect(banner.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
});

test("a recovered database is announced and can be dismissed", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=recovered");

  const notice = page.getByRole("alert").filter({ hasText: "banco anterior" });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Fechar" }).click();
  await expect(notice).toHaveCount(0);
});

test("new and delete conversation reach the backend", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");

  await page.getByRole("button", { name: "Histórico" }).click();
  await page.getByRole("button", { name: "+ nova" }).click();
  await expect.poll(async () => (await calls(page)).some((call) => call.cmd === "new_session")).toBe(
    true,
  );
  await expect(page.locator(".msg-user")).toHaveCount(0);

  await page.getByRole("button", { name: "Histórico" }).click();
  const remove = page.locator(".session-delete").first();
  await remove.click();
  await remove.click();
  await expect
    .poll(async () => (await calls(page)).some((call) => call.cmd === "delete_session"))
    .toBe(true);
});
