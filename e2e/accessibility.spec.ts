import { expect, test } from "@playwright/test";

test("settings dialog traps focus and restores it to the trigger", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();

  const dialog = page.getByRole("dialog", { name: "Configurações" });
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
    .toBe("Configurações");
});

test("the conversation is a live region and the composer has a stable label", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");

  const log = page.getByRole("log", { name: "Conversa" });
  await expect(log).toHaveAttribute("aria-live", "polite");
  await expect(page.getByLabel("Mensagem para o bubo")).toBeVisible();
});

test("selection chips expose whether they are pressed", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();
  const dialog = page.getByRole("dialog", { name: "Configurações" });
  await dialog.getByRole("tab", { name: "Aprendizado" }).click();

  const b1 = dialog.getByRole("button", { name: "B1", exact: true });
  await expect(b1).toHaveAttribute("aria-pressed", "true");

  await dialog.getByRole("button", { name: "A2", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "A2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(b1).toHaveAttribute("aria-pressed", "false");
});

test("the practice answer is labelled and the result is announced", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=practice");

  const input = page.locator(".drill-input");
  await expect(input).toHaveAttribute("aria-labelledby", "drill-question drill-phrase");
  await expect(page.getByRole("textbox", { name: /como você diria isto\?/ })).toBeVisible();

  await input.fill("I went to the gym yesterday");
  await page.getByRole("button", { name: "Conferir" }).click();

  await expect(page.locator(".drill-body [role='status']")).toHaveText(
    "Certo. I went to the gym yesterday",
  );
});

test("escape cancels a history rename without closing the panel", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Histórico" }).click();

  const dialog = page.getByRole("dialog", { name: "Histórico" });
  await dialog.getByRole("button", { name: "Renomear conversa" }).first().click();

  const input = dialog.getByLabel("Nome da conversa");
  await expect(input).toBeVisible();
  await input.press("Escape");

  await expect(input).toHaveCount(0);
  await expect(dialog).toBeVisible();
});

test("the last clicked conversation wins when two loads overlap", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");

  // Make the first conversation resolve last, which is the order that used to
  // leave the panel showing the older click.
  await page.evaluate(() => {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    }).__TAURI_INTERNALS__;
    const original = internals.invoke.bind(internals);
    internals.invoke = async (cmd, args = {}) => {
      const result = await original(cmd, args);
      if (cmd === "open_session") {
        await new Promise((resolve) => setTimeout(resolve, args.id === 1 ? 400 : 20));
      }
      return result;
    };
  });

  await page.getByRole("button", { name: "Histórico" }).click();
  const rows = page.locator(".session-main");
  await rows.first().click();
  await rows.nth(1).click();

  const shown = page.locator(".msg-user");
  await expect(shown).toContainText("coffee order practice");
  await page.waitForTimeout(600);
  await expect(shown).toContainText("coffee order practice");
});
