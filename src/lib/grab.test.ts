import { describe, expect, it } from "vitest";
import { clampAnchor, deformOutline, followTarget, GRAB, gripPhysics, pullTarget } from "./grab";

const radius = 100;

describe("grab targets", () => {
  it("softens the local pull near the configured fraction of the radius", () => {
    const pull = pullTarget(500, -500, radius);
    const limit = radius * GRAB.maxPull;
    expect(Math.hypot(pull.x, pull.y)).toBeLessThanOrEqual(limit + 0.001);
    expect(Math.hypot(pull.x, pull.y)).toBeGreaterThan(limit * 0.9);
    expect(pull.x).toBeGreaterThan(0);
    expect(pull.y).toBeLessThan(0);
  });

  it("keeps the whole-body follow tiny and capped", () => {
    const follow = followTarget(500, 500, radius);
    expect(Math.hypot(follow.x, follow.y)).toBeLessThanOrEqual(radius * GRAB.maxFollow);
    expect(Math.abs(follow.x)).toBeLessThan(radius * 0.1);
  });

  it("clamps a corner grab back onto the body", () => {
    const anchor = clampAnchor(radius * 4, 0, radius);
    expect(anchor.x).toBeCloseTo(radius * GRAB.maxAnchor);
    expect(anchor.y).toBe(0);

    expect(clampAnchor(0, 0, radius)).toEqual({ x: 0, y: 0 });
  });
});

describe("deformOutline", () => {
  const anchor = { x: -radius * 0.7, y: 0 };
  const nearby = [
    { x: anchor.x, y: anchor.y },
    { x: 0, y: 0 },
    { x: radius, y: 0 },
    { x: anchor.x, y: radius },
  ];

  it("returns the same outline when there is no pull", () => {
    expect(deformOutline(nearby, anchor.x, anchor.y, 0, 0, radius)).toBe(nearby);
  });

  it("moves the grabbed point exactly by the pull", () => {
    const moved = deformOutline(nearby, anchor.x, anchor.y, 12, -4, radius);
    expect(moved[0].x).toBeCloseTo(anchor.x + 12);
    expect(moved[0].y).toBeCloseTo(-4);
  });

  it("leaves the far side almost untouched", () => {
    const moved = deformOutline(nearby, anchor.x, anchor.y, 12, -4, radius);
    expect(moved[2].x).toBeGreaterThan(radius - 0.5);
    expect(moved[2].x).toBeLessThan(radius + 0.5);
    expect(Math.abs(moved[2].y)).toBeLessThan(0.5);
  });

  it("dents inward when the pointer pushes into the body", () => {
    const moved = deformOutline(nearby, anchor.x, anchor.y, radius * 0.2, 0, radius);
    expect(moved[0].x).toBeCloseTo(anchor.x + radius * 0.2, 1);
    expect(moved[0].x).toBeGreaterThan(anchor.x);
  });

  it("spreads the falloff on bigger pulls instead of spiking", () => {
    const small = deformOutline(nearby, anchor.x, anchor.y, -radius * 0.1, 0, radius);
    const large = deformOutline(nearby, anchor.x, anchor.y, -radius * GRAB.maxPull, 0, radius);
    const smallWeight = Math.abs(small[1].x) / (radius * 0.1);
    const largeWeight = Math.abs(large[1].x) / (radius * GRAB.maxPull);
    expect(largeWeight).toBeGreaterThan(smallWeight);
    expect(large.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  });
});

describe("gripPhysics", () => {
  it("does nothing without a pull", () => {
    const grip = gripPhysics(0, -radius * 0.5, 0, 0, radius);
    expect(grip.scaleAlong).toBe(1);
    expect(grip.scaleCross).toBe(1);
    expect(grip.strength).toBe(0);
  });

  it("stretches along the axis when pulled outward", () => {
    const grip = gripPhysics(-radius * 0.7, 0, -radius * GRAB.maxPull, 0, radius);
    expect(grip.axis).toBeCloseTo(Math.PI);
    expect(grip.scaleAlong).toBeGreaterThan(1);
    expect(grip.scaleCross).toBeLessThan(1);
  });

  it("squashes along the axis when pushed inward", () => {
    const grip = gripPhysics(-radius * 0.7, 0, radius * GRAB.maxPull, 0, radius);
    expect(grip.scaleAlong).toBeLessThan(1);
    expect(grip.scaleCross).toBeGreaterThan(1);
  });
});
