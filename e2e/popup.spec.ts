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
  await page.locator(".popup-stage .composer textarea").fill("hello bubo");
  await expect(page.locator(".popup-stage .composer textarea")).toHaveValue("hello bubo");
  expect(
    await page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls),
  ).toContainEqual({
    cmd: "set_popup_stage",
    args: { stage: "input" },
  });
});

test("hovering near the face after a click does not drag the window", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=popup");
  const face = page.locator(".popup-face");
  await face.click();
  await expect(page.locator(".popup-stage")).toHaveClass(/stage-input/);

  const before = await page.evaluate(
    () => (window as unknown as { __calls: unknown[] }).__calls.length,
  );
  const box = await face.boundingBox();
  if (!box) throw new Error("face not found");
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 12);
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 24);

  const calls = await page.evaluate(
    (start) => (window as unknown as { __calls: Array<{ cmd: string }> }).__calls.slice(start),
    before,
  );
  expect(calls.filter((call) => call.cmd.includes("set_position"))).toHaveLength(0);
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

test("dragging the face grabs it and moves the window", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=popup");
  const face = page.locator(".popup-face");
  const box = await face.boundingBox();
  if (!box) throw new Error("face not found");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 16);

  await expect(page.locator(".popup-face")).toHaveClass(/dragging/);
  const transform = await page
    .locator(".popup-face-inner")
    .evaluate((element) => element.style.transform);
  expect(transform).toContain("rotate");

  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as unknown as { __calls: Array<{ cmd: string }> }).__calls.filter((call) =>
            call.cmd.includes("set_position"),
          ).length,
      ),
    )
    .toBeGreaterThan(0);

  await page.mouse.up();
  await expect(page.locator(".popup-face")).not.toHaveClass(/dragging/);
});

test("the settings sheet exposes the popup mode", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Settings" }).click();
  const popupMode = page.getByText("Popup mode", { exact: true });
  await popupMode.scrollIntoViewIfNeeded();
  await expect(popupMode).toBeVisible();
});
