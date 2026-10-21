import { describe, expect, it } from "vitest";
import { gripDeformation } from "./grab";

const radius = 100;

describe("gripDeformation", () => {
  it("does nothing with a zero pull", () => {
    const grip = gripDeformation(50, -20, 0, 0, radius);
    expect(grip.followX).toBe(0);
    expect(grip.followY).toBe(0);
    expect(grip.scaleAlong).toBe(1);
    expect(grip.scaleCross).toBe(1);
    expect(grip.strength).toBe(0);
  });

  it("stretches the grabbed cheek when pulled further left", () => {
    const grip = gripDeformation(-radius * 0.7, 0, -radius * 0.3, 0, radius);
    expect(grip.axis).toBeCloseTo(Math.PI);
    expect(grip.scaleAlong).toBeGreaterThan(1);
    expect(grip.scaleCross).toBeLessThan(1);
    expect(grip.strength).toBe(1);
    expect(grip.followX).toBeCloseTo(-radius * 0.3 * 0.9);
  });

  it("squashes the grabbed side when pushed inward", () => {
    const grip = gripDeformation(-radius * 0.7, 0, radius * 0.3, 0, radius);
    expect(grip.axis).toBeCloseTo(Math.PI);
    expect(grip.scaleAlong).toBeLessThan(1);
    expect(grip.scaleCross).toBeGreaterThan(1);
    // pressing in should compress the cheek instead of sliding the blob along
    const outward = gripDeformation(-radius * 0.7, 0, -radius * 0.3, 0, radius);
    expect(Math.abs(grip.followX)).toBeLessThan(Math.abs(outward.followX));
  });

  it("stays finite for a near-center vertical pull", () => {
    const grip = gripDeformation(0, 0, 0, radius * 0.4, radius);
    for (const value of Object.values(grip)) expect(Number.isFinite(value)).toBe(true);
    expect(grip.axis).toBeCloseTo(Math.PI / 2);
    expect(grip.scaleAlong).toBeGreaterThan(1);
    expect(grip.scaleCross).toBeLessThan(1);
  });

  it("falls back to the drag direction when the anchor is centered", () => {
    const grip = gripDeformation(0, 0, radius * 0.3, 0, radius);
    expect(grip.axis).toBeCloseTo(0);
    expect(grip.scaleAlong).toBeGreaterThan(1);
  });

  it("clamps extreme pulls and sideways drags", () => {
    const grip = gripDeformation(-radius * 0.7, 0, radius * 5, radius * 5, radius);
    expect(grip.scaleAlong).toBeGreaterThanOrEqual(0.68);
    expect(grip.scaleAlong).toBeLessThanOrEqual(1.3);
    expect(grip.scaleCross).toBeGreaterThanOrEqual(0.85);
    expect(grip.scaleCross).toBeLessThanOrEqual(1.18);
    expect(grip.strength).toBe(1);
  });
});
