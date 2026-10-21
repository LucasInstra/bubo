/**
 * Structurally compatible with `KeyboardEvent`, but plain objects work too so the
 * composition rules can be unit-tested without a DOM environment.
 */
export interface HotkeyEventLike {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export interface HotkeyCapture {
  /** The chord to save, or null when the event is not a usable shortcut yet. */
  value: string | null;
  /** Live label for the armed control, e.g. `Ctrl+Alt+...`. */
  preview: string;
  /** A short explanation when the event was rejected, empty otherwise. */
  hint: string;
}

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);
const MODIFIER_CODES = /^(Control|Alt|Shift|Meta)(Left|Right)$/;

const CODE_KEYS: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  NumpadEnter: "NumpadEnter",
  Escape: "Escape",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  Delete: "Delete",
  Tab: "Tab",
  Backspace: "Backspace",
  Comma: "Comma",
  Period: "Period",
  Slash: "Slash",
  Semicolon: "Semicolon",
  Quote: "Quote",
  Minus: "Minus",
  Equal: "Equal",
  Backquote: "Backquote",
};

const KEY_KEYS: Record<string, string> = {
  " ": "Space",
  Spacebar: "Space",
  Enter: "Enter",
  Escape: "Escape",
  Esc: "Escape",
  ArrowUp: "ArrowUp",
  Up: "ArrowUp",
  ArrowDown: "ArrowDown",
  Down: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  Left: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Right: "ArrowRight",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  Delete: "Delete",
  Del: "Delete",
  Tab: "Tab",
  Backspace: "Backspace",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  ";": "Semicolon",
  "'": "Quote",
  "-": "Minus",
  "=": "Equal",
  "`": "Backquote",
};

const KEY_TOKEN = /^F([1-9]|1[0-9]|2[0-4])$/;

function modifierNames(event: HotkeyEventLike): string[] {
  const names: string[] = [];
  if (event.ctrlKey) names.push("Ctrl");
  if (event.altKey) names.push("Alt");
  if (event.shiftKey) names.push("Shift");
  // global-hotkey calls the Windows key SUPER; META is not a valid token there.
  if (event.metaKey) names.push("Super");
  return names;
}

function isModifierEvent(event: HotkeyEventLike): boolean {
  return MODIFIER_KEYS.has(event.key) || MODIFIER_CODES.test(event.code);
}

function keyToken(event: HotkeyEventLike): string | null {
  const { code, key } = event;

  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];

  const numpad = /^Numpad([0-9])$/.exec(code);
  if (numpad) return `Numpad${numpad[1]}`;

  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];

  const functionKey = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code);
  if (functionKey) return `F${functionKey[1]}`;

  if (CODE_KEYS[code]) return CODE_KEYS[code];

  // Synthetic events (and some layouts) may not carry a useful `code`.
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  if (KEY_TOKEN.test(key)) return key.toUpperCase();

  return KEY_KEYS[key] ?? null;
}

/** Builds the live label while the user holds modifiers, e.g. `Ctrl+Alt+...`. */
export function modifierPreview(event: HotkeyEventLike): string {
  const names = modifierNames(event);
  return names.length > 0 ? `${names.join("+")}+...` : "";
}

/**
 * Describes a key press for the recorder. The value grammar is the one the Rust
 * `global-hotkey` parser accepts: modifiers first (Ctrl, Alt, Shift, Meta) and
 * then exactly one key token.
 */
export function describeHotkey(event: HotkeyEventLike): HotkeyCapture {
  const names = modifierNames(event);
  const prefix = names.length > 0 ? `${names.join("+")}+` : "";

  if (isModifierEvent(event)) {
    return {
      value: null,
      preview: names.length > 0 ? `${prefix}...` : "",
      hint:
        event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
          ? "Shift alone is not enough. Add Ctrl, Alt or Super."
          : "",
    };
  }

  const token = keyToken(event);
  if (!token) {
    return {
      value: null,
      preview: names.length > 0 ? `${prefix}?` : "",
      hint: "That key cannot be used. Try a letter, digit, F-key, arrow or punctuation.",
    };
  }

  if (!event.ctrlKey && !event.altKey && !event.metaKey) {
    return {
      value: null,
      preview: `${prefix}${token}`,
      hint: event.shiftKey
        ? "Shift alone is not enough. Add Ctrl, Alt or Super."
        : "Hold Ctrl, Alt or Super as well.",
    };
  }

  const value = `${prefix}${token}`;
  return { value, preview: value, hint: "" };
}

/** Returns the chord for the event, or null when it cannot be used. */
export function hotkeyFromEvent(event: HotkeyEventLike): string | null {
  return describeHotkey(event).value;
}
