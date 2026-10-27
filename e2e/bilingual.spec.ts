import { expect, test } from "@playwright/test";

const PT_FIRST = "Isso parece um bom fim de semana";
const EN_FIRST = "That sounds like a good weekend";

test("a reply saved while bilingual reads in English after the setting changes", async ({
  page,
}) => {
  await page.goto("/e2e/harness.html?case=switched");

  const bubbles = page.locator(".msg-bot");
  await expect(bubbles).toHaveCount(3);

  const stored = bubbles.nth(1);
  await expect(stored).not.toContainText("EN:");
  await expect(stored).toContainText(`${EN_FIRST}. Was the water warm?`);
  await expect(stored).not.toContainText(PT_FIRST);
  await expect(stored.locator(".msg-translation")).toHaveCount(0);

  await stored.getByRole("button", { name: "ver tradução" }).click();
  await expect(stored.locator(".msg-translation")).toContainText(PT_FIRST);

  await stored.getByRole("button", { name: "esconder tradução" }).click();
  await expect(stored.locator(".msg-translation")).toHaveCount(0);
});

test("a reply saved with the older PT marker also reads in English", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=switched");

  const stored = page.locator(".msg-bot").nth(2);
  await expect(stored).not.toContainText("PT:");
  await expect(stored).toContainText(EN_FIRST);
  await expect(stored).not.toContainText(PT_FIRST);

  await stored.getByRole("button", { name: "ver tradução" }).click();
  await expect(stored.locator(".msg-translation")).toContainText(PT_FIRST);
});

test("compact mode gates the Portuguese half of an older reply", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=compact-switched");

  const assistant = page.locator(".compact-bubble.assistant").last();
  await expect(assistant).toContainText(EN_FIRST);
  await expect(assistant).not.toContainText("PT:");
  await expect(assistant.locator(".compact-translation")).toHaveCount(0);

  await assistant.getByRole("button", { name: "ver tradução" }).click();
  await expect(assistant.locator(".compact-translation")).toContainText(PT_FIRST);
});

test("popup mode gates the Portuguese half of an older reply", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=popup-reply");

  const bubble = page.locator(".popup-bubble-text");
  await expect(bubble).toContainText(EN_FIRST);
  await expect(bubble).not.toContainText("PT:");
  await expect(bubble.locator(".popup-translation")).toHaveCount(0);

  await bubble.getByRole("button", { name: "ver tradução" }).click();
  await expect(bubble.locator(".popup-translation")).toContainText(PT_FIRST);
});
