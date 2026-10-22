import { expect, test } from "@playwright/test";

test("popup starts as the face and opens on double-click", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=popup");
  const stage = page.locator(".popup-stage");
  await expect(stage).not.toHaveClass(/open/);
  await expect(page.locator(".popup-face")).toHaveAttribute("aria-label", "Chat with bubo");
  await expect(page.locator(".popup-stage .composer")).toHaveCount(0);

  await page.locator(".popup-face").dblclick();

  await expect(stage).toHaveClass(/open/);
  await expect(page.locator(".popup-stage .composer textarea")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open the full chat" })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls),
  ).toContainEqual({
    cmd: "set_popup_layout",
    args: { open: true },
  });
});

test("escape collapses the popup back to the face", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=popup");
  await page.locator(".popup-face").dblclick();
  await expect(page.locator(".popup-stage")).toHaveClass(/open/);

  await page.keyboard.press("Escape");

  await expect(page.locator(".popup-stage")).not.toHaveClass(/open/);
  await expect(page.locator(".popup-stage .composer")).toHaveCount(0);
});

test("the settings sheet exposes the popup mode", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Settings" }).click();
  const popupMode = page.getByText("Popup mode", { exact: true });
  await popupMode.scrollIntoViewIfNeeded();
  await expect(popupMode).toBeVisible();
});
