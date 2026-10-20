import { describe, expect, it } from "vitest";
import { parseStoredFixes, stripLegacyFixes } from "./format";

describe("stripLegacyFixes", () => {
  it("removes an inline correction block", () => {
    expect(stripLegacyFixes('Hello there.\n<<<FIXES>>>\n- "a" → "b"')).toBe("Hello there.");
  });

  it("trims plain content", () => {
    expect(stripLegacyFixes("  hello  ")).toBe("hello");
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
