import { describe, expect, it } from "vitest";
import {
  isCorrectAnswer,
  isCorrectExerciseAnswer,
  normalizeAnswer,
  noteRevealsAnswer,
} from "./answer";

describe("normalizeAnswer", () => {
  it("lowercases, trims and drops punctuation", () => {
    expect(normalizeAnswer("  It was very good. ")).toBe("it was very good");
    expect(normalizeAnswer("Don’t — stop!")).toBe("don't stop");
  });

  it("collapses whitespace", () => {
    expect(normalizeAnswer("a    b")).toBe("a b");
  });

  it("drops quotation marks but keeps apostrophes inside words", () => {
    expect(normalizeAnswer("use 'I went' instead")).toBe("use i went instead");
    expect(normalizeAnswer("I don't know")).toBe("i don't know");
  });
});

describe("isCorrectAnswer", () => {
  it("accepts the exact fragment regardless of case and punctuation", () => {
    expect(isCorrectAnswer("I went out on Friday.", "i went out on friday")).toBe(true);
  });

  it("accepts a full sentence that contains the fragment", () => {
    expect(isCorrectAnswer("Well, it was very good actually", "it was very good")).toBe(true);
  });

  it("rejects empty answers", () => {
    expect(isCorrectAnswer("   ", "it was very good")).toBe(false);
  });

  it("does not accept unrelated text", () => {
    expect(isCorrectAnswer("she went home", "it was very good")).toBe(false);
  });

  it("requires a meaningful target before using substring matching", () => {
    expect(isCorrectAnswer("anything at all", "I")).toBe(false);
  });

  it("does not accept a fragment inside a longer word", () => {
    expect(isCorrectAnswer("Where do you lives?", "where do you live")).toBe(false);
    expect(isCorrectAnswer("The report is written every weekend", "every week")).toBe(false);
    expect(isCorrectAnswer("She has finished the reports", "the report")).toBe(false);
    expect(isCorrectAnswer("I saw a dog. The dog was bigger", "i saw a dog the dog was big")).toBe(
      false,
    );
  });

  it("does not accept a number inside a longer number", () => {
    expect(isCorrectAnswer("I wake up at 7:30", "i wake up at 7")).toBe(false);
    expect(isCorrectAnswer("I have a meeting at 100", "i have a meeting at 10")).toBe(false);
  });

  it("accepts a longer sentence that contains a single-word target", () => {
    expect(isCorrectAnswer("I need an umbrella.", "an")).toBe(true);
    expect(isCorrectAnswer("The meeting is on Monday.", "on")).toBe(true);
    expect(isCorrectAnswer("If I had more time, I would travel.", "had")).toBe(true);
  });

  it("accepts contract and expanded forms on either side", () => {
    expect(isCorrectAnswer("She's not my boss.", "she is not my boss")).toBe(true);
    expect(isCorrectAnswer("She is not my boss.", "she's not my boss")).toBe(true);
    expect(isCorrectAnswer("She's finished the report.", "she has finished the report")).toBe(true);
    expect(
      isCorrectAnswer("If I had more time I'd travel.", "if i had more time i would travel"),
    ).toBe(true);
    expect(
      isCorrectAnswer("If I had more time I would travel.", "if i had more time i'd travel"),
    ).toBe(true);
    expect(isCorrectAnswer("I've got a meeting at 10.", "i have a meeting at 10")).toBe(true);
    expect(isCorrectAnswer("I have a meeting at 10.", "i've got a meeting at 10")).toBe(true);
  });

  it("accepts the missing-apostrophe spellings", () => {
    expect(isCorrectAnswer("im a developer", "i'm a developer")).toBe(true);
    expect(isCorrectAnswer("i'm a developer", "im a developer")).toBe(true);
    expect(isCorrectAnswer("I dont like it", "I don't like it")).toBe(true);
    expect(isCorrectAnswer("He doesnt work here", "he doesn't work here")).toBe(true);
    expect(isCorrectAnswer("I didnt go", "I didn't go")).toBe(true);
    expect(isCorrectAnswer("She isnt my boss", "she isn't my boss")).toBe(true);
    expect(isCorrectAnswer("Shes tired", "she is tired")).toBe(true);
    expect(isCorrectAnswer("Youre right", "you're right")).toBe(true);
    expect(isCorrectAnswer("Ive finished", "I've finished")).toBe(true);
    expect(isCorrectAnswer("Id travel", "I would travel")).toBe(true);
  });

  it("accepts every listed contraction", () => {
    expect(isCorrectAnswer("You're late", "you are late")).toBe(true);
    expect(isCorrectAnswer("We're ready", "we are ready")).toBe(true);
    expect(isCorrectAnswer("They're here", "they are here")).toBe(true);
    expect(isCorrectAnswer("He's here", "he is here")).toBe(true);
    expect(isCorrectAnswer("It's late", "it is late")).toBe(true);
    expect(isCorrectAnswer("We aren't late", "we are not late")).toBe(true);
    expect(isCorrectAnswer("It wasn't good", "it was not good")).toBe(true);
    expect(isCorrectAnswer("They weren't home", "they were not home")).toBe(true);
    expect(isCorrectAnswer("I don't know", "I do not know")).toBe(true);
    expect(isCorrectAnswer("She doesn't care", "she does not care")).toBe(true);
    expect(isCorrectAnswer("I didn't call", "I did not call")).toBe(true);
    expect(isCorrectAnswer("I can't go", "I cannot go")).toBe(true);
    expect(isCorrectAnswer("I couldn't sleep", "I could not sleep")).toBe(true);
    expect(isCorrectAnswer("I won't tell", "I will not tell")).toBe(true);
    expect(isCorrectAnswer("You wouldn't believe it", "you would not believe it")).toBe(true);
    expect(isCorrectAnswer("He shouldn't smoke", "he should not smoke")).toBe(true);
    expect(isCorrectAnswer("We've eaten", "we have eaten")).toBe(true);
    expect(isCorrectAnswer("You've grown", "you have grown")).toBe(true);
    expect(isCorrectAnswer("They've left", "they have left")).toBe(true);
    expect(isCorrectAnswer("You'd like it", "you would like it")).toBe(true);
    expect(isCorrectAnswer("He'd left", "he had left")).toBe(true);
    expect(isCorrectAnswer("She'd help", "she would help")).toBe(true);
    expect(isCorrectAnswer("We'd go", "we would go")).toBe(true);
    expect(isCorrectAnswer("They'd know", "they had known")).toBe(false);
    expect(isCorrectAnswer("I'll call", "I will call")).toBe(true);
    expect(isCorrectAnswer("You'll see", "you will see")).toBe(true);
    expect(isCorrectAnswer("He'll come", "he will come")).toBe(true);
    expect(isCorrectAnswer("She'll stay", "she will stay")).toBe(true);
    expect(isCorrectAnswer("It'll rain", "it will rain")).toBe(true);
    expect(isCorrectAnswer("We'll wait", "we will wait")).toBe(true);
    expect(isCorrectAnswer("They'll win", "they will win")).toBe(true);
  });

  it("accepts there's, that's, what's and let's expansions", () => {
    expect(isCorrectAnswer("There is a meeting", "there's a meeting")).toBe(true);
    expect(isCorrectAnswer("That is my car", "that's my car")).toBe(true);
    expect(isCorrectAnswer("What is this", "what's this")).toBe(true);
    expect(isCorrectAnswer("Who is there", "who's there")).toBe(true);
    expect(isCorrectAnswer("Where is the station", "where's the station")).toBe(true);
    expect(isCorrectAnswer("Here is your key", "here's your key")).toBe(true);
    expect(isCorrectAnswer("Let us go", "let's go")).toBe(true);
  });
});

