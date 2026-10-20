export const normalizeAnswer = (value: string) =>
  value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:…—–“”«»()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Lenient enough that a full sentence containing the fragment still counts. */
export const isCorrectAnswer = (answer: string, target: string) => {
  const typed = normalizeAnswer(answer);
  const expected = normalizeAnswer(target);
  if (!typed) return false;
  if (typed === expected) return true;
  return expected.length > 3 && typed.includes(expected);
};
