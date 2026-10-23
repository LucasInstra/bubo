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

/**
 * Splits a Portuguese-first bilingual reply into both languages.
 * The current prompt puts Portuguese first and ends with an `EN:` line; older
 * saved replies used the opposite order (`PT:` line after the English body).
 */
export function splitBilingual(content: string): { portuguese: string; english: string } {
  const englishLine = /(?:^|\n)EN:\s*([\s\S]*)$/.exec(content);
  if (englishLine) {
    const at = englishLine.index ?? 0;
    const portuguese = content.slice(0, at).trimEnd();
    const english = englishLine[1].trim();
    if (portuguese && english) return { portuguese, english };
  }

  const legacy = splitTranslation(content);
  if (legacy.translation) {
    return { portuguese: legacy.translation, english: legacy.body };
  }

  return { portuguese: "", english: content };
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
