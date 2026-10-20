import { useEffect, useRef } from "react";
import type { OrbState } from "../lib/types";

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

export const EYE_STYLES = ["bars", "dots", "arcs", "sleepy"] as const;
export const EYE_SIZES = ["small", "medium", "large"] as const;

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

interface MascotProps {
  state: OrbState;
  color?: string;
  shape?: string;
  energy?: number;
  size?: number;
  boopable?: boolean;
  showMouth?: boolean;
  eyeStyle?: string;
  eyeSize?: string;
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
  color = "#8b7dff",
  shape = "round",
  energy = 0,
  size = 128,
  boopable = false,
  showMouth = true,
  eyeStyle = "bars",
  eyeSize = "medium",
}: MascotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<OrbState>(state);
  const energyRef = useRef(energy);
  const boopRef = useRef(0);

  stateRef.current = state;
  energyRef.current = energy;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    context.scale(dpr, dpr);

    const gaze = { x: 0, y: 0, tx: 0, ty: 0, seen: -10 };
    const start = performance.now();
    let frame = 0;
    let smoothed = 0;
    let nextBlink = 1.8;
    let blinkStart = -1;
    let nextWander = 0;
    let wonder = 0;
    let lastState = stateRef.current;
    let lastTime = 0;
    let happyUntil = -1;
    let winkUntil = -1;
    // eased values keep state changes visible instead of snapping
    const eased = { squint: 1, tiltAmp: 0.02, breatheAmp: 0.026 };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const halfWidth = rect.width / 2 || 1;
      const halfHeight = rect.height / 2 || 1;
      gaze.tx = Math.max(-1, Math.min(1, (event.clientX - (rect.left + halfWidth)) / halfWidth));
      gaze.ty = Math.max(-1, Math.min(1, (event.clientY - (rect.top + halfHeight)) / halfHeight));
      gaze.seen = (performance.now() - start) / 1000;
    };

    const onPointerDown = () => {
      if (!boopable) return;
      const now2 = (performance.now() - start) / 1000;
      boopRef.current = 1;
      happyUntil = now2 + 1.2;
      winkUntil = now2 + 0.32;
    };

    window.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);

    const draw = (now: number) => {
      const time = (now - start) / 1000;
      const delta = Math.min(0.05, Math.max(0.008, time - lastTime || 0.016));
      lastTime = time;

      const current = stateRef.current;
      const center = size / 2;
      const radius = size * 0.3;

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
      const happy = Math.max(0, Math.min(1, (happyUntil - time) / 0.5));
      const winking = winkUntil > time;

      const seesPointer = time - gaze.seen < 2.5;
      if (!seesPointer && time > nextWander) {
        gaze.tx = (Math.random() - 0.5) * 0.9;
        gaze.ty = (Math.random() - 0.5) * 0.4 + 0.08;
        nextWander = time + 1.4 + Math.random() * 2.4;
      }
      if (current === "thinking") {
        gaze.tx = Math.max(-1, Math.min(1, gaze.tx + (Math.random() - 0.5) * 0.3));
        gaze.ty = Math.max(-1, Math.min(1, gaze.ty + (Math.random() - 0.5) * 0.2));
      }
      const ease = current === "thinking" ? 0.18 : 0.08;
      gaze.x += (gaze.tx - gaze.x) * ease * (delta * 60);
      gaze.y += (gaze.ty - gaze.y) * ease * (delta * 60);

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
      const eyeOpen = Math.max(0.08, openness * squint);

      context.clearRect(0, 0, size, size);
      context.save();
      context.translate(center + sway, center + boop);
      context.rotate(tilt);
      context.scale(1 / breathe, breathe);

      // soft aura
      const aura = context.createRadialGradient(0, 0, radius * 0.4, 0, 0, radius * 1.9);
      aura.addColorStop(0, `${color}2e`);
      aura.addColorStop(0.6, `${color}10`);
      aura.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = aura;
      context.beginPath();
      context.arc(0, 0, radius * 1.9, 0, TAU);
      context.fill();

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

      // eyes: one solid shape each, no pupil; style and size are configurable
      const sizeScale = eyeSize === "small" ? 0.82 : eyeSize === "large" ? 1.22 : 1;
      let eyeWidth = radius * 0.225 * sizeScale;
      let eyeHeight = radius * 0.52 * sizeScale * (1 + wonder * 0.1);
      if (eyeStyle === "dots") eyeHeight = eyeWidth;
      if (eyeStyle === "sleepy") {
        eyeWidth = radius * 0.34 * sizeScale;
        eyeHeight = radius * 0.13 * sizeScale;
      }
      const eyeOffset = radius * 0.285;
      const eyeY = radius * 0.05 + gaze.y * radius * 0.03;
      const drawArcs = happy > 0.55 || eyeStyle === "arcs";

      for (const side of [-1, 1]) {
        const eyeX = side * eyeOffset + gaze.x * radius * 0.05;
        const blinkScale = winking && side === -1 ? 0.08 : eyeOpen;

        context.save();
        context.translate(eyeX, eyeY);
        context.rotate(side * -0.16);

        if (drawArcs) {
          context.strokeStyle = "rgba(252,252,255,0.97)";
          context.lineWidth = Math.max(1.4, eyeWidth * 0.72);
          context.lineCap = "round";
          context.beginPath();
          context.arc(0, eyeHeight * 0.2, eyeWidth * 0.9, Math.PI * 1.14, Math.PI * 1.86);
          context.stroke();
        } else {
          context.scale(1, blinkScale);
          context.fillStyle = "rgba(252,252,255,0.97)";
          context.beginPath();
          context.roundRect(-eyeWidth / 2, -eyeHeight / 2, eyeWidth, eyeHeight, eyeWidth / 2);
          context.fill();
        }

        context.restore();
      }

      if (showMouth) {
        const mouthY = radius * 0.36;
        const mouthColor = shade(color, 0.32, 0.8);
        const talking =
          current === "streaming" ? 0.25 + Math.abs(Math.sin(time * 14)) * smoothed : 0;

        let width = radius * 0.15;
        let height = radius * 0.05;

        if (talking > 0.05) {
          height = radius * (0.05 + talking * 0.12);
          width = radius * 0.14;
        } else if (current === "thinking") {
          width = radius * 0.1;
          height = radius * 0.045;
        } else if (happy > 0.5) {
          width = radius * 0.17;
          height = radius * 0.055;
        }

        context.fillStyle = mouthColor;
        context.beginPath();
        context.roundRect(-width / 2, mouthY - height / 2, width, height, height / 2);
        context.fill();
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
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  }, [size, shape, color, boopable, showMouth, eyeStyle, eyeSize]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
        display: "block",
        cursor: boopable ? "pointer" : "default",
      }}
      aria-hidden="true"
    />
  );
}
