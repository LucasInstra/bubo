import { describe, expect, it } from "vitest";
import { parseStoredFixes, splitTranslation, stripLegacyFixes } from "./format";

describe("stripLegacyFixes", () => {
  it("removes an inline correction block", () => {
    expect(stripLegacyFixes('Hello there.\n<<<FIXES>>>\n- "a" → "b"')).toBe("Hello there.");
  });

  it("trims plain content", () => {
    expect(stripLegacyFixes("  hello  ")).toBe("hello");
  });
});

describe("splitTranslation", () => {
  it("separates the Portuguese line from the English body", () => {
    expect(splitTranslation("That sounds nice.\nPT: Isso parece bom.")).toEqual({
      body: "That sounds nice.",
      translation: "Isso parece bom.",
    });
  });

  it("tolerates blank lines and extra spacing", () => {
    expect(splitTranslation("That sounds nice.\n\nPT:   Isso parece bom.  ")).toEqual({
      body: "That sounds nice.",
      translation: "Isso parece bom.",
    });
  });

  it("keeps a reply that is only the translation", () => {
    const content = "PT: Isso parece bom.";
    expect(splitTranslation(content)).toEqual({ body: content, translation: "" });
  });

  it("ignores the marker in the middle of a line", () => {
    const content = "The PT: line is not a marker.";
    expect(splitTranslation(content)).toEqual({ body: content, translation: "" });
  });

  it("keeps an empty translation in the body", () => {
    const content = "That sounds nice.\nPT:";
    expect(splitTranslation(content)).toEqual({ body: content, translation: "" });
  });
});

describe("parseStoredFixes", () => {
  it("parses a valid array", () => {
    const fixes = parseStoredFixes('[{"wrong":"i go","right":"I went","note":"passado"}]');
    expect(fixes).toHaveLength(1);
    expect(fixes[0].right).toBe("I went");
  });

  it("returns an empty list for null or garbage", () => {
    expect(parseStoredFixes(null)).toEqual([]);
    expect(parseStoredFixes("not json")).toEqual([]);
    expect(parseStoredFixes('{"wrong":"x"}')).toEqual([]);
  });

  it("drops entries without the required fields", () => {
    expect(parseStoredFixes('[{"wrong":"x"},{"right":"y"}]')).toEqual([]);
  });
});
