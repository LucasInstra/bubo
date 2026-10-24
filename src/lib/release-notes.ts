import { releaseHighlights, type Highlight } from "./highlights";

// Every release note ships with the app, so the Updates tab can show what the
// running version changed without a network call.
const NOTES = import.meta.glob("../../release-notes/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function normalize(version: string): string {
  // The settings header decorates the running version with the build label
  // ("0.8.5 · build 1"), so keep only the leading semver before matching notes.
  return version.trim().match(/^v?(\d+\.\d+\.\d+)/)?.[1] ?? "";
}

export type NoteLanguage = "pt" | "en";

/**
 * The bundled release notes for a version. The app UI is Portuguese, so the
 * `<version>.pt.md` highlights win and the English body is only a fallback.
 */
export function releaseNotes(version: string, language: NoteLanguage = "pt"): string {
  const wanted = normalize(version);
  if (!wanted) return "";
  const suffix = language === "pt" ? ".pt" : "";
  const path = Object.keys(NOTES).find((file) => file.endsWith(`/${wanted}${suffix}.md`));
  if (path) return NOTES[path];
  return language === "pt" ? releaseNotes(wanted, "en") : "";
}

/** The "What's new" bullets for a version, ready for the card. */
export function currentHighlights(version: string, limit = 8): Highlight[] {
  return releaseHighlights(releaseNotes(version), limit);
}
