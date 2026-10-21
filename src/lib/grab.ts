/** Soft-body deformation produced by grabbing a point of the mascot. */
export interface GripDeformation {
  /** Radians, radial direction of the grabbed point (fallback: drag direction). */
  axis: number;
  /** Scale along the grip axis; above 1 stretches, below 1 squashes. */
  scaleAlong: number;
  /** Scale perpendicular to the grip axis. */
  scaleCross: number;
  /** Translation applied to the whole body, in canvas units. */
  followX: number;
  followY: number;
  /** 0..1, lets the caller skip tiny pulls. */
  strength: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Turns a pointer pull on a point of the body into a deformation pivoted on
 * that point. Pulling a cheek away from the center stretches that side along
 * the radial axis; pushing it back in squashes it. The anchor is a fixed point
 * of the scale, so the follow offset is what makes the grabbed spot track the
 * cursor (rather than overshooting it as a center-anchored scale would).
 */
export function gripDeformation(
  anchorX: number,
  anchorY: number,
  dx: number,
  dy: number,
  radius: number,
): GripDeformation {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;
  const anchorDistance = Math.hypot(anchorX, anchorY);
  const dragDistance = Math.hypot(dx, dy);

  // right at the center there is no radial direction to grab, so the pull wins
  const axis =
    anchorDistance > safeRadius * 0.05
      ? Math.atan2(anchorY, anchorX)
      : dragDistance > 0
        ? Math.atan2(dy, dx)
        : 0;
  const cos = Math.cos(axis);
  const sin = Math.sin(axis);

  // along the axis: positive is away from the body, negative is inward
  const along = clamp((cos * dx + sin * dy) / safeRadius, -1, 1);
  const cross = clamp((-sin * dx + cos * dy) / safeRadius, -1, 1);

  // inward pushes squash a little softer than outward pulls stretch
  const scaleAlong = clamp(along > 0 ? 1 + along * 0.28 : 1 + along * 0.24, 0.68, 1.3);
  const scaleCross = clamp(1 - along * 0.12 + Math.abs(cross) * 0.08, 0.85, 1.18);

  // Pulling outward drags the whole blob with the cursor. Pushing inward should
  // read as pressing the cheek into the body, so the body stays put and the
  // local squash does the work. The blend keeps sideways pulls tracking fully.
  const followFactor = 0.9 - Math.max(0, -along) * 0.55;

  return {
    axis,
    scaleAlong,
    scaleCross,
    followX: Number.isFinite(dx) ? dx * followFactor : 0,
    followY: Number.isFinite(dy) ? dy * followFactor : 0,
    strength: clamp(dragDistance / (safeRadius * 0.18), 0, 1),
  };
}
