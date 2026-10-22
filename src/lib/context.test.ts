import { describe, expect, it } from "vitest";
import { trimContext } from "./context";
import type { Msg } from "./types";

function message(id: string, content: string, error = false): Msg {
  return { id, role: "user", content, fixes: [], error };
}

describe("trimContext", () => {
  it("keeps a short conversation untouched", () => {
    const result = trimContext([message("1", "hello"), message("2", "hi")]);
    expect(result.trimmed).toBe(false);
    expect(result.messages.map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("drops the oldest messages when the budget is exceeded", () => {
    const result = trimContext(
      [message("1", "a".repeat(100)), message("2", "b".repeat(100)), message("3", "c".repeat(100))],
      260,
    );
    expect(result.trimmed).toBe(true);
    expect(result.messages.map((item) => item.id)).toEqual(["2", "3"]);
  });

  it("always keeps at least one message and ignores failed turns", () => {
    const result = trimContext(
      [message("error", "x".repeat(1_000), true), message("last", "y".repeat(1_000))],
      40,
    );
    expect(result.messages.map((item) => item.id)).toEqual(["last"]);
    expect(result.trimmed).toBe(false);
  });

  it("preserves chronological order", () => {
    const result = trimContext([message("1", "a"), message("2", "b"), message("3", "c")], 20);
    expect(result.messages.map((item) => item.id)).toEqual(["3"]);
  });
});
