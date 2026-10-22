import { expect, test } from "@playwright/test";

test("a single click opens the composer under the face", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=popup");
  const stage = page.locator(".popup-stage");
  await expect(stage).toHaveClass(/stage-face/);
  await expect(page.locator(".popup-face")).toHaveAttribute("aria-label", "Chat with bubo");
  await expect(page.locator(".popup-stage .composer")).toHaveCount(0);

  await page.locator(".popup-face").click();

  await expect(stage).toHaveClass(/stage-input/);
  await expect(page.locator(".popup-stage .composer textarea")).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls),
  ).toContainEqual({
    cmd: "set_popup_stage",
    args: { stage: "input" },
  });
});

test("escape collapses the composer back to the face", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=popup");
  await page.locator(".popup-face").click();
  await expect(page.locator(".popup-stage")).toHaveClass(/stage-input/);

  await page.keyboard.press("Escape");

  await expect(page.locator(".popup-stage")).toHaveClass(/stage-face/);
  await expect(page.locator(".popup-stage .composer")).toHaveCount(0);
});

test("a double click opens the full chat", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=popup");
  await page.locator(".popup-face").dblclick();

  await expect(page.locator(".popup-stage")).toHaveCount(0);
  await expect(page.locator(".panel")).toBeVisible();
});

test("the settings sheet exposes the popup mode", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Settings" }).click();
  const popupMode = page.getByText("Popup mode", { exact: true });
  await popupMode.scrollIntoViewIfNeeded();
  await expect(popupMode).toBeVisible();
});
