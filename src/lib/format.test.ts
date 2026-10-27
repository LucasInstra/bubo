import { describe, expect, it } from "vitest";
import { parseBilingualReply, parseStoredFixes, splitReply, stripLegacyFixes } from "./format";

describe("stripLegacyFixes", () => {
  it("removes an inline correction block", () => {
    expect(stripLegacyFixes('Hello there.\n<<<FIXES>>>\n- "a" → "b"')).toBe("Hello there.");
  });

  it("trims plain content", () => {
    expect(stripLegacyFixes("  hello  ")).toBe("hello");
  });
});

describe("parseBilingualReply", () => {
  it("reads the Portuguese-first reply and its English line", () => {
    expect(
      parseBilingualReply(
        "Isso parece bom. A água estava quente?\nEN: That sounds nice. Was the water warm?",
      ),
    ).toEqual({
      portuguese: "Isso parece bom. A água estava quente?",
      english: "That sounds nice. Was the water warm?",
      marked: true,
    });
  });

  it("tolerates blank lines and extra spacing", () => {
    expect(parseBilingualReply("Isso parece bom.\n\nEN:   That sounds nice.  ")).toEqual({
      portuguese: "Isso parece bom.",
      english: "That sounds nice.",
      marked: true,
    });
  });

  it("still understands the older English-first format", () => {
    expect(parseBilingualReply("That sounds nice.\nPT: Isso parece bom.")).toEqual({
      portuguese: "Isso parece bom.",
      english: "That sounds nice.",
      marked: true,
    });
  });

  it("understands a bold marker", () => {
    expect(parseBilingualReply("Isso parece bom.\n**EN:** That sounds nice.")).toEqual({
      portuguese: "Isso parece bom.",
      english: "That sounds nice.",
      marked: true,
    });
    expect(parseBilingualReply("That sounds nice.\n**PT:** Isso parece bom.")).toEqual({
      portuguese: "Isso parece bom.",
      english: "That sounds nice.",
      marked: true,
    });
  });

  it("understands a lower-case marker", () => {
    expect(parseBilingualReply("Isso parece bom.\nen: That sounds nice.")).toEqual({
      portuguese: "Isso parece bom.",
      english: "That sounds nice.",
      marked: true,
    });
    expect(parseBilingualReply("That sounds nice.\npt: Isso parece bom.")).toEqual({
      portuguese: "Isso parece bom.",
      english: "That sounds nice.",
      marked: true,
    });
  });

  it("understands a marker written inline after a sentence", () => {
    expect(parseBilingualReply("Isso parece bom? EN: That sounds nice?")).toEqual({
      portuguese: "Isso parece bom?",
      english: "That sounds nice?",
      marked: true,
    });
  });

  it("keeps the sentence break with the Portuguese half", () => {
    // The `?` that introduces the marker belongs to the previous half.
    expect(parseBilingualReply("Isso parece bom. EN: That sounds nice.")).toEqual({
      portuguese: "Isso parece bom.",
      english: "That sounds nice.",
      marked: true,
    });
  });

  it("drops an empty marker instead of leaking it into the body", () => {
    expect(parseBilingualReply("Isso parece bom.\nEN:")).toEqual({
      portuguese: "Isso parece bom.",
      english: "",
      marked: true,
    });
    expect(parseBilingualReply("That sounds nice.\nPT:")).toEqual({
      portuguese: "",
      english: "That sounds nice.",
      marked: true,
    });
  });

  it("merges repeated markers of the same language", () => {
    expect(
      parseBilingualReply("Isso parece bom.\nEN: That sounds nice.\nEN: Would you like tea?"),
    ).toEqual({
      portuguese: "Isso parece bom.",
      english: "That sounds nice.\n\nWould you like tea?",
      marked: true,
    });
  });

  it("does not treat a marker in the middle of prose as a split", () => {
    const content = "The PT: line is not a marker.";
    expect(parseBilingualReply(content)).toEqual({
      portuguese: "",
      english: content,
      marked: false,
    });
  });

  it("does not treat an ordered list label as a marker", () => {
    const content = "1. EN: read the sentence\n2. EN: say it out loud";
    expect(parseBilingualReply(content)).toEqual({
      portuguese: "",
      english: content,
      marked: false,
    });
  });

  it("keeps an unmarked reply whole in the English slot", () => {
    expect(parseBilingualReply("Isso parece bom.")).toEqual({
      portuguese: "",
      english: "Isso parece bom.",
      marked: false,
    });
  });
});

describe("splitReply", () => {
  const current =
    "Isso parece bom. A água estava quente?\nEN: That sounds nice. Was the water warm?";
  const legacy =
    "That sounds nice. Was the water warm?\nPT: Isso parece bom. A água estava quente?";

  it("shows English first with a Portuguese translation in English mode", () => {
    expect(splitReply(current, "en")).toEqual({
      primary: "That sounds nice. Was the water warm?",
      primaryLang: "en",
      translation: "Isso parece bom. A água estava quente?",
      translationLang: "pt",
    });
  });

  it("reads a reply saved in the older format the same way", () => {
    expect(splitReply(legacy, "en")).toEqual({
      primary: "That sounds nice. Was the water warm?",
      primaryLang: "en",
      translation: "Isso parece bom. A água estava quente?",
      translationLang: "pt",
    });
  });

  it("shows Portuguese first with an English translation in bilingual mode", () => {
    expect(splitReply(current, "bilingual")).toEqual({
      primary: "Isso parece bom. A água estava quente?",
      primaryLang: "pt",
      translation: "That sounds nice. Was the water warm?",
      translationLang: "en",
    });
  });

  it("shows English first with a Portuguese translation in Portuguese mode", () => {
    expect(splitReply(current, "pt")).toEqual({
      primary: "That sounds nice. Was the water warm?",
      primaryLang: "en",
      translation: "Isso parece bom. A água estava quente?",
      translationLang: "pt",
    });
  });

  it("never leaks the marker when the mode changes after the reply was saved", () => {
    for (const mode of ["en", "pt", "bilingual"]) {
      const shown = splitReply(current, mode);
      expect(shown.primary).not.toContain("EN:");
      expect(shown.translation).not.toContain("EN:");
    }
  });

  it("leaves a single-language reply without a translation", () => {
    expect(splitReply("Isso parece bom.", "en")).toEqual({
      primary: "Isso parece bom.",
      primaryLang: null,
      translation: "",
      translationLang: null,
    });
  });

  it("shows a translation-only reply without its marker", () => {
    expect(splitReply("PT: Isso parece bom.", "en")).toEqual({
      primary: "Isso parece bom.",
      primaryLang: "pt",
      translation: "",
      translationLang: null,
    });
  });

  it("shows an empty marker reply without leaking it", () => {
    expect(splitReply("That sounds nice.\nPT:", "en")).toEqual({
      primary: "That sounds nice.",
      primaryLang: "en",
      translation: "",
      translationLang: null,
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
