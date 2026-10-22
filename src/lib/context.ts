import type { Msg } from "./types";

export interface TrimmedContext {
  messages: Msg[];
  trimmed: boolean;
}

/**
 * Keeps the most recent messages that fit a rough character budget. The model
 * never reports exact tokens, so the budget is deliberately conservative.
 */
export function trimContext(messages: Msg[], maxChars = 24_000, maxMessages = 20): TrimmedContext {
  const usable = messages.filter((message) => !message.error);
  const selected: Msg[] = [];
  let characters = 0;

  for (let index = usable.length - 1; index >= 0; index -= 1) {
    if (selected.length >= maxMessages) break;
    const message = usable[index];
    const cost = message.content.length + 16;
    if (selected.length > 0 && characters + cost > maxChars) break;
    selected.push(message);
    characters += cost;
  }

  selected.reverse();
  return { messages: selected, trimmed: selected.length < usable.length };
}
