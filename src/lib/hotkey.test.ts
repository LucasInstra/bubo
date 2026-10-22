import { describe, expect, it } from "vitest";
import { describeHotkey, hotkeyFromEvent, modifierPreview, type HotkeyEventLike } from "./hotkey";

function press(part: Partial<HotkeyEventLike> & { code: string; key: string }): HotkeyEventLike {
  return {
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...part,
  };
}

describe("hotkeyFromEvent", () => {
  it("composes letters with the modifiers in a stable order", () => {
    expect(hotkeyFromEvent(press({ code: "KeyB", key: "b", ctrlKey: true, altKey: true }))).toBe(
      "Ctrl+Alt+B",
    );
    expect(
      hotkeyFromEvent(
        press({
          code: "KeyK",
          key: "k",
          ctrlKey: true,
          altKey: true,
          shiftKey: true,
          metaKey: true,
        }),
      ),
    ).toBe("Ctrl+Alt+Shift+Super+K");
  });

  it("supports function keys up to F24", () => {
    expect(hotkeyFromEvent(press({ code: "F5", key: "F5", ctrlKey: true, shiftKey: true }))).toBe(
      "Ctrl+Shift+F5",
    );
    expect(hotkeyFromEvent(press({ code: "F24", key: "F24", ctrlKey: true }))).toBe("Ctrl+F24");
    expect(hotkeyFromEvent(press({ code: "F25", key: "F25", ctrlKey: true }))).toBeNull();
  });

  it("supports digits from the top row and the numpad", () => {
    expect(hotkeyFromEvent(press({ code: "Digit1", key: "1", ctrlKey: true, altKey: true }))).toBe(
      "Ctrl+Alt+1",
    );
    expect(hotkeyFromEvent(press({ code: "Numpad0", key: "0", altKey: true }))).toBe("Alt+Numpad0");
    expect(hotkeyFromEvent(press({ code: "NumpadEnter", key: "Enter", altKey: true }))).toBe(
      "Alt+NumpadEnter",
    );
  });

  it("supports named keys and punctuation tokens", () => {
    expect(hotkeyFromEvent(press({ code: "Space", key: " ", altKey: true }))).toBe("Alt+Space");
    expect(hotkeyFromEvent(press({ code: "ArrowUp", key: "ArrowUp", ctrlKey: true }))).toBe(
      "Ctrl+ArrowUp",
    );
    expect(hotkeyFromEvent(press({ code: "PageDown", key: "PageDown", metaKey: true }))).toBe(
      "Super+PageDown",
    );
    expect(hotkeyFromEvent(press({ code: "Comma", key: ",", ctrlKey: true }))).toBe("Ctrl+Comma");
    expect(hotkeyFromEvent(press({ code: "Semicolon", key: ";", ctrlKey: true }))).toBe(
      "Ctrl+Semicolon",
    );
    expect(hotkeyFromEvent(press({ code: "Quote", key: "'", altKey: true }))).toBe("Alt+Quote");
    expect(hotkeyFromEvent(press({ code: "Backquote", key: "`", ctrlKey: true }))).toBe(
      "Ctrl+Backquote",
    );
    expect(hotkeyFromEvent(press({ code: "Backspace", key: "Backspace", ctrlKey: true }))).toBe(
      "Ctrl+Backspace",
    );
    expect(hotkeyFromEvent(press({ code: "Escape", key: "Escape", ctrlKey: true }))).toBe(
      "Ctrl+Escape",
    );
  });

  it("falls back to event.key when code is unavailable", () => {
    expect(hotkeyFromEvent(press({ code: "", key: "j", ctrlKey: true }))).toBe("Ctrl+J");
    expect(hotkeyFromEvent(press({ code: "", key: ";", ctrlKey: true }))).toBe("Ctrl+Semicolon");
  });

  it("rejects lone modifier presses", () => {
    expect(
      hotkeyFromEvent(press({ code: "ControlLeft", key: "Control", ctrlKey: true })),
    ).toBeNull();
    expect(hotkeyFromEvent(press({ code: "AltRight", key: "Alt", altKey: true }))).toBeNull();
    expect(hotkeyFromEvent(press({ code: "ShiftLeft", key: "Shift", shiftKey: true }))).toBeNull();
  });

  it("requires at least Ctrl, Alt or Super", () => {
    const shiftOnly = describeHotkey(press({ code: "KeyK", key: "K", shiftKey: true }));
    expect(shiftOnly.value).toBeNull();
    expect(shiftOnly.hint).toContain("Shift sozinho");

    const plain = describeHotkey(press({ code: "KeyK", key: "k" }));
    expect(plain.value).toBeNull();
    expect(plain.hint).toContain("Ctrl, Alt ou Super");
  });

  it("rejects keys that the parser cannot represent", () => {
    const result = describeHotkey(
      press({ code: "IntlBackslash", key: "\\", ctrlKey: true, altKey: true }),
    );
    expect(result.value).toBeNull();
    expect(result.hint).toContain("não pode ser usada");
  });
});

describe("previews", () => {
  it("shows held modifiers while arming", () => {
    expect(modifierPreview(press({ code: "ControlLeft", key: "Control", ctrlKey: true }))).toBe(
      "Ctrl+...",
    );
    expect(
      modifierPreview(
        press({ code: "AltLeft", key: "Alt", ctrlKey: true, altKey: true, shiftKey: true }),
      ),
    ).toBe("Ctrl+Alt+Shift+...");
    expect(modifierPreview(press({ code: "KeyA", key: "a" }))).toBe("");
  });

  it("describes lone modifiers with their live preview", () => {
    const result = describeHotkey(press({ code: "ControlLeft", key: "Control", ctrlKey: true }));
    expect(result.value).toBeNull();
    expect(result.preview).toBe("Ctrl+...");
  });

  it("shows the attempted chord when a modifier is missing", () => {
    const result = describeHotkey(press({ code: "KeyK", key: "K", shiftKey: true }));
    expect(result.value).toBeNull();
    expect(result.preview).toBe("Shift+K");
  });
});
