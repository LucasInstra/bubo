import { describe, expect, it } from "vitest";
import {
  EYE_SIZES,
  EYE_SPACINGS,
  EYE_STYLES,
  EYE_TILTS,
  MASCOT_SHAPES,
} from "../components/Mascot";
import { PERSONALITIES, personality, personalityPatch } from "./personalities";

describe("personalities", () => {
  it("has unique ids and looks made of real options", () => {
    const ids = PERSONALITIES.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const preset of PERSONALITIES) {
      expect(MASCOT_SHAPES).toContain(preset.look.shape);
      expect(EYE_STYLES).toContain(preset.look.eyeStyle);
      expect(EYE_SIZES).toContain(preset.look.eyeSize);
      expect(EYE_SPACINGS).toContain(preset.look.eyeSpacing);
      expect(EYE_TILTS).toContain(preset.look.eyeTilt);
    }
  });

  it("falls back to the first preset for an unknown id", () => {
    expect(personality("nope").id).toBe(PERSONALITIES[0].id);
  });

  it("carries both the id and the look when applying a preset", () => {
    const patch = personalityPatch("dry_wit");
    expect(patch.personality).toBe("dry_wit");
    expect(patch.eyeStyle).toBe("sleepy");
    expect(patch.shape).toBe("square");
  });
});
