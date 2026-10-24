import { describe, expect, it } from "vitest";
import { isCorrectAnswer, normalizeAnswer, noteRevealsAnswer } from "./answer";
import {
  displayAnswer,
  focusLabel,
  isBeginnerLevel,
  LESSONS,
  STUDY_FOCUSES,
  type LessonExercise,
} from "./lessons";

const LEVELS = new Set(["A1", "A2", "B1", "B2"]);

function multiWordAnswers(answers: string[]): string[] {
  return answers.map(normalizeAnswer).filter((answer) => answer.split(" ").length > 1);
}

describe("lesson catalog", () => {
  it("has unique ids, valid levels and three complete steps", () => {
    const ids = new Set<string>();
    for (const lesson of LESSONS) {
      expect(ids.has(lesson.id), `${lesson.id} is duplicated`).toBe(false);
      ids.add(lesson.id);
      expect(LEVELS.has(lesson.level), `${lesson.id} has level ${lesson.level}`).toBe(true);
      expect(lesson.steps).toHaveLength(3);
      for (const step of lesson.steps) {
        expect(step.title).toBeTruthy();
        expect(step.body.length).toBeGreaterThan(0);
        expect(step.examples.length).toBeGreaterThan(0);
        expect(step.exercise.prompt).toBeTruthy();
        expect(step.exercise.answers.length).toBeGreaterThan(0);
        expect(step.exercise.hint).toBeTruthy();
        expect(step.exercise.explanation).toBeTruthy();
        expect(step.exercise.note).toBeTruthy();
      }
    }
  });

  it("offers lessons above the beginner levels", () => {
    const levels = new Set(LESSONS.map((lesson) => lesson.level));
    expect(levels.has("B1")).toBe(true);
    expect(levels.has("B2")).toBe(true);
    expect(LESSONS.some((lesson) => !isBeginnerLevel(lesson.level))).toBe(true);
  });

  it("only uses focus ids that the settings know about", () => {
    const focuses = new Set<string>(STUDY_FOCUSES.map(([id]) => id));
    for (const lesson of LESSONS) {
      expect(focuses.has(lesson.focus)).toBe(true);
    }
  });

  it("accepts every canonical answer", () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        for (const answer of step.exercise.answers) {
          expect(isCorrectAnswer(answer, answer), `${lesson.id}: ${answer}`).toBe(true);
        }
      }
    }
  });

  it("accepts the full sentence for fill-in-the-blank exercises", () => {
    const accepts = (typed: string, exercise: LessonExercise) =>
      exercise.answers.some((target) => isCorrectAnswer(typed, target)) ||
      (exercise.sentences ?? []).some((target) => isCorrectAnswer(typed, target));

    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        if (!step.exercise.prompt.includes("___")) continue;
        expect(
          step.exercise.sentences?.length,
          `${lesson.id}: fill-in exercise without full sentences`,
        ).toBeGreaterThan(0);
        for (const sentence of step.exercise.sentences ?? []) {
          expect(accepts(sentence, step.exercise), `${lesson.id}: ${sentence}`).toBe(true);
        }
      }
    }

    const conditionals = LESSONS.find((lesson) => lesson.id === "conditionals");
    const second = conditionals?.steps[1].exercise;
    if (!second) throw new Error("conditionals lesson is missing");
    expect(accepts("if i had more time, i would travel", second)).toBe(true);
    expect(accepts("If I had more time I would travel", second)).toBe(true);
    expect(accepts("had", second)).toBe(true);
    expect(accepts("have", second)).toBe(false);
  });

  it("never hands a full answer over in the body or examples", () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        const answers = multiWordAnswers(step.exercise.answers);
        for (const line of [...step.body, ...step.examples]) {
          const text = normalizeAnswer(line);
          for (const answer of answers) {
            expect(text.includes(answer), `${lesson.id}: "${line}" reveals "${answer}"`).toBe(
              false,
            );
          }
        }
      }
    }
  });

  it("keeps the hints short of the full answer", () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        for (const answer of multiWordAnswers(step.exercise.answers)) {
          expect(
            noteRevealsAnswer(step.exercise.hint, answer),
            `${lesson.id}: hint reveals "${answer}"`,
          ).toBe(false);
        }
      }
    }
  });

  it("fixes the pronoun when showing an answer", () => {
    expect(displayAnswer("i am a developer")).toBe("I am a developer");
    expect(displayAnswer("i'm a developer")).toBe("I'm a developer");
    expect(displayAnswer("isn't")).toBe("isn't");
  });

  it("labels known and unknown focuses", () => {
    expect(focusLabel("to_be")).toBe("To be");
    expect(focusLabel("present_perfect")).toBe("Present perfect");
    expect(focusLabel("conditionals")).toBe("Condicionais");
    expect(focusLabel("passive")).toBe("Voz passiva");
    expect(focusLabel("unknown")).toBe("Livre");
  });
});
