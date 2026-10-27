import { expect, test } from "@playwright/test";

test("a first run can skip the wizard and still reach the app", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=onboarding-update");

  const dialog = page.getByRole("dialog", { name: "Configurar o bubo" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".update-notice")).toContainText("0.9.2");

  await dialog.getByRole("button", { name: "Depois", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const banner = page.locator(".connect-banner");
  await expect(banner).toContainText("ainda não está conectado");
  await expect(page.getByRole("button", { name: "Histórico" })).toBeVisible();

  await banner.getByRole("button", { name: "Conectar" }).click();
  await expect(page.getByRole("dialog", { name: "Configurar o bubo" })).toBeVisible();
});

test("compact mode announces an available update", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=compact-update");

  const notice = page.locator(".compact-card .update-notice");
  await expect(notice).toContainText("0.9.2");
  await expect(notice.getByRole("button", { name: "Instalar" })).toBeVisible();

  await notice.getByRole("button", { name: "Lembrar depois" }).click();
  await expect(page.locator(".compact-card .update-notice")).toHaveCount(0);
});

test("popup mode announces an available update", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=popup-update");

  const notice = page.locator(".popup-stage .update-notice");
  await expect(notice).toContainText("0.9.2");
  await expect(notice.getByRole("button", { name: "Instalar" })).toBeVisible();
});
