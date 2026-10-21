import { describe, expect, it } from "vitest";
import {
  EYE_SIZES,
  EYE_SPACINGS,
  EYE_STYLES,
  EYE_TILTS,
  MASCOT_SHAPES,
} from "../components/Mascot";
import {
  MOUTH_COLORS,
  MOUTH_SIZES,
  MOUTH_STYLES,
  PERSONALITIES,
  personality,
} from "./personalities";

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

  it("only uses real options in each preview", () => {
    for (const preset of PERSONALITIES) {
      expect(MASCOT_SHAPES).toContain(preset.preview.shape);
      expect(EYE_STYLES).toContain(preset.preview.eyeStyle);
      expect(EYE_SIZES).toContain(preset.preview.eyeSize);
      expect(EYE_SPACINGS).toContain(preset.preview.eyeSpacing);
      expect(EYE_TILTS).toContain(preset.preview.eyeTilt);
      expect(preset.preview.showMouth).toBe(true);
      expect(MOUTH_STYLES).toContain(preset.preview.mouthStyle);
      expect(MOUTH_SIZES).toContain(preset.preview.mouthSize);
      const color = preset.preview.mouthColor;
      const knownColor = (MOUTH_COLORS as readonly string[]).includes(color);
      expect(knownColor || /^#[0-9a-f]{6}$/i.test(color)).toBe(true);
    }
  });

  it("gives the presets visibly different mouths", () => {
    const mouths = PERSONALITIES.map(
      (preset) =>
        `${preset.preview.mouthStyle}:${preset.preview.mouthSize}:${preset.preview.mouthColor}`,
    );
    expect(new Set(mouths).size).toBeGreaterThan(1);

    const styles = new Set(PERSONALITIES.map((preset) => preset.preview.mouthStyle));
    expect(styles.size).toBeGreaterThanOrEqual(4);
  });

  it("keeps the preview out of the saved shape", () => {
    for (const preset of PERSONALITIES) {
      expect(preset).not.toHaveProperty("look");
      expect(preset).not.toHaveProperty("color");
    }
  });
});
