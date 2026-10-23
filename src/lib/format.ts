import type { Fix } from "./types";

const LEGACY_MARK = "<<<FIXES>>>";

/** Earlier versions asked the model to inline corrections; strip any leftovers. */
export function stripLegacyFixes(content: string): string {
  const mark = content.indexOf(LEGACY_MARK);
  return (mark === -1 ? content : content.slice(0, mark)).trim();
}

/**
 * Splits a bilingual reply into the English body and the Portuguese line.
 * The marker only counts at the start of a line, and a reply that is only the
 * translation stays untouched so nothing disappears.
 */
export function splitTranslation(content: string): { body: string; translation: string } {
  const match = /(?:^|\n)PT:\s*([\s\S]*)$/.exec(content);
  if (!match) return { body: content, translation: "" };
  const at = match.index ?? 0;
  const body = content.slice(0, at).trimEnd();
  const translation = match[1].trim();
  if (!body || !translation) return { body: content, translation: "" };
  return { body, translation };
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
