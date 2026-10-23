export const normalizeAnswer = (value: string) =>
  value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:…—–“”«»()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * True when the note already spells out the correction. Such a note still works
 * after the answer, but it cannot be the hint shown before the user types.
 */
export const noteRevealsAnswer = (note: string, target: string) => {
  const hint = normalizeAnswer(note);
  const expected = normalizeAnswer(target);
  if (!hint || !expected) return false;
  return hint.includes(expected) || expected.includes(hint);
};

/** Lenient enough that a full sentence containing the fragment still counts. */
export const isCorrectAnswer = (answer: string, target: string) => {
  const typed = normalizeAnswer(answer);
  const expected = normalizeAnswer(target);
  if (!typed) return false;
  if (typed === expected) return true;
  return expected.length > 3 && typed.includes(expected);
};
