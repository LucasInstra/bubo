import type { Fix } from "./types";

const LEGACY_MARK = "<<<FIXES>>>";

/** Earlier versions asked the model to inline corrections; strip any leftovers. */
export function stripLegacyFixes(content: string): string {
  const mark = content.indexOf(LEGACY_MARK);
  return (mark === -1 ? content : content.slice(0, mark)).trim();
}

type ReplyLang = "en" | "pt";

/**
 * A language marker: the label, a colon and the copy that follows. The current
 * prompt writes the Portuguese half first and closes with `EN:`; older replies
 * used the opposite order (`PT:` after the English body). Models also bold the
 * label, lower-case it, or run it inline right after a sentence, so the marker
 * is recognised by shape instead of by the settings in force at render time.
 */
const MARKER =
  /(^|\n|[.!?…]["')\]]?[ \t]+)[ \t>*_#`~-]*\*{0,2}(en|pt)\*{0,2}[ \t]*:[ \t]*(?:[*_]{0,2}(?=[ \t]|$|\n))?/gi;

interface Marker {
  lang: ReplyLang;
  /** Where the text before the marker ends. */
  cut: number;
  /** Where the copy that belongs to the marker starts. */
  bodyStart: number;
}

function isListNumber(content: string, delimiterStart: number): boolean {
  // "1. EN: ..." is an ordered list, not a language switch.
  const prefix = content.slice(0, delimiterStart + 1);
  return /(?:^|\s)\d+\.$/.test(prefix);
}

function findMarkers(content: string): Marker[] {
  const markers: Marker[] = [];
  MARKER.lastIndex = 0;
  let match = MARKER.exec(content);
  while (match) {
    const delimiter = match[1];
    const punctuation = delimiter !== "\n" && delimiter !== "";
    if (punctuation && isListNumber(content, match.index)) {
      match = MARKER.exec(content);
      continue;
    }
    markers.push({
      lang: match[2].toLowerCase() as ReplyLang,
      // A sentence break belongs to the previous half; a newline separates the
      // halves and is dropped.
      cut: punctuation ? match.index + delimiter.length : match.index,
      bodyStart: match.index + match[0].length,
    });
    match = MARKER.exec(content);
  }
  return markers;
}

export interface ParsedReply {
  portuguese: string;
  english: string;
  /** True when the reply carried at least one language marker. */
  marked: boolean;
}

/**
 * Splits a stored reply into both languages, whatever order and marker style it
 * was saved with. A reply without markers stays whole in the English slot so
 * nothing is lost; the renderer decides what to show.
 */
export function parseBilingualReply(content: string): ParsedReply {
  const markers = findMarkers(content);
  if (markers.length === 0) {
    return { portuguese: "", english: content.trim(), marked: false };
  }

  const parts: Record<ReplyLang, string[]> = { en: [], pt: [] };
  const head = content.slice(0, markers[0].cut).trim();
  if (head) {
    // The half before the first marker holds the other language: the current
    // prompt opens in Portuguese and closes with `EN:`, the older format opened
    // in English and closed with `PT:`.
    parts[markers[0].lang === "en" ? "pt" : "en"].push(head);
  }

  markers.forEach((marker, index) => {
    const end = index + 1 < markers.length ? markers[index + 1].cut : content.length;
    const text = content.slice(marker.bodyStart, end).trim();
    if (text) parts[marker.lang].push(text);
  });

  const join = (list: string[]) => list.join("\n\n").trim();
  return { portuguese: join(parts.pt), english: join(parts.en), marked: true };
}

export interface ReplySplit {
  /** The text shown as the main bubble body. */
  primary: string;
  /** Language of the main body, when the reply carried markers. */
  primaryLang: ReplyLang | null;
  /** The opposite-language half, empty when the reply is single-language. */
  translation: string;
  translationLang: ReplyLang | null;
}

/**
 * Turns a stored reply into what a bubble should show. The body follows the
 * configured reply language, and the other half becomes the gated translation —
 * so a reply saved in bilingual mode still reads correctly after the setting
 * changes, instead of leaking a raw `EN:` line into the body.
 */
export function splitReply(content: string, replyLanguage = "en"): ReplySplit {
  const parsed = parseBilingualReply(content);
  const both = Boolean(parsed.portuguese && parsed.english);

  if (both) {
    return replyLanguage === "bilingual"
      ? {
          primary: parsed.portuguese,
          primaryLang: "pt",
          translation: parsed.english,
          translationLang: "en",
        }
      : {
          primary: parsed.english,
          primaryLang: "en",
          translation: parsed.portuguese,
          translationLang: "pt",
        };
  }

  return {
    primary: parsed.english || parsed.portuguese || content.trim(),
    primaryLang: parsed.marked ? (parsed.english ? "en" : "pt") : null,
    translation: "",
    translationLang: null,
  };
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
