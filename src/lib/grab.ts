/** A point in the mascot's local canvas coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** Tunable constants for the grab feel. All sizes are fractions of the body radius. */
export const GRAB = {
  /** Furthest the grab anchor can sit from the center. */
  maxAnchor: 0.86,
  /** Local displacement cap. The cheek stretches this far, then the falloff spreads. */
  maxPull: 0.45,
  /** How much of the raw pointer delta translates the whole body. */
  follow: 0.1,
  /** Hard cap for that translation. */
  maxFollow: 0.13,
  /** Gaussian falloff at rest, as a fraction of the radius. */
  falloffNear: 0.34,
  /** Gaussian falloff at full pull. Bigger pulls spread the deformation instead of spiking. */
  falloffFar: 0.58,
  /** Global stretch along the pull axis at full pull. */
  stretch: 0.04,
  /** Cross-axis squash relative to the stretch, for volume. */
  squash: 0.35,
  /** Anchor distance where the center-grab bias fades out, as a fraction of the radius. */
  centerRadius: 0.45,
  /** Whole-body follow factor for a grab at the center. */
  centerFollow: 0.75,
  /** Follow cap for a grab at the center. */
  centerMaxFollow: 0.8,
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

/** Local displacement target for a pointer delta, capped softly to keep the body planted. */
export function pullTarget(dx: number, dy: number, radius: number): Point {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 0, y: 0 };
  const limit = safeRadius(radius) * GRAB.maxPull;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: 0, y: 0 };
  // Soft limit: the cheek keeps giving a little instead of stopping dead.
  const mapped = limit * Math.tanh(distance / limit);
  const scale = mapped / distance;
  return { x: dx * scale, y: dy * scale };
}

/** Tiny whole-body translation target, so the grab reads as contact, not sliding. */
export function followTarget(dx: number, dy: number, radius: number, center = 0): Point {
  const safe = safeRadius(radius);
  const factor = GRAB.follow + (GRAB.centerFollow - GRAB.follow) * center;
  const limit = safe * (GRAB.maxFollow + (GRAB.centerMaxFollow - GRAB.maxFollow) * center);
  return clampVector(dx * factor, dy * factor, limit);
}

/**
 * 1 for a grab right at the center, 0 once the anchor reaches `centerRadius`.
 * A center grab has no cheek to pinch, so it should move the whole body more;
 * edge grabs keep the local silicone behavior.
 */
export function centerBias(anchorX: number, anchorY: number, radius: number): number {
  const distance = Math.hypot(anchorX, anchorY);
  if (!Number.isFinite(distance)) return 0;
  return clamp(1 - distance / (safeRadius(radius) * GRAB.centerRadius), 0, 1);
}

/** Clamps a grab point to the body, preserving its direction. */
export function clampAnchor(x: number, y: number, radius: number): Point {
  return clampVector(x, y, safeRadius(radius) * GRAB.maxAnchor);
}

/** Centroid of a sampled outline, used to keep the face anchored to the body. */
export function outlineCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
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
