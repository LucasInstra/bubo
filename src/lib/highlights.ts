export interface Highlight {
  label: string;
  text: string;
}

const BULLET = /^[-*]\s+/;
const HEADING = /^#{1,6}\s+/;

/** The release body is Markdown; the card wants plain, short lines. */
function plain(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pulls the "What's new" bullets out of a release body so the update card can
 * show what actually changed instead of the raw Markdown.
 */
export function releaseHighlights(notes: string, limit = 5): Highlight[] {
  const lines = notes.split(/\r?\n/);
  const heading = lines.findIndex((line) =>
    /^##\s+(what'?s new|novidades|o que mudou)\b/i.test(line.trim()),
  );
  const section = heading === -1 ? lines : lines.slice(heading + 1);
  const bullets: string[] = [];

  for (let index = 0; index < section.length; index += 1) {
    const trimmed = section[index].trim();
    // The section ends at the next heading; without one, keep reading.
    if (heading !== -1 && /^##\s/.test(trimmed)) break;
    if (!BULLET.test(trimmed)) continue;

    let body = trimmed.replace(BULLET, "");
    // Release notes wrap long bullets by hand, so a bullet runs until the next
    // bullet, heading or blank line.
    while (index + 1 < section.length) {
      const following = section[index + 1].trim();
      if (!following || BULLET.test(following) || HEADING.test(following)) break;
      body += ` ${following}`;
      index += 1;
    }

    const text = plain(body);
    if (text) bullets.push(text);
    if (bullets.length >= limit) break;
  }

  if (bullets.length === 0) {
    const paragraph = plain(
      lines
        .filter((line) => line.trim() && !HEADING.test(line.trim()))
        .slice(0, 2)
        .join(" "),
    );
    if (paragraph) {
      bullets.push(paragraph.length > 200 ? `${paragraph.slice(0, 197)}...` : paragraph);
    }
  }

  return bullets.map((text) => {
    // "**Settings tabs**: the screen now..." reads better as label plus text.
    const split = text.match(/^([^:]{2,42}):\s+(.+)$/);
    return split ? { label: split[1].trim(), text: split[2].trim() } : { label: "", text };
  });
}
