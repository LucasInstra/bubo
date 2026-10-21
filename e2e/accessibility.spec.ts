import { expect, test } from "@playwright/test";

test("settings dialog traps focus and restores it to the trigger", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Settings" }).click();

  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();

  await expect
    .poll(() => dialog.evaluate((node) => node.contains(document.activeElement)))
    .toBe(true);

  await expect(page.locator(".head")).toHaveAttribute("inert", "");

  for (let step = 0; step < 25; step += 1) {
    await page.keyboard.press("Tab");
  }

  const trapped = await page.evaluate(() => Boolean(document.activeElement?.closest(".settings")));
  expect(trapped).toBe(true);

  await page.keyboard.press("Escape");

  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".head")).not.toHaveAttribute("inert", "");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null))
    .toBe("Settings");
});
