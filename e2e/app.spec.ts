import { expect, test } from "@playwright/test";

test("settings switches provider and base URL", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();

  await page.getByRole("button", { name: "OpenAI" }).click();
  await expect(page.getByLabel("Base URL")).toHaveValue("https://api.openai.com/v1");
});

test("compact mode toggles back to full", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=compact");
  await expect(page.locator(".app.compact-liquid")).toBeVisible();
  await expect(page.locator(".compact-face")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pin window" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide" })).toBeVisible();
  await expect(page.locator(".compact-card .composer textarea")).toBeVisible();

  await page.getByRole("button", { name: "Full mode" }).click();
  await expect(page.locator(".app.compact-liquid")).toHaveCount(0);
});

test("practice checks a correct answer", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=practice");
  await expect(page.getByText("how would you say this?")).toBeVisible();

  await page.getByPlaceholder("type the corrected sentence").fill("I went to the gym yesterday");
  await page.getByRole("button", { name: "Check" }).click();

  await expect(page.getByText("exactly right")).toBeVisible();
  await expect(page.getByText("I went to the gym yesterday", { exact: true })).toBeVisible();
});

test("mascot accepts a drag gesture", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  const hit = page.locator(".mascot-hit");
  await expect(hit).toHaveAttribute("title", /Drag me/);

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
