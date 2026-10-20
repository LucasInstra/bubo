import type { Fix } from "./types";

const LEGACY_MARK = "<<<FIXES>>>";

/** Earlier versions asked the model to inline corrections; strip any leftovers. */
export function stripLegacyFixes(content: string): string {
  const mark = content.indexOf(LEGACY_MARK);
  return (mark === -1 ? content : content.slice(0, mark)).trim();
}

export function parseStoredFixes(raw: string | null): Fix[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Fix =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Fix).wrong === "string" &&
          typeof (item as Fix).right === "string",
      )
      .map((item) => ({
        wrong: item.wrong,
        right: item.right,
        note: typeof item.note === "string" ? item.note : "",
      }));
  } catch {
    return [];
  }
}
