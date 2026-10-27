import { describe, expect, it } from "vitest";
import {
  buildHighlights,
  buildNotes,
  currentHighlights,
  hasBuildNotes,
  releaseNotes,
} from "./release-notes";

describe("releaseNotes", () => {
  it("prefers the Portuguese notes for the app", () => {
    expect(releaseNotes("0.9.1")).toContain("## Novidades");
    expect(releaseNotes("0.9.1")).toContain("Atualizações de build");
  });

  it("can still read the English notes used by GitHub", () => {
    expect(releaseNotes("0.9.1", "en")).toContain("## What's new");
    expect(releaseNotes("0.9.1", "en")).toContain("Build updates");
  });

  it("accepts a version with a leading v", () => {
    expect(releaseNotes("v0.9.1")).toContain("# bubo 0.9.1");
  });

  it("ignores the build label that follows the version", () => {
    expect(releaseNotes("0.9.1 · build 2")).toContain("# bubo 0.9.1");
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
    const highlights = currentHighlights("0.9.1");
    expect(highlights.length).toBeGreaterThan(1);
    expect(highlights[0].label).toBe("Atualizações de build");
  });

  it("reads the notes for one fix build", () => {
    expect(buildNotes("0.9.1", 6)).toContain("## Novidades");
    expect(buildNotes("0.9.1", 6)).toContain("Avaliação");
    expect(buildNotes("0.9.1", 6, "en")).toContain("## What's new");
    expect(buildNotes("0.9.1", 6, "en")).toContain("Answer checking");
  });

  it("uses build notes for the running build", () => {
    const highlights = buildHighlights("0.9.1", 6);
    expect(highlights.length).toBeGreaterThan(1);
    expect(highlights[0].label).toBe("Avaliação");
    expect(hasBuildNotes("0.9.1", 6)).toBe(true);
  });

  it("falls back to version notes for a build without its own notes", () => {
    expect(hasBuildNotes("0.9.1", 5)).toBe(false);
    expect(buildHighlights("0.9.1", 5)[0].label).toBe("Atualizações de build");
    expect(buildHighlights("0.9.1", 1)[0].label).toBe("Atualizações de build");
  });
});
