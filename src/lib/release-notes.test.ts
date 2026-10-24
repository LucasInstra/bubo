import { describe, expect, it } from "vitest";
import { currentHighlights, releaseNotes } from "./release-notes";

describe("releaseNotes", () => {
  it("prefers the Portuguese notes for the app", () => {
    expect(releaseNotes("0.9.0")).toContain("## Novidades");
    expect(releaseNotes("0.9.0")).toContain("Primeiro acesso guiado");
  });

  it("can still read the English notes used by GitHub", () => {
    expect(releaseNotes("0.9.0", "en")).toContain("## What's new");
    expect(releaseNotes("0.9.0", "en")).toContain("First-run onboarding");
  });

  it("accepts a version with a leading v", () => {
    expect(releaseNotes("v0.9.0")).toContain("# bubo 0.9.0");
  });

  it("ignores the build label that follows the version", () => {
    expect(releaseNotes("0.9.0 · build 2")).toContain("# bubo 0.9.0");
  });

  it("falls back to English when a translation is missing", () => {
    expect(releaseNotes("0.8.0")).toContain("## What's new");
    expect(releaseNotes("0.8.0", "en")).toContain("## What's new");
  });

  it("returns nothing for an unknown or empty version", () => {
    expect(releaseNotes("0.0.0")).toBe("");
    expect(releaseNotes("")).toBe("");
  });

  it("turns the current notes into Portuguese highlights", () => {
    const highlights = currentHighlights("0.9.0");
    expect(highlights.length).toBeGreaterThan(1);
    expect(highlights[0].label).toBe("Primeiro acesso guiado");
  });
});
