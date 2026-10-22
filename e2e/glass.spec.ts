import { expect, test } from "@playwright/test";

test("the window background stays glass-free", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await expect(page.locator(".panel")).toBeVisible();
  await expect(page.locator(".panel > .glass-refraction")).toHaveCount(0);
  await expect(page.locator(".panel > .glass-specular")).toHaveCount(0);
});

test("a sheet brings its own glass layer", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();

  const layer = page.locator(".settings > .glass-refraction");
  await expect(layer).toHaveCount(1);
  const info = await layer.evaluate((element) => ({
    backdrop: getComputedStyle(element).backdropFilter,
    filter: getComputedStyle(element).filter,
    map: element.parentElement
      ?.querySelector("feImage")
      ?.getAttribute("href")
      ?.startsWith("data:image/png"),
  }));
  expect(info.backdrop).toContain("blur");
  expect(info.filter).toContain("url(");
  expect(info.map).toBe(true);
  await expect(page.locator(".settings > .glass-specular")).toHaveCount(2);
});

test("the compact composer is one glass pill", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=compact");
  const area = page.locator(".compact-card .composer textarea");
  const style = await area.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      background: computed.backgroundColor,
      shadow: computed.boxShadow,
      backdrop: computed.backdropFilter,
    };
  });

  expect(style.background).toBe("rgba(0, 0, 0, 0)");
  expect(style.shadow).toBe("none");
  expect(style.backdrop).toBe("none");
});

test("the sad face is fixed, not a setting", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Customize buddy" }).click();
  await expect(page.getByRole("dialog", { name: "Customize buddy" })).toBeVisible();
  await expect(page.getByText("Sad face")).toHaveCount(0);
});
