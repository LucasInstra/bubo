import { describe, expect, it } from "vitest";
import { releaseHighlights } from "./highlights";

const notes = `# bubo 0.8.4

This release is about moving around the app faster.

## What's new

- **Settings tabs**: the settings screen used to be one long scroll. It now has
  five tabs with arrow, Home and End navigation.
- **Two-row header**: new chat, history, progress and practice moved to their
  own row.

## Build

- Version **0.8.4**, build **1**.
`;

describe("releaseHighlights", () => {
  it("keeps the What's new bullets and joins wrapped lines", () => {
    const highlights = releaseHighlights(notes);
    expect(highlights).toHaveLength(2);
    expect(highlights[0]).toEqual({
      label: "Settings tabs",
      text: "the settings screen used to be one long scroll. It now has five tabs with arrow, Home and End navigation.",
    });
    expect(highlights[1].label).toBe("Two-row header");
  });

  it("ignores bullets outside the What's new section", () => {
    const text = releaseHighlights(notes)
      .map((item) => item.text)
      .join(" ");
    expect(text).not.toContain("build");
  });

  it("strips bold, code and links", () => {
    const [first] = releaseHighlights(
      "## What's new\n\n- **Use `Escape`** to close, see [the docs](https://x).",
    );
    expect(first.label).toBe("");
    expect(first.text).toBe("Use Escape to close, see the docs.");
  });

  it("caps the list", () => {
    const many = [
      "## What's new",
      "",
      ...Array.from({ length: 9 }, (_, index) => `- item ${index}`),
    ].join("\n");
    expect(releaseHighlights(many, 3)).toHaveLength(3);
  });

  it("falls back to the opening paragraph when there are no bullets", () => {
    const [only] = releaseHighlights(
      "bubo 0.8.4 is a small fix build. Nothing changed.\n\n## Build\n",
    );
    expect(only.label).toBe("");
    expect(only.text).toContain("small fix build");
  });

  it("returns nothing for empty notes", () => {
    expect(releaseHighlights("")).toEqual([]);
  });
});
