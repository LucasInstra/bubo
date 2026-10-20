import { describe, expect, it } from "vitest";
import { isCorrectAnswer, normalizeAnswer } from "./answer";

describe("normalizeAnswer", () => {
  it("lowercases, trims and drops punctuation", () => {
    expect(normalizeAnswer("  It was very good. ")).toBe("it was very good");
    expect(normalizeAnswer("Don’t — stop!")).toBe("don't stop");
  });

  it("collapses whitespace", () => {
    expect(normalizeAnswer("a    b")).toBe("a b");
  });
});

describe("isCorrectAnswer", () => {
  it("accepts the exact fragment regardless of case and punctuation", () => {
    expect(isCorrectAnswer("I went out on Friday.", "i went out on friday")).toBe(true);
  });

  it("accepts a full sentence that contains the fragment", () => {
    expect(isCorrectAnswer("Well, it was very good actually", "it was very good")).toBe(true);
  });

  it("rejects empty answers", () => {
    expect(isCorrectAnswer("   ", "it was very good")).toBe(false);
  });

  it("does not accept unrelated text", () => {
    expect(isCorrectAnswer("she went home", "it was very good")).toBe(false);
  });

  it("requires a meaningful target before using substring matching", () => {
    expect(isCorrectAnswer("anything at all", "I")).toBe(false);
  });
});
