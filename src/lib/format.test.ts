import { describe, expect, it } from "vitest";
import { parseStoredFixes, splitBilingual, splitTranslation, stripLegacyFixes } from "./format";

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

describe("splitBilingual", () => {
  it("reads the Portuguese-first reply and its English line", () => {
    expect(
      splitBilingual(
        "Isso parece bom. A água estava quente?\nEN: That sounds nice. Was the water warm?",
      ),
    ).toEqual({
      portuguese: "Isso parece bom. A água estava quente?",
      english: "That sounds nice. Was the water warm?",
    });
  });

  it("tolerates blank lines and extra spacing", () => {
    expect(splitBilingual("Isso parece bom.\n\nEN:   That sounds nice.  ")).toEqual({
      portuguese: "Isso parece bom.",
      english: "That sounds nice.",
    });
  });

  it("still understands the older English-first format", () => {
    expect(splitBilingual("That sounds nice.\nPT: Isso parece bom.")).toEqual({
      portuguese: "Isso parece bom.",
      english: "That sounds nice.",
    });
  });

  it("keeps a reply without markers in the English slot", () => {
    expect(splitBilingual("Isso parece bom.")).toEqual({
      portuguese: "",
      english: "Isso parece bom.",
    });
  });

  it("ignores an empty English line", () => {
    expect(splitBilingual("Isso parece bom.\nEN:")).toEqual({
      portuguese: "",
      english: "Isso parece bom.\nEN:",
    });
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
