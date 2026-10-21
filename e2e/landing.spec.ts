import { expect, test } from "@playwright/test";

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
