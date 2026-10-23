import { describe, expect, it } from "vitest";
import { isCorrectAnswer } from "./answer";
import { focusLabel, isBeginnerLevel, LESSONS, STUDY_FOCUSES } from "./lessons";

describe("lesson catalog", () => {
  it("has unique ids and three complete steps", () => {
    const ids = new Set<string>();
    for (const lesson of LESSONS) {
      expect(ids.has(lesson.id), `${lesson.id} is duplicated`).toBe(false);
      ids.add(lesson.id);
      expect(isBeginnerLevel(lesson.level), `${lesson.id} is not beginner`).toBe(true);
      expect(lesson.steps).toHaveLength(3);
      for (const step of lesson.steps) {
        expect(step.title).toBeTruthy();
        expect(step.body.length).toBeGreaterThan(0);
        expect(step.examples.length).toBeGreaterThan(0);
        expect(step.exercise.prompt).toBeTruthy();
        expect(step.exercise.answers.length).toBeGreaterThan(0);
        expect(step.exercise.note).toBeTruthy();
      }
    }
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

  it("labels known and unknown focuses", () => {
    expect(focusLabel("to_be")).toBe("To be");
    expect(focusLabel("past_simple")).toBe("Passado");
    expect(focusLabel("unknown")).toBe("Livre");
  });
});