describe("isCorrectExerciseAnswer", () => {
  const fillIn = {
    prompt: "Complete: He ___ here. (work)",
    answers: ["works"],
    sentences: ["He works here."],
  };

  it("accepts the fragment and the full sentence", () => {
    expect(isCorrectExerciseAnswer("works", fillIn)).toBe(true);
    expect(isCorrectExerciseAnswer("He works here.", fillIn)).toBe(true);
  });

  it("rejects a full sentence that only contains the fragment", () => {
    expect(isCorrectExerciseAnswer("She works here.", fillIn)).toBe(false);
    expect(isCorrectExerciseAnswer("works here", fillIn)).toBe(false);
  });

  it("matches fragments exactly, including contraction variants", () => {
    const negative = {
      prompt: "Complete no negativo: She ___ my boss.",
      answers: ["isn't", "is not"],
      sentences: ["She isn't my boss.", "She is not my boss."],
    };
    expect(isCorrectExerciseAnswer("isn't", negative)).toBe(true);
    expect(isCorrectExerciseAnswer("is not", negative)).toBe(true);
    expect(isCorrectExerciseAnswer("She is not my boss.", negative)).toBe(true);
    expect(isCorrectExerciseAnswer("She's not my boss.", negative)).toBe(true);
    expect(isCorrectExerciseAnswer("She is my boss.", negative)).toBe(false);
  });

  it("keeps translation exercises lenient", () => {
    const translation = {
      prompt: "Traduza: Eu fui à praia ontem.",
      answers: ["i went to the beach", "yesterday i went to the beach"],
    };
    expect(isCorrectExerciseAnswer("I went to the beach", translation)).toBe(true);
    expect(isCorrectExerciseAnswer("Yesterday I went to the beach.", translation)).toBe(true);
    expect(isCorrectExerciseAnswer("I went to the beach yesterday.", translation)).toBe(true);
    expect(isCorrectExerciseAnswer("I go to the beach", translation)).toBe(false);
  });

  it("accepts contraction variants in a translation", () => {
    const translation = {
      prompt: "Traduza: Eu sou desenvolvedor.",
      answers: ["i am a developer", "i'm a developer"],
    };
    expect(isCorrectExerciseAnswer("I'm a developer.", translation)).toBe(true);
    expect(isCorrectExerciseAnswer("im a developer", translation)).toBe(true);
  });
});

