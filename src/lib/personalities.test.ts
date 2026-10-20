import { describe, expect, it } from "vitest";
import { PERSONALITIES, personality } from "./personalities";

describe("personalities", () => {
  it("has unique ids and readable labels", () => {
    const ids = PERSONALITIES.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const preset of PERSONALITIES) {
      expect(preset.label.trim().length).toBeGreaterThan(0);
      expect(preset.vibe.trim().length).toBeGreaterThan(0);
    }
  });

  it("falls back to the first preset for an unknown id", () => {
    expect(personality("nope").id).toBe(PERSONALITIES[0].id);
    expect(personality("").id).toBe(PERSONALITIES[0].id);
  });

  it("does not carry any look, so eyes stay independent", () => {
    for (const preset of PERSONALITIES) {
      expect(preset).not.toHaveProperty("look");
      expect(preset).not.toHaveProperty("eyeStyle");
      expect(preset).not.toHaveProperty("color");
    }
  });
});
