import { expect, test, type Page } from "@playwright/test";
import pkg from "../package.json" with { type: "json" };

const nextVersion = (() => {
  const [major, minor] = pkg.version.split(".");
  return `${major}.${Number(minor) + 1}.0`;
})();

test("compact bilingual replies start in Portuguese and reveal the English", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=compact-bilingual");

  const assistant = page.locator(".compact-bubble.assistant").last();
  await expect(assistant).toBeVisible();
  await expect(assistant).toContainText("Isso parece um bom fim de semana");
  await expect(assistant).not.toContainText("That sounds like a good weekend");

  await assistant.getByRole("button", { name: "ver em inglês" }).click();
  await expect(assistant.locator(".compact-english")).toContainText(
    "That sounds like a good weekend",
  );

  await assistant.getByRole("button", { name: "esconder inglês" }).click();
  await expect(assistant.locator(".compact-english")).toHaveCount(0);
  await expect(assistant.getByRole("button", { name: "ver em inglês" })).toBeVisible();
});

test("settings switches provider and base URL", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("dialog", { name: "Configurações" }).waitFor();
  await page.getByRole("tab", { name: "Conexão" }).click();

  await page.getByRole("button", { name: "OpenAI" }).click();
  await expect(page.getByLabel("URL base")).toHaveValue("https://api.openai.com/v1");
});

test("compact mode toggles back to full", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=compact");
  await expect(page.locator(".app.compact-liquid")).toBeVisible();
  await expect(page.locator(".compact-face")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fixar janela" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ocultar" })).toBeVisible();
  await expect(page.locator(".compact-card .composer textarea")).toBeVisible();

  await page.getByRole("button", { name: "Modo completo" }).click();
  await expect(page.locator(".app.compact-liquid")).toHaveCount(0);
});

test("compact composer shows wrapped text", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=compact");
  const area = page.locator(".compact-card .composer textarea");
  await area.fill("first line\nsecond line");
  const metrics = await area.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
});

test("history delete keeps the X in frame", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Histórico" }).click();
  const del = page.locator(".session-delete").first();
  await expect(del).toHaveText("×");
  await del.click();
  await expect(del).toHaveText("×apagar");
  const overflow = await del.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("practice checks a correct answer", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=practice");
  await expect(page.getByText("como você diria isto?")).toBeVisible();

  await page.getByPlaceholder("digite a frase corrigida").fill("I went to the gym yesterday");
  await page.getByRole("button", { name: "Conferir" }).click();

  await expect(page.getByText("exatamente certo")).toBeVisible();
  await expect(page.getByText("I went to the gym yesterday", { exact: true })).toBeVisible();
});

test("light theme keeps the send button visible", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("tab", { name: "Sistema" }).click();
  await page.getByRole("button", { name: "Claro" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const send = page.locator(".composer .send");
  await expect(send).toBeVisible();
  const colors = await send.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colors.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(colors.color).not.toBe(colors.background);
});

test("the mascot announces an available update", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=update");

  const speech = page.locator(".update-speech");
  await expect(speech).toContainText(`Saiu a versão ${nextVersion}.`);
  await expect(speech.getByRole("button", { name: "Instalar e reiniciar" })).toBeVisible();

  await speech.getByRole("button", { name: "Depois" }).click();
  await expect(speech).toHaveCount(0);
});

