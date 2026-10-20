import type { Fix } from "./types";

const MARK = "<<<FIXES>>>";
const END = "<<<END>>>";

function unquote(value: string | undefined): string {
  return (value ?? "")
    .replace(/^\s*[-•]\s*/, "")
    .replace(/[*_`]/g, "")
    .replace(/^["“”'«»]+|["“”'«»]+$/g, "")
    .trim();
}

/**
 * The model streams one message: the English reply, then an optional
 * correction block delimited by <<<FIXES>>> ... <<<END>>>.
 * While streaming, only the reply part is rendered.
 */
export function splitContent(raw: string): { body: string; fixes: Fix[] } {
  const start = raw.indexOf(MARK);
  if (start === -1) {
    return { body: raw.trim(), fixes: [] };
  }

  const body = raw.slice(0, start).trim();
  const tail = raw.slice(start + MARK.length).replace(END, "");

  const fixes: Fix[] = tail
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-") && line.includes("→"))
    .map((line) => {
      const [left, rest = ""] = line.split("→");
      const [right, note = ""] = rest.split("—");
      return {
        wrong: unquote(left),
        right: unquote(right),
        note: unquote(note),
      };
    })
    .filter((fix) => fix.wrong.length > 0 && fix.right.length > 0)
    .slice(0, 5);

  return { body, fixes };
}
