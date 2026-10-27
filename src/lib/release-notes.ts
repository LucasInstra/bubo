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

/**
 * The notes for one fix build, e.g. `0.9.1.build6.md`. Version builds (build 1)
 * use the version notes instead.
 */
export function buildNotes(version: string, build: number, language: NoteLanguage = "pt"): string {
  const wanted = normalize(version);
  if (!wanted || build <= 1) return "";
  const suffix = language === "pt" ? ".pt" : "";
  const path = Object.keys(NOTES).find((file) =>
    file.endsWith(`/${wanted}.build${build}${suffix}.md`),
  );
  if (path) return NOTES[path];
  return language === "pt" ? buildNotes(wanted, build, "en") : "";
}

/** Whether a build has its own notes, so the card can say "build N". */
export function hasBuildNotes(version: string, build: number): boolean {
  return buildNotes(version, build).length > 0;
}

/** Highlights for the running build: build notes first, version notes as fallback. */
export function buildHighlights(version: string, build: number, limit = 8): Highlight[] {
  const notes = buildNotes(version, build);
  return notes ? releaseHighlights(notes, limit) : currentHighlights(version, limit);
}