test("mascot accepts a drag gesture", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  const hit = page.locator(".mascot-hit");
  await expect(hit).toHaveAttribute("title", /Arraste/);

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

interface ChatBridgeState {
  requests: string[];
  cancelled: string[];
  drills: number;
}

/**
 * The shared harness stubs `invoke` but knows nothing about `chat` or the Tauri
 * event bus, so a reply can neither stream nor stay pending there. This wraps
 * the harness internals inside the page: `chat` only resolves when the test
 * says so (standing in for the corrections pass that runs after
 * `bubo-reply-done`) and the test can emit the same events Rust emits. Without
 * that delay the race below cannot be reproduced.
 */
async function installChatBridge(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Handler = (event: unknown) => void;
    interface Chat {
      requestId: string;
      resolve: (text: string) => void;
      reject: (reason: string) => void;
    }

    const scope = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
        transformCallback: (callback: Handler) => number;
      };
      __TAURI_EVENT_PLUGIN_INTERNALS__?: { unregisterListener: () => void };
      __calls: Array<{ cmd: string; args?: unknown }>;
      __buboChat: unknown;
    };
    const internals = scope.__TAURI_INTERNALS__;
    const passthrough = internals.invoke.bind(internals);
    const callbacks = new Map<number, Handler>();
    const listeners = new Map<number, { event: string; handler: number }>();
    const chats: Chat[] = [];
    let nextId = 1;

    const emit = (event: string, payload: unknown) => {
      for (const listener of listeners.values()) {
        if (listener.event !== event) continue;
        callbacks.get(listener.handler)?.({ event, id: listener.handler, payload });
      }
    };

    const bridge = {
      requests: [] as string[],
      cancelled: [] as string[],
      drills: 0,
      delta(index: number, text: string) {
        emit("bubo-delta", { requestId: chats[index].requestId, delta: text });
      },
      done(index: number) {
        emit("bubo-reply-done", { requestId: chats[index].requestId });
      },
      finish(index: number, text: string) {
        chats[index].resolve(text);
      },
    };

    scope.__buboChat = bridge;
    scope.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    internals.transformCallback = (callback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    };
    internals.invoke = async (cmd, args = {}) => {
      if (cmd === "plugin:event|listen") {
        const eventId = nextId++;
        listeners.set(eventId, { event: String(args.event), handler: Number(args.handler) });
        return eventId;
      }
      if (cmd === "plugin:event|unlisten") {
        listeners.delete(Number(args.eventId));
        return null;
      }
      if (cmd === "chat") {
        scope.__calls.push({ cmd, args });
        const requestId = String(args.requestId);
        bridge.requests.push(requestId);
        return new Promise<string>((resolve, reject) => {
          chats.push({ requestId, resolve, reject });
        });
      }
      if (cmd === "cancel_reply") {
        // Rust stops the stream; a reply cancelled before any text deletes the
        // user row and rejects with "cancelled".
        scope.__calls.push({ cmd, args });
        const requestId = String(args.requestId);
        bridge.cancelled.push(requestId);
        chats.find((chat) => chat.requestId === requestId)?.reject("cancelled");
        return null;
      }
      if (cmd === "drill_stats") bridge.drills += 1;
      return passthrough(cmd, args);
    };
  });
}

async function chatBridge(page: Page): Promise<ChatBridgeState> {
  return page.evaluate(() => {
    const bridge = (window as unknown as { __buboChat: ChatBridgeState }).__buboChat;
    return {
      requests: [...bridge.requests],
      cancelled: [...bridge.cancelled],
      drills: bridge.drills,
    };
  });
}

async function chatEvent(
  page: Page,
  action: "delta" | "done",
  index: number,
  text = "",
): Promise<void> {
  await page.evaluate(
    ({ action, index, text }) => {
      const bridge = (window as unknown as {
        __buboChat: { delta: (index: number, text: string) => void; done: (index: number) => void };
      }).__buboChat;
      if (action === "delta") bridge.delta(index, text);
      else bridge.done(index);
    },
    { action, index, text },
  );
}

async function finishChat(page: Page, index: number, text: string): Promise<void> {
  await page.evaluate(
    ({ index, text }) => {
      (window as unknown as { __buboChat: { finish: (i: number, t: string) => void } }).__buboChat.finish(
        index,
        text,
      );
    },
    { index, text },
  );
}

test("a new turn keeps the stop control while the previous corrections finish", async ({ page }) => {
  await page.goto("/e2e/harness.html?case=app");
  await expect(page.locator(".composer textarea")).toBeVisible();
  await installChatBridge(page);

  const textarea = page.locator(".composer textarea");
  const stop = page.getByRole("button", { name: "Parar" });

  await textarea.fill("first question");
  await textarea.press("Enter");
  await expect.poll(async () => (await chatBridge(page)).requests.length).toBe(1);

  // The turn exists on screen but has no database id yet; deleting it would
  // only hide it until the next load.
  const firstUser = page.locator(".msg-user", { hasText: "first question" });
  await expect(firstUser).toBeVisible();
  await expect(firstUser.getByRole("button", { name: "excluir" })).toBeDisabled();

  await chatEvent(page, "delta", 0, "first answer");
  await chatEvent(page, "done", 0);
  await expect(page.locator(".msg-bot").last()).toContainText("first answer");
  // The reply is done, so the composer is free even though the first `chat`
  // call (the corrections pass) is still in flight.
  await expect(stop).toHaveCount(0);

  await textarea.fill("second question");
  await textarea.press("Enter");
  await expect.poll(async () => (await chatBridge(page)).requests.length).toBe(2);
  await expect(stop).toBeVisible();

  // The first turn settles now. Its finally must not clear the second turn's
  // request, or Stop would have nothing to cancel.
  const before = await chatBridge(page);
  await finishChat(page, 0, "first answer");
  await expect.poll(async () => (await chatBridge(page)).drills).toBe(before.drills + 1);
  await expect(stop).toBeVisible();

  const secondRequest = (await chatBridge(page)).requests[1];
  await stop.click();
  await expect.poll(async () => (await chatBridge(page)).cancelled).toEqual([secondRequest]);

  // Cancelled before any text: the backend deletes the user row, so the user
  // bubble goes away with the bot one instead of reappearing after a reload.
  await expect(page.locator(".msg-user", { hasText: "second question" })).toHaveCount(0);
  await expect(page.locator(".msg-user", { hasText: "first question" })).toBeVisible();
});
