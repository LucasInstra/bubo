import { useEffect, useRef } from "react";
import type { Mood, OrbState } from "../lib/types";

export const MASCOT_SHAPES = [
  "round",
  "oval",
  "square",
  "pill",
  "triangle",
  "hexagon",
  "cloud",
  "drop",
  "blob",
  "egg",
  "diamond",
  "star",
] as const;

export type MascotShape = (typeof MASCOT_SHAPES)[number];

export const MASCOT_COLORS = [
  "#a9714b",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const;

export const EYE_STYLES = [
  "bars",
  "dots",
  "arcs",
  "sleepy",
  "sparkle",
  "heart",
  "ring",
  "wink",
  "angry",
] as const;
export const EYE_SIZES = ["small", "medium", "large"] as const;
export const EYE_SPACINGS = ["close", "normal", "wide"] as const;
export const EYE_TILTS = ["soft", "straight", "sharp"] as const;
export const EYE_COLORS = ["auto", "#fcfcff", "#fff4d6", "#241d33"] as const;

export const SHAPE_LABELS: Record<MascotShape, string> = {
  round: "round",
  oval: "oval",
  square: "square",
  pill: "pill",
  triangle: "triangle",
  hexagon: "hexagon",
  cloud: "cloud",
  drop: "drop",
  blob: "blob",
  egg: "egg",
  diamond: "diamond",
  star: "star",
};

const TAU = Math.PI * 2;

/** Mixes a hex color towards black, keeping the flat look of the body. */
function shade(hex: string, factor: number, alpha: number): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return `rgba(20, 16, 32, ${alpha})`;
  const red = Math.round(Number.parseInt(value.slice(0, 2), 16) * factor);
  const green = Math.round(Number.parseInt(value.slice(2, 4), 16) * factor);
  const blue = Math.round(Number.parseInt(value.slice(4, 6), 16) * factor);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** Perceived brightness, used to pick a readable eye color automatically. */
function brightness(hex: string): number {
  const value = hex.replace("#", "");
  if (value.length !== 6) return 0.5;
  const linear = (slice: string) => {
    const channel = Number.parseInt(slice, 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linear(value.slice(0, 2)) +
    0.7152 * linear(value.slice(2, 4)) +
    0.0722 * linear(value.slice(4, 6))
  );
}

function sparklePath(context: CanvasRenderingContext2D, width: number, height: number) {
  const outerX = width / 2;
  const outerY = height / 2;
  const innerX = outerX * 0.26;
  const innerY = outerY * 0.26;
  context.beginPath();
  context.moveTo(0, -outerY);
  context.quadraticCurveTo(innerX, -innerY, outerX, 0);
  context.quadraticCurveTo(innerX, innerY, 0, outerY);
  context.quadraticCurveTo(-innerX, innerY, -outerX, 0);
  context.quadraticCurveTo(-innerX, -innerY, 0, -outerY);
  context.closePath();
}

function heartPath(context: CanvasRenderingContext2D, width: number, height: number) {
  context.beginPath();
  context.moveTo(0, height * 0.38);
  context.bezierCurveTo(
    -width * 0.6,
    -height * 0.08,
    -width * 0.52,
    -height * 0.5,
    -width * 0.2,
    -height * 0.5,
  );
  context.bezierCurveTo(
    -width * 0.06,
    -height * 0.5,
    0,
    -height * 0.34,
    0,
    -height * 0.18,
  );
  context.bezierCurveTo(
    0,
    -height * 0.34,
    width * 0.06,
    -height * 0.5,
    width * 0.2,
    -height * 0.5,
  );
  context.bezierCurveTo(
    width * 0.52,
    -height * 0.5,
    width * 0.6,
    -height * 0.08,
    0,
    height * 0.38,
  );
  context.closePath();
}

/** Width and height of a single eye, in canvas units. */
function eyeShape(style: string, radius: number, scale: number) {
  switch (style) {
    case "dots": {
      const width = radius * 0.3 * scale;
      return { width, height: width };
    }
    case "sleepy":
      return { width: radius * 0.34 * scale, height: radius * 0.13 * scale };
    case "sparkle":
      return { width: radius * 0.46 * scale, height: radius * 0.58 * scale };
    case "heart":
      return { width: radius * 0.48 * scale, height: radius * 0.46 * scale };
    case "ring": {
      const width = radius * 0.4 * scale;
      return { width, height: width };
    }
    case "angry":
      return { width: radius * 0.24 * scale, height: radius * 0.46 * scale };
    default:
      return { width: radius * 0.225 * scale, height: radius * 0.52 * scale };
  }
}

interface MascotProps {
  state: OrbState;
  mood?: Mood;
  color?: string;
  shape?: string;
  energy?: number;
  size?: number;
  boopable?: boolean;
  showMouth?: boolean;
  mouthStyle?: string;
  mouthSize?: string;
  eyeStyle?: string;
  eyeSize?: string;
  eyeSpacing?: string;
  eyeTilt?: string;
  eyeColor?: string;
  animate?: boolean;
  canvasPadding?: number;
}

function superellipse(path: Path2D, radius: number, power: number) {
  const steps = 72;
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * TAU;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = radius * Math.sign(cos) * Math.abs(cos) ** (2 / power);
    const y = radius * Math.sign(sin) * Math.abs(sin) ** (2 / power);
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
}

function roundedPolygon(path: Path2D, points: number[][], corner: number) {
  const count = points.length;
  const at = (index: number) => points[(index + count) % count];
  const distance = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const towards = (from: number[], to: number[], amount: number) => {
    const length = distance(from, to) || 1;
    const ratio = Math.min(0.45, amount / length);
    return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
  };

  for (let index = 0; index < count; index += 1) {
    const previous = at(index - 1);
    const current = at(index);
    const next = at(index + 1);
    const start = towards(current, previous, corner);
    const end = towards(current, next, corner);
    if (index === 0) path.moveTo(start[0], start[1]);
    else path.lineTo(start[0], start[1]);
    path.quadraticCurveTo(current[0], current[1], end[0], end[1]);
  }
  path.closePath();
}

function bodyPath(shape: string, radius: number): Path2D {
  const path = new Path2D();

  switch (shape) {
    case "oval":
      path.ellipse(0, 0, radius * 1.12, radius * 0.72, 0, 0, TAU);
      break;

    case "square":
      path.roundRect(-radius * 0.86, -radius * 0.86, radius * 1.72, radius * 1.72, radius * 0.3);
      break;

    case "pill":
      path.roundRect(-radius * 1.12, -radius * 0.58, radius * 2.24, radius * 1.16, radius * 0.58);
      break;

    case "triangle":
      roundedPolygon(
        path,
        [
          [0, -radius * 0.98],
          [radius * 0.92, radius * 0.62],
          [-radius * 0.92, radius * 0.62],
        ],
        radius * 0.24,
      );
      break;

    case "hexagon":
      roundedPolygon(
        path,
        Array.from({ length: 6 }, (_, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI) / 3;
          return [Math.cos(angle) * radius * 0.92, Math.sin(angle) * radius * 0.92];
        }),
        radius * 0.2,
      );
      break;

    case "cloud":
      path.arc(-radius * 0.38, radius * 0.1, radius * 0.5, 0, TAU);
      path.moveTo(radius * 0.84, radius * 0.02);
      path.arc(radius * 0.36, radius * 0.04, radius * 0.54, 0, TAU);
      path.moveTo(radius * 0.56, -radius * 0.24);
      path.arc(0, -radius * 0.34, radius * 0.52, 0, TAU);
      path.roundRect(-radius * 0.74, radius * 0.04, radius * 1.48, radius * 0.52, radius * 0.22);
      break;

    case "drop":
      path.moveTo(0, -radius * 1.08);
      path.bezierCurveTo(
        radius * 0.55,
        -radius * 0.42,
        radius * 0.86,
        radius * 0.18,
        radius * 0.7,
        radius * 0.52,
      );
      path.bezierCurveTo(
        radius * 0.54,
        radius * 0.94,
        -radius * 0.54,
        radius * 0.94,
        -radius * 0.7,
        radius * 0.52,
      );
      path.bezierCurveTo(
        -radius * 0.86,
        radius * 0.18,
        -radius * 0.55,
        -radius * 0.42,
        0,
        -radius * 1.08,
      );
      path.closePath();
      break;

    case "blob":
      superellipse(path, radius * 0.97, 3.1);
      break;

    case "egg":
      path.ellipse(0, radius * 0.06, radius * 0.8, radius * 1.02, 0, 0, TAU);
      break;

    case "diamond":
      roundedPolygon(
        path,
        [
          [0, -radius * 1.02],
          [radius * 0.94, 0],
          [0, radius * 1.02],
          [-radius * 0.94, 0],
        ],
        radius * 0.22,
      );
      break;

    case "star": {
      const points: number[][] = [];
      for (let index = 0; index < 10; index += 1) {
        const angle = -Math.PI / 2 + (index * Math.PI) / 5;
        const distance = index % 2 === 0 ? radius * 1.02 : radius * 0.46;
        points.push([Math.cos(angle) * distance, Math.sin(angle) * distance]);
      }
      roundedPolygon(path, points, radius * 0.1);
      break;
    }

    case "round":
    default:
      path.arc(0, 0, radius * 0.95, 0, TAU);
      break;
  }

  return path;
}

/**
 * bubo's body: a flat colored shape with two simple capsule eyes. No pupils,
 * no sclera rings, just a solid highlight that blinks and drifts.
 */
export function Mascot({
  state,
  mood = "idle",
  color = "#8b7dff",
  shape = "round",
  energy = 0,
  size = 128,
  boopable = false,
  showMouth = true,
  mouthStyle = "line",
  mouthSize = "medium",
  eyeStyle = "bars",
  eyeSize = "medium",
  eyeSpacing = "normal",
  eyeTilt = "soft",
  eyeColor = "auto",
  animate = true,
  canvasPadding = 0.75,
}: MascotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OrbState>(state);
  const moodRef = useRef<Mood>(mood);
  const energyRef = useRef(energy);
  const boopRef = useRef(0);
  const canvasSize = Math.round(size * (1 + canvasPadding));

  stateRef.current = state;
  moodRef.current = mood;
  energyRef.current = energy;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const hit = hitRef.current;
    if (!canvas || !context || !hit) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize * dpr;
    canvas.height = canvasSize * dpr;
    context.scale(dpr, dpr);

    const gaze = { x: 0, y: 0, tx: 0, ty: 0, seen: -10 };
    const radius = size * 0.3;
    const start = performance.now();
    let frame = 0;
    let smoothed = 0;
    let nextBlink = 1.8;
    let blinkStart = -1;
    let nextWander = 0;
    let wonder = 0;
    let moodBlend = 0;
    let hoverSeen = -10;
    let nextLook = 6 + Math.random() * 6;
    let lookPhase = -1;
    let lookUntil = 0;
    let nextHop = 8 + Math.random() * 10;
    let hopAt = -1;
    let lastState = stateRef.current;
    let lastTime = 0;
    let happyUntil = -1;
    let winkUntil = -1;
    // eased values keep state changes visible instead of snapping
    const eased = { squint: 1, tiltAmp: 0.02, breatheAmp: 0.026 };

    // underdamped springs: value plus velocity, integrated twice per frame
    const headX = { value: 0, velocity: 0 };
    const headY = { value: 0, velocity: 0 };
    const headRot = { value: 0, velocity: 0 };
    const dragX = { value: 0, velocity: 0, target: 0 };
    const dragY = { value: 0, velocity: 0, target: 0 };
    const drag = { active: false, startX: 0, startY: 0, moved: 0 };

    const spring = (
      state: { value: number; velocity: number },
      target: number,
      stiffness: number,
      damping: number,
      dt: number,
    ) => {
      const force = (target - state.value) * stiffness - state.velocity * damping;
      state.velocity += force * dt;
      state.value += state.velocity * dt;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = hit.getBoundingClientRect();
      const halfWidth = rect.width / 2 || 1;
      const halfHeight = rect.height / 2 || 1;
      gaze.tx = Math.max(-1, Math.min(1, (event.clientX - (rect.left + halfWidth)) / halfWidth));
      gaze.ty = Math.max(-1, Math.min(1, (event.clientY - (rect.top + halfHeight)) / halfHeight));
      gaze.seen = (performance.now() - start) / 1000;
      const distance = Math.hypot(
        event.clientX - (rect.left + halfWidth),
        event.clientY - (rect.top + halfHeight),
      );
      if (distance < rect.width * 0.85) hoverSeen = gaze.seen;

      if (!drag.active) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      // soft limit: the further you pull, the more resistance, but no wall
      const limit = radius * 0.55;
      const pull = (value: number) =>
        Math.sign(value) * limit * Math.tanh(Math.abs(value) / limit);
      dragX.target = pull(dx);
      dragY.target = pull(dy);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!boopable) return;
      drag.active = true;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.moved = 0;
      try {
        hit.setPointerCapture(event.pointerId);
      } catch {
        // the pointer can already be gone on very fast clicks
      }
      hit.style.cursor = "grabbing";
    };

    const onPointerUp = () => {
      if (!drag.active) return;
      drag.active = false;
      dragX.target = 0;
      dragY.target = 0;
      hit.style.cursor = boopable ? "grab" : "default";
      if (drag.moved < 4) {
        const now2 = (performance.now() - start) / 1000;
        boopRef.current = 1;
        happyUntil = now2 + 1.2;
        winkUntil = now2 + 0.32;
      }
    };

    if (animate) {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("blur", onPointerUp);
      hit.addEventListener("pointerdown", onPointerDown);
      hit.addEventListener("pointercancel", onPointerUp);
      if (boopable) hit.style.cursor = "grab";
    }
    const draw = (now: number) => {
      const time = (now - start) / 1000;
      const delta = Math.min(0.05, Math.max(0.008, time - lastTime || 0.016));
      lastTime = time;

      const current = stateRef.current;
      const center = canvasSize / 2;

      if (current !== lastState) {
        wonder = 1;
        lastState = current;
        if (current === "idle") boopRef.current = Math.max(boopRef.current, 0.7);
      }
      wonder *= 0.96;
      smoothed = smoothed * 0.9 + energyRef.current * 0.1;
      boopRef.current *= 0.93;

      // slow, eased transitions between moods
      const targetSquint = current === "thinking" ? 0.6 : 1;
      const targetTilt = current === "thinking" ? 0.07 : current === "streaming" ? 0.035 : 0.02;
      const targetBreathe = current === "thinking" ? 0.03 : 0.026;
      const easeRate = Math.min(1, 0.045 * (delta * 60));
      eased.squint += (targetSquint - eased.squint) * easeRate;
      eased.tiltAmp += (targetTilt - eased.tiltAmp) * easeRate;
      eased.breatheAmp += (targetBreathe - eased.breatheAmp) * easeRate;

      const boop = Math.sin(boopRef.current * Math.PI) * radius * 0.2;
      const squish = Math.sin(time * (current === "thinking" ? 3.4 : 1.9));
      const breathe = 1 + squish * eased.breatheAmp + smoothed * 0.03;
      const sway = Math.sin(time * 0.9) * radius * 0.022;
      const tilt = Math.sin(time * 2.1) * eased.tiltAmp;

      const feeling = moodRef.current;
      const moodHappy = feeling === "happy" || feeling === "proud";
      const moodSad = feeling === "sad";
      const moodSurprised = feeling === "surprised";
      moodBlend += ((feeling === "idle" ? 0 : 1) - moodBlend) * Math.min(1, 0.14 * (delta * 60));
      const moodBob = moodHappy ? Math.abs(Math.sin(time * 5.5)) * radius * 0.035 : 0;
      const happy = Math.max(
        0,
        Math.min(1, (happyUntil - time) / 0.5),
        moodHappy ? moodBlend : 0,
      );
      const winking = winkUntil > time;

      const seesPointer = time - gaze.seen < 2.5;

      // idle look-around routine: a few deliberate targets, then a long rest
      if (!seesPointer && current !== "thinking") {
        if (lookPhase < 0 && time > nextLook) {
          lookPhase = 0;
          lookUntil = time;
        }
        if (lookPhase >= 0 && time > lookUntil) {
          const targets: Array<[number, number]> = [
            [-0.85, -0.32],
            [0.85, -0.22],
            [0.18, 0.24],
            [-0.22, 0.04],
          ];
          const [tx, ty] = targets[lookPhase];
          gaze.tx = tx;
          gaze.ty = ty;
          lookPhase += 1;
          lookUntil = time + 0.65 + Math.random() * 0.5;
          if (lookPhase >= targets.length) {
            lookPhase = -1;
            nextLook = time + 7 + Math.random() * 8;
          }
        }
      }

      // short saccades keep the eyes alive between routines
      if (!seesPointer && lookPhase < 0 && time > nextWander) {
        gaze.tx = (Math.random() - 0.5) * 1.5;
        gaze.ty = (Math.random() - 0.5) * 0.8 + 0.08;
        nextWander = time + 0.9 + Math.random() * 2.0;
      }
      if (current === "thinking") {
        // slow orbit, like the avatar waiting for an answer
        gaze.tx = Math.cos(time * 1.35) * 0.85;
        gaze.ty = Math.sin(time * 1.35) * 0.4 + 0.06;
      }
      const ease = current === "thinking" ? 0.2 : 0.16;
      gaze.x += (gaze.tx - gaze.x) * ease * (delta * 60);
      gaze.y += (gaze.ty - gaze.y) * ease * (delta * 60);

      // two spring substeps keep the head soft and slightly overshooting
      const halfStep = delta / 2;
      for (let step = 0; step < 2; step += 1) {
        spring(headX, gaze.x * radius * 0.11, 95, 13, halfStep);
        spring(headY, gaze.y * radius * 0.07, 90, 14, halfStep);
        spring(headRot, gaze.x * 0.09, 80, 12, halfStep);
        spring(dragX, dragX.target, 150, 9, halfStep);
        spring(dragY, dragY.target, 150, 9, halfStep);
      }

      if (current === "idle" && time > nextHop) {
        hopAt = time;
        nextHop = time + 10 + Math.random() * 12;
      }
      if (hopAt >= 0 && time - hopAt >= 0.5) hopAt = -1;
      const hop =
        hopAt >= 0 ? Math.sin(((time - hopAt) / 0.5) * Math.PI) * radius * 0.06 : 0;
      const hovering = time - hoverSeen < 0.35;

      if (blinkStart < 0 && time >= nextBlink) blinkStart = time;

      let openness = 1;
      if (blinkStart >= 0) {
        const elapsed = time - blinkStart;
        if (elapsed < 0.06) openness = 1 - elapsed / 0.06;
        else if (elapsed < 0.13) openness = (elapsed - 0.06) / 0.07;
        else {
          blinkStart = -1;
          openness = 1;
          // now and then a quick double blink, like a real face
          nextBlink =
            time +
            (Math.random() < 0.28 ? 0.19 : current === "streaming" ? 4.2 : 1.8) +
            Math.random() * (Math.random() < 0.28 ? 0.05 : 3.2);
        }
      }

      const squint = eased.squint;
      let eyeOpen = Math.max(0.08, openness * squint);
      eyeOpen *= 1 - 0.18 * (moodSad ? moodBlend : 0);
      eyeOpen *= 1 + 0.08 * (moodSurprised ? moodBlend : 0);

      // directional pull: the trailing edge lags behind while the leading edge
      // stretches towards the pointer, so it reads as being pulled instead of
      // simply moving. The spring adds the wobble on release.
      const dragDistance = Math.hypot(dragX.value, dragY.value);
      const pull = Math.min(1, dragDistance / (radius * 0.55));
      const pullAngle = Math.atan2(dragY.value, dragX.value);
      const stretch = 1 + pull * 0.28;
      const squash = 1 - pull * 0.08;
      const lean = (dragX.value / (radius * 0.55)) * 0.05;
      const moodDrop = moodSad
        ? radius * 0.05 * moodBlend
        : moodSurprised
          ? -radius * 0.035 * moodBlend
          : 0;

      context.clearRect(0, 0, canvasSize, canvasSize);

      context.save();
      context.translate(
        center + sway + headX.value + dragX.value * 0.55,
        center + boop + headY.value + dragY.value * 0.55 + moodBob * moodBlend + moodDrop + hop,
      );
      context.rotate(tilt + headRot.value + lean);

      // soft aura follows the body, outside the stretch so it never clips
      const auraRadius = radius * 1.9;
      const aura = context.createRadialGradient(0, 0, radius * 0.4, 0, 0, auraRadius);
      aura.addColorStop(0, `${color}${hovering ? "3a" : "2e"}`);
      aura.addColorStop(0.6, `${color}10`);
      aura.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = aura;
      context.beginPath();
      context.arc(0, 0, auraRadius, 0, TAU);
      context.fill();

      context.scale(1 / breathe, breathe);

      if (pull > 0.01) {
        context.rotate(pullAngle);
        context.translate(-radius * 0.82, 0);
        context.scale(stretch, squash);
        context.translate(radius * 0.82, 0);
        context.rotate(-pullAngle);
      }

      // body
      const body = bodyPath(shape, radius);
      context.fillStyle = color;
      context.fill(body);

      context.save();
      context.clip(body);
      const sheen = context.createLinearGradient(0, -radius, 0, radius * 1.1);
      sheen.addColorStop(0, "rgba(255,255,255,0.24)");
      sheen.addColorStop(0.45, "rgba(255,255,255,0.03)");
      sheen.addColorStop(1, "rgba(0,0,0,0.18)");
      context.fillStyle = sheen;
      context.fillRect(-radius * 1.4, -radius * 1.4, radius * 2.8, radius * 2.8);
      context.restore();

      // eyes: one flat shape each, no pupil; style, size, spacing, tilt and
      // color are configurable, and every solid shape folds when it blinks
      const sizeScale =
        (eyeSize === "small" ? 0.82 : eyeSize === "large" ? 1.22 : 1) * (hovering ? 1.035 : 1);
      const spacingScale = eyeSpacing === "close" ? 0.235 : eyeSpacing === "wide" ? 0.35 : 0.285;
      const tiltAngle = eyeTilt === "straight" ? 0 : eyeTilt === "sharp" ? 0.14 : -0.16;
      const ink =
        !eyeColor || eyeColor === "auto"
          ? brightness(color) > 0.3
            ? "#241d33"
            : "#fcfcff"
          : eyeColor;

      // Wide shapes used to sit on the same fixed offset as bars, which made
      // sparkle, heart and ring almost touch. Reserve a real gap instead.
      const base = eyeShape(eyeStyle, radius, sizeScale);
      const arcLike = eyeStyle === "arcs" || eyeStyle === "wink";
      const baseHalf = arcLike ? base.width * 0.82 : base.width / 2;
      const minGap = eyeSpacing === "close" ? 0.04 : eyeSpacing === "wide" ? 0.24 : 0.13;
      const happyArcs =
        happy > 0.5 &&
        (eyeStyle === "bars" || eyeStyle === "dots" || eyeStyle === "sleepy");
      const happySpread = happyArcs
        ? radius * 0.06 * Math.min(1, (happy - 0.5) / 0.5)
        : 0;
      const eyeOffset =
        Math.max(radius * spacingScale, baseHalf + radius * minGap) + happySpread;
      const eyeY = radius * 0.05 + gaze.y * radius * 0.15;

      for (const side of [-1, 1]) {
        const style = eyeStyle === "wink" ? (side === -1 ? "arcs" : "bars") : eyeStyle;
        const eye = eyeShape(style, radius, sizeScale);
        const eyeWidth = eye.width;
        const eyeHeight = eye.height * (style === "bars" ? 1 + wonder * 0.1 : 1);
        const eyeX = side * eyeOffset + gaze.x * radius * 0.24;
        const closed = winking && side === -1;
        const cheerful =
          happy > 0.55 && (style === "bars" || style === "dots" || style === "sleepy");
        const drawArc = closed || cheerful || style === "arcs";

        context.save();
        context.translate(eyeX, eyeY);
        context.rotate(style === "angry" ? side * 0.34 : side * tiltAngle);

        if (drawArc) {
          context.strokeStyle = ink;
          context.lineWidth = Math.max(1.4, eyeWidth * 0.72);
          context.lineCap = "round";
          context.beginPath();
          context.arc(0, eyeHeight * 0.2, eyeWidth * 0.85, Math.PI * 1.14, Math.PI * 1.86);
          context.stroke();
        } else {
          context.scale(1, Math.max(0.1, eyeOpen));
          if (style === "sparkle") {
            context.fillStyle = ink;
            sparklePath(context, eyeWidth, eyeHeight);
            context.fill();
          } else if (style === "heart") {
            context.fillStyle = ink;
            heartPath(context, eyeWidth, eyeHeight);
            context.fill();
          } else if (style === "ring") {
            context.strokeStyle = ink;
            context.lineWidth = Math.max(1, eyeWidth * 0.26);
            context.beginPath();
            context.arc(0, 0, eyeWidth / 2, 0, TAU);
            context.stroke();
          } else {
            context.fillStyle = ink;
            context.beginPath();
            context.roundRect(-eyeWidth / 2, -eyeHeight / 2, eyeWidth, eyeHeight, eyeWidth / 2);
            context.fill();
          }
        }

        context.restore();
      }

      if (showMouth) {
        const mouthY = radius * 0.41;
        const mouthColor = shade(color, 0.3, 0.85);
        const mouthScale = mouthSize === "small" ? 0.82 : mouthSize === "large" ? 1.2 : 1;
        const talking =
          current === "streaming" ? 0.25 + Math.abs(Math.sin(time * 14)) * smoothed : 0;
        const open = 1 + talking * 1.1;

        context.save();
        context.translate(0, mouthY);
        context.scale(mouthScale, mouthScale);

        if (moodSad && moodBlend > 0.4) {
          context.strokeStyle = mouthColor;
          context.lineWidth = Math.max(1.3, radius * 0.04);
          context.lineCap = "round";
          context.beginPath();
          context.arc(0, radius * 0.07, radius * 0.13, Math.PI * 1.15, Math.PI * 1.85);
          context.stroke();
        } else if (moodSurprised && moodBlend > 0.4) {
          context.fillStyle = mouthColor;
          context.beginPath();
          context.ellipse(0, 0, radius * 0.08, radius * 0.11, 0, 0, TAU);
          context.fill();
        } else if (mouthStyle === "smile") {
          context.strokeStyle = mouthColor;
          context.lineWidth = Math.max(1.2, radius * 0.04);
          context.lineCap = "round";
          context.scale(1, 1 + talking * 0.45);
          context.beginPath();
          context.arc(0, -radius * 0.02, radius * 0.15, Math.PI * 0.18, Math.PI * 0.82);
          context.stroke();
        } else if (mouthStyle === "cat") {
          context.strokeStyle = mouthColor;
          context.lineWidth = Math.max(1.1, radius * 0.035);
          context.lineCap = "round";
          context.scale(1, 1 + talking * 0.35);
          for (const side of [-1, 1]) {
            context.beginPath();
            context.arc(
              side * radius * 0.075,
              0,
              radius * 0.075,
              Math.PI * 0.1,
              Math.PI * 0.9,
            );
            context.stroke();
          }
        } else if (mouthStyle === "grin") {
          const width = radius * 0.26;
          const height = radius * 0.09 * open;
          context.fillStyle = mouthColor;
          context.beginPath();
          context.roundRect(-width / 2, -height / 2, width, height, height / 2);
          context.fill();
        } else if (mouthStyle === "open") {
          context.fillStyle = mouthColor;
          context.beginPath();
          context.ellipse(0, 0, radius * 0.085, radius * 0.1 * open, 0, 0, TAU);
          context.fill();
        } else if (mouthStyle === "flat") {
          context.strokeStyle = mouthColor;
          context.lineWidth = Math.max(1.1, radius * 0.035);
          context.lineCap = "round";
          context.beginPath();
          context.moveTo(-radius * 0.11, 0);
          context.lineTo(radius * 0.11, 0);
          context.stroke();
        } else {
          const width = radius * 0.22;
          const height = radius * 0.06 * open;
          context.fillStyle = mouthColor;
          context.beginPath();
          context.roundRect(-width / 2, -height / 2, width, height, height / 2);
          context.fill();
        }

        context.restore();
      }

      if (feeling === "proud" && moodBlend > 0.05) {
        context.fillStyle = `rgba(255,255,255,${0.92 * moodBlend})`;
        for (const [x, y, scale] of [
          [-0.78, -0.86, 0.16],
          [0.82, -0.62, 0.11],
        ]) {
          context.save();
          context.translate(radius * x, radius * y);
          sparklePath(context, radius * scale * 2, radius * scale * 2);
          context.fill();
          context.restore();
        }
      }

      // thinking dots, a small nod to the codex loader
      if (current === "thinking") {
        for (let index = 0; index < 3; index += 1) {
          const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(time * 3.4 - index * 0.7));
          context.fillStyle = `rgba(255,255,255,${0.2 + pulse * 0.65})`;
          context.beginPath();
          context.arc(
            (index - 1) * radius * 0.24,
            -radius * 1.24,
            radius * 0.07 * (0.7 + pulse * 0.5),
            0,
            TAU,
          );
          context.fill();
        }
      }

      context.restore();
      if (animate) frame = requestAnimationFrame(draw);
    };

    if (animate) {
      frame = requestAnimationFrame(draw);
    } else {
      draw(performance.now());
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", onPointerUp);
      hit.removeEventListener("pointerdown", onPointerDown);
      hit.removeEventListener("pointercancel", onPointerUp);
    };
  }, [size, canvasSize, shape, color, boopable, showMouth, mouthStyle, mouthSize, eyeStyle, eyeSize, eyeSpacing, eyeTilt, eyeColor, animate]);

  return (
    <div
      className="mascot"
      style={{ position: "relative", width: size, height: size, flex: "none" }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: canvasSize,
          height: canvasSize,
          transform: "translate(-50%, -50%)",
          display: "block",
          pointerEvents: "none",
        }}
      />
      <div
        ref={hitRef}
        className="mascot-hit"
        title={boopable ? "Drag me, or click for a boop" : undefined}
        style={{
          position: "absolute",
          inset: 0,
          cursor: boopable ? "grab" : "inherit",
        }}
      />
    </div>
  );
}
