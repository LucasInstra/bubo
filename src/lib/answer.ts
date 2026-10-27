export const normalizeAnswer = (value: string) =>
  value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:…—–“”«»()[\]{}]/g, "")
    // Quotation marks are punctuation; the apostrophe inside a word is not.
    .replace(/(^|\s)'/g, "$1")
    .replace(/'(\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/** Words are the unit of comparison: a fragment never matches inside another word. */
export const answerTokens = (value: string) => {
  const normalized = normalizeAnswer(value);
  return normalized ? normalized.split(" ") : [];
};

interface Rewrite {
  from: string[];
  to: string[][];
}

const rewrite = (from: string, ...to: string[]): Rewrite => ({
  from: from.split(" "),
  to: to.map((variant) => variant.split(" ")),
});

/**
 * Every rewrite goes from a contracted or sloppy form to its full form, so
 * expanding both sides joins the two spellings on common ground. `'s`, `'d`
 * and the missing-apostrophe forms are ambiguous, hence more than one output.
 */
const REWRITES: Rewrite[] = [
  rewrite("i'm", "i am"),
  rewrite("you're", "you are"),
  rewrite("he's", "he is", "he has"),
  rewrite("she's", "she is", "she has"),
  rewrite("it's", "it is", "it has"),
  rewrite("there's", "there is", "there has"),
  rewrite("that's", "that is", "that has"),
  rewrite("what's", "what is", "what has"),
  rewrite("who's", "who is", "who has"),
  rewrite("where's", "where is"),
  rewrite("when's", "when is"),
  rewrite("why's", "why is"),
  rewrite("how's", "how is"),
  rewrite("here's", "here is"),
  rewrite("let's", "let us"),
  rewrite("we're", "we are"),
  rewrite("they're", "they are"),
  rewrite("isn't", "is not"),
  rewrite("aren't", "are not"),
  rewrite("wasn't", "was not"),
  rewrite("weren't", "were not"),
  rewrite("don't", "do not"),
  rewrite("doesn't", "does not"),
  rewrite("didn't", "did not"),
  rewrite("can't", "cannot", "can not"),
  rewrite("cannot", "can not"),
  rewrite("couldn't", "could not"),
  rewrite("won't", "will not"),
  rewrite("wouldn't", "would not"),
  rewrite("shouldn't", "should not"),
  rewrite("i've", "i have"),
  rewrite("you've", "you have"),
  rewrite("we've", "we have"),
  rewrite("they've", "they have"),
  rewrite("i'd", "i would", "i had"),
  rewrite("you'd", "you would", "you had"),
  rewrite("he'd", "he would", "he had"),
  rewrite("she'd", "she would", "she had"),
  rewrite("we'd", "we would", "we had"),
  rewrite("they'd", "they would", "they had"),
  rewrite("i'll", "i will"),
  rewrite("you'll", "you will"),
  rewrite("he'll", "he will"),
  rewrite("she'll", "she will"),
  rewrite("it'll", "it will"),
  rewrite("we'll", "we will"),
  rewrite("they'll", "they will"),
  rewrite("im", "i am"),
  rewrite("youre", "you are"),
  rewrite("theyre", "they are"),
  rewrite("shes", "she is", "she has"),
  rewrite("theres", "there is", "there has"),
  rewrite("thats", "that is", "that has"),
  rewrite("whats", "what is", "what has"),
  rewrite("whos", "who is", "who has"),
  rewrite("wheres", "where is"),
  rewrite("heres", "here is"),
  rewrite("dont", "do not"),
  rewrite("doesnt", "does not"),
  rewrite("didnt", "did not"),
  rewrite("isnt", "is not"),
  rewrite("arent", "are not"),
  rewrite("wasnt", "was not"),
  rewrite("werent", "were not"),
  rewrite("cant", "cannot", "can not"),
  rewrite("couldnt", "could not"),
  rewrite("wont", "will not"),
  rewrite("wouldnt", "would not"),
  rewrite("shouldnt", "should not"),
  rewrite("ive", "i have"),
  rewrite("youve", "you have"),
  rewrite("weve", "we have"),
  rewrite("theyve", "they have"),
  rewrite("id", "i would", "i had"),
  rewrite("have got", "have"),
  rewrite("has got", "has"),
];

/** All spellings of the same token sequence, including the original one. */
const variantsOf = (tokens: string[]) => {
  const pending = [tokens];
  const variants = new Map<string, string[]>();

  while (pending.length > 0) {
    const current = pending.pop() as string[];
    const key = current.join(" ");
    if (variants.has(key)) continue;
    variants.set(key, current);

    for (let index = 0; index < current.length; index += 1) {
      for (const rule of REWRITES) {
        if (index + rule.from.length > current.length) continue;
        const matches = rule.from.every((token, offset) => current[index + offset] === token);
        if (!matches) continue;
        for (const replacement of rule.to) {
          const next = [
            ...current.slice(0, index),
            ...replacement,
            ...current.slice(index + rule.from.length),
          ];
          if (!variants.has(next.join(" "))) pending.push(next);
        }
      }
    }
  }

  return [...variants.values()];
};

/** True when `needle` shows up as a whole, contiguous run inside `tokens`. */
const containsSequence = (tokens: string[], needle: string[]) => {
  if (needle.length === 0 || needle.length > tokens.length) return false;
  for (let start = 0; start <= tokens.length - needle.length; start += 1) {
    const matches = needle.every((token, offset) => tokens[start + offset] === token);
    if (matches) return true;
  }
  return false;
};

const matchesExactly = (answer: string, target: string) => {
  const typed = variantsOf(answerTokens(answer));
  const expected = variantsOf(answerTokens(target));
  return expected.some((targetSequence) =>
    typed.some(
      (answerSequence) =>
        answerSequence.length === targetSequence.length &&
        containsSequence(answerSequence, targetSequence),
    ),
  );
};

/** Targets shorter than this are too common to count as a reveal on their own. */
const MIN_REVEAL_LENGTH = 4;

/**
 * True when the note already spells out the correction. Such a note still works
 * after the answer, but it cannot be the hint shown before the user types.
 * Short targets such as `an` or `on` only reveal the answer when the note is
 * exactly that target: seeing them inside a longer note says nothing.
 */
export const noteRevealsAnswer = (note: string, target: string) => {
  const hint = normalizeAnswer(note);
  const expected = normalizeAnswer(target);
  if (!hint || !expected) return false;
  if (hint === expected) return true;

  const hintTokens = answerTokens(hint);
  const expectedTokens = answerTokens(expected);
  const shortTarget = expectedTokens.length === 1 && expected.length < MIN_REVEAL_LENGTH;
  if (shortTarget) return false;

  return (
    containsSequence(hintTokens, expectedTokens) || containsSequence(expectedTokens, hintTokens)
  );
};

/**
 * Lenient enough that a full sentence containing the fragment still counts.
 * The fragment has to appear as whole words, so `lives` does not answer
 * `live` and `weekend` does not answer `week`.
 */
export const isCorrectAnswer = (answer: string, target: string) => {
  const typedTokens = answerTokens(answer);
  const expectedTokens = answerTokens(target);
  if (typedTokens.length === 0 || expectedTokens.length === 0) return false;
  const typed = variantsOf(typedTokens);
  const expected = variantsOf(expectedTokens);
  return expected.some((targetSequence) =>
    typed.some((answerSequence) => containsSequence(answerSequence, targetSequence)),
  );
};

interface ExerciseAnswers {
  prompt: string;
  answers: string[];
  sentences?: string[];
}

/**
 * Lessons accept a full sentence for a blank, but a blank answer is a fragment:
 * `She works here.` must not pass the single-word `works` exercise, so fragments
 * only match the whole typed answer. Translation exercises carry full sentences
 * in `answers`, and keep the lenient sentence matching.
 */
export const isCorrectExerciseAnswer = (typed: string, exercise: ExerciseAnswers) => {
  if ((exercise.sentences ?? []).some((sentence) => isCorrectAnswer(typed, sentence))) {
    return true;
  }
  const expectsFragment = exercise.prompt.includes("___") || (exercise.sentences?.length ?? 0) > 0;
  return exercise.answers.some((answer) =>
    expectsFragment ? matchesExactly(typed, answer) : isCorrectAnswer(typed, answer),
  );
};