describe("noteRevealsAnswer", () => {
  it("keeps a note that only names the problem", () => {
    expect(noteRevealsAnswer("past simple", "I went to the gym yesterday")).toBe(false);
    expect(noteRevealsAnswer("use an English greeting", "hi")).toBe(false);
  });

  it("drops a note that contains the correction", () => {
    expect(noteRevealsAnswer("use 'I went' instead", "I went")).toBe(true);
    expect(noteRevealsAnswer("HI", "hi")).toBe(true);
  });

  it("drops a note that is only part of the correction", () => {
    expect(noteRevealsAnswer("I went", "I went to the gym yesterday")).toBe(true);
  });

  it("ignores empty notes", () => {
    expect(noteRevealsAnswer("", "hi")).toBe(false);
    expect(noteRevealsAnswer("   ", "hi")).toBe(false);
  });

  it("keeps notes that merely contain a short target word", () => {
    expect(noteRevealsAnswer("artigo: an antes de som de vogal", "an")).toBe(false);
    expect(noteRevealsAnswer("preposição de tempo: on + dia", "on")).toBe(false);
    expect(noteRevealsAnswer("use at + hora", "at")).toBe(false);
    expect(noteRevealsAnswer("in + país", "in")).toBe(false);
    expect(noteRevealsAnswer("Do + sujeito", "do")).toBe(false);
    expect(noteRevealsAnswer("if + passado, would + base", "had")).toBe(false);
  });

  it("still drops a note that is exactly a short target", () => {
    expect(noteRevealsAnswer("an", "an")).toBe(true);
    expect(noteRevealsAnswer("on", "on")).toBe(true);
  });

  it("uses whole words instead of substrings", () => {
    expect(noteRevealsAnswer("homework for tomorrow", "home")).toBe(false);
    expect(noteRevealsAnswer("meetings are useful", "meeting")).toBe(false);
  });

  it("sees through contractions in both the note and the answer", () => {
    expect(noteRevealsAnswer("use I am a developer", "I'm a developer")).toBe(true);
    expect(noteRevealsAnswer("use I'm a developer", "I am a developer")).toBe(true);
    expect(noteRevealsAnswer("I will not go", "I won't go")).toBe(true);
    expect(noteRevealsAnswer("I don't know", "I do not know")).toBe(true);
  });

  it("keeps a short contraction hint that does not spell the answer", () => {
    expect(noteRevealsAnswer("contração: I'm", "I'm going to the gym")).toBe(false);
  });
});
