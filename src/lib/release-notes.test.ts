import { describe, expect, it } from "vitest";
import { currentHighlights, releaseNotes } from "./release-notes";

describe("releaseNotes", () => {
  it("finds the bundled notes for a version", () => {
    expect(releaseNotes("0.8.5")).toContain("# bubo 0.8.5");
  });

  it("accepts a version with a leading v", () => {
    expect(releaseNotes("v0.8.5")).toContain("# bubo 0.8.5");
  });

  it("ignores the build label that follows the version", () => {
    expect(releaseNotes("0.8.5 · build 2")).toContain("# bubo 0.8.5");
  });

  it("returns nothing for an unknown or empty version", () => {
    expect(releaseNotes("0.0.0")).toBe("");
    expect(releaseNotes("")).toBe("");
  });

  it("turns the current notes into highlights", () => {
    const highlights = currentHighlights("0.8.5");
    expect(highlights.length).toBeGreaterThan(2);
    expect(highlights[0].label).toBe("Updates tab");
  });
});
