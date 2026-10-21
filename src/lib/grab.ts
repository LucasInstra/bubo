/** A point in the mascot's local canvas coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** Tunable constants for the grab feel. All sizes are fractions of the body radius. */
export const GRAB = {
  /** Furthest the grab anchor can sit from the center. */
  maxAnchor: 0.8,
  /** Local displacement cap. The cheek stretches this far, then the falloff spreads. */
  maxPull: 0.3,
  /** How much of the raw pointer delta translates the whole body. */
  follow: 0.06,
  /** Hard cap for that translation. */
  maxFollow: 0.08,
  /** Gaussian falloff at rest, as a fraction of the radius. */
  falloffNear: 0.3,
  /** Gaussian falloff at full pull. Bigger pulls spread the deformation instead of spiking. */
  falloffFar: 0.44,
  /** Global stretch along the pull axis at full pull. */
  stretch: 0.03,
  /** Cross-axis squash relative to the stretch, for volume. */
  squash: 0.4,
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const safeRadius = (radius: number) => (Number.isFinite(radius) && radius > 0 ? radius : 1);

/** Clamps a vector to a maximum length, preserving its direction. */
function clampVector(x: number, y: number, limit: number): Point {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const distance = Math.hypot(x, y);
  const scale = distance > limit ? limit / distance : 1;
  return { x: x * scale, y: y * scale };
}

/** Local displacement target for a pointer delta, capped to keep the body planted. */
export function pullTarget(dx: number, dy: number, radius: number): Point {
  return clampVector(dx, dy, safeRadius(radius) * GRAB.maxPull);
}

/** Tiny whole-body translation target, so the grab reads as contact, not sliding. */
export function followTarget(dx: number, dy: number, radius: number): Point {
  return clampVector(dx * GRAB.follow, dy * GRAB.follow, safeRadius(radius) * GRAB.maxFollow);
}

/** Clamps a grab point to the body, preserving its direction. */
export function clampAnchor(x: number, y: number, radius: number): Point {
  return clampVector(x, y, safeRadius(radius) * GRAB.maxAnchor);
}

/**
 * Deforms the sampled body outline with a Gaussian falloff around the grabbed
 * point. The anchor moves exactly by the pull, points near it follow most of
 * the way, and the far side barely moves. A wider falloff at bigger pulls keeps
 * the silhouette from spiking when the pointer keeps going.
 */
export function deformOutline(
  points: Point[],
  anchorX: number,
  anchorY: number,
  pullX: number,
  pullY: number,
  radius: number,
): Point[] {
  const amount = Math.hypot(pullX, pullY);
  if (!Number.isFinite(amount) || amount < 0.01) return points;

  const safe = safeRadius(radius);
  const ratio = clamp(amount / (safe * GRAB.maxPull), 0, 1);
  const sigma = safe * (GRAB.falloffNear + (GRAB.falloffFar - GRAB.falloffNear) * ratio);
  const denominator = 2 * sigma * sigma;

  return points.map((point) => {
    const dx = point.x - anchorX;
    const dy = point.y - anchorY;
    const weight = Math.exp(-(dx * dx + dy * dy) / denominator);
    return {
      x: point.x + pullX * weight,
      y: point.y + pullY * weight,
    };
  });
}

export interface GripPhysics {
  /** Radial direction of the grab. */
  axis: number;
  /** Scale along the pull axis. */
  scaleAlong: number;
  /** Scale across the pull axis. */
  scaleCross: number;
  /** 0..1, lets the caller skip the affine when there is no real pull. */
  strength: number;
}

/**
 * Small affine cohesion on top of the local outline deformation. This is what
 * keeps the body reading as one piece while the grabbed area does most of the
 * work, without the old whole-body stretch.
 */
export function gripPhysics(
  anchorX: number,
  anchorY: number,
  pullX: number,
  pullY: number,
  radius: number,
): GripPhysics {
  const safe = safeRadius(radius);
  const amount = Math.hypot(pullX, pullY);
  const anchorDistance = Math.hypot(anchorX, anchorY);
  const axis =
    anchorDistance > safe * 0.05
      ? Math.atan2(anchorY, anchorX)
      : amount > 0
        ? Math.atan2(pullY, pullX)
        : 0;

  const along = (Math.cos(axis) * pullX + Math.sin(axis) * pullY) / safe;
  const ratio = clamp(along / GRAB.maxPull, -1, 1);
  const stretch = ratio * GRAB.stretch;

  return {
    axis,
    scaleAlong: 1 + stretch,
    scaleCross: 1 - stretch * GRAB.squash,
    strength: clamp(amount / (safe * 0.12), 0, 1),
  };
}
