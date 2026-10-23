import { expect, test } from "@playwright/test";

test("landing mounts the interactive mascot", async ({ page }) => {
  await page.goto("/docs/index.html");

  const canvas = page.locator(".hero-mascot-live .mascot canvas");
  await expect(canvas).toBeVisible();

  const hit = page.locator(".hero-mascot-live .mascot-hit");
  await expect(hit).toHaveAttribute("title", /Arraste-me/);
  const box = await hit.boundingBox();
  if (!box) throw new Error("mascot hit area not found");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 28, box.y + box.height / 2 + 12);
  await page.mouse.up();

  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
});

test("landing screenshots open in a lightbox", async ({ page }) => {
  await page.goto("/docs/index.html");

  const first = page.locator("a[data-lightbox]").first();
  await first.click();

  const dialog = page.locator("#lightbox");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("img")).toHaveAttribute("src", /screenshots\/chat\.png/);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const look = page.locator('a[data-lightbox][href="screenshots/look.png"]');
  await look.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("img")).toHaveAttribute("src", /screenshots\/look\.png/);

  await dialog.locator(".lightbox-close").click();
  await expect(dialog).toBeHidden();
});
