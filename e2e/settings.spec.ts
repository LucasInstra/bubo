import { expect, test } from "@playwright/test";

test("test connection fills the model picker", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();

  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText("Connected, 3 model(s) available")).toBeVisible();

  await page.getByRole("button", { name: "Choose model" }).click();
  await page.getByRole("option", { name: "gpt-4.1", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Model", exact: true })).toHaveValue("gpt-4.1");
});

test("hotkey recorder captures a chord", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Settings" }).click();

  const recorder = page.getByRole("button", { name: "Show/hide hotkey" });
  await expect(recorder).toContainText("Ctrl+Alt+B");

  await recorder.click();
  await expect(recorder).toContainText("Press a shortcut...");

  await page.keyboard.press("Control+Alt+K");
  await expect(recorder).toContainText("Ctrl+Alt+K");
  await expect(recorder).not.toContainText("Ctrl+Alt+B");
});

test("hotkey recorder cancels with Escape without closing settings", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Settings" }).click();

  const recorder = page.getByRole("button", { name: "Show/hide hotkey" });
  await recorder.click();
  await expect(recorder).toContainText("Press a shortcut...");

  await page.keyboard.press("Escape");
  await expect(recorder).toContainText("Ctrl+Alt+B");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
});
