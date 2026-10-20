import { useEffect, useRef } from "react";
import type { OrbState } from "../lib/types";

export const MASCOT_SHAPES = [
  "blob",
  "round",
  "squircle",
  "triangle",
  "hexagon",
  "cloud",
  "drop",
] as const;

export type MascotShape = (typeof MASCOT_SHAPES)[number];

export const MASCOT_COLORS = [
  "#8b7dff",
  "#3b82f6",
  "#06b6d4",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#ec4899",
  "#a9714b",
  "#71717a",
] as const;

export const SHAPE_LABELS: Record<MascotShape, string> = {
  blob: "blob",
  round: "round",
  squircle: "square",
  triangle: "triangle",
  hexagon: "hexagon",
  cloud: "cloud",
  drop: "drop",
};

const TAU = Math.PI * 2;

interface MascotProps {
  state: OrbState;
  color?: string;
  shape?: string;
  energy?: number;
  size?: number;
  boopable?: boolean;
}

function superellipse(
  path: Path2D,
  radius: number,
  power: number,
  wobble: number,
  phase: number,
) {
  const steps = 72;
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * TAU;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const grow = 1 + Math.sin(angle * 3 + phase) * wobble;
    const x =
      radius * Math.sign(cos) * Math.abs(cos) ** (2 / power) * grow;
    const y =
      radius * Math.sign(sin) * Math.abs(sin) ** (2 / power) * grow;
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

function bodyPath(shape: string, radius: number, time: number): Path2D {
  const path = new Path2D();

  switch (shape) {
    case "round":
      path.arc(0, 0, radius * 0.96, 0, TAU);
      break;

    case "squircle":
      superellipse(path, radius * 0.94, 5, 0, 0);
      break;

    case "triangle":
      roundedPolygon(
        path,
        [
          [0, -radius * 1.02],
          [radius * 0.95, radius * 0.66],
          [-radius * 0.95, radius * 0.66],
        ],
        radius * 0.2,
      );
      break;

    case "hexagon":
      roundedPolygon(
        path,
        Array.from({ length: 6 }, (_, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI) / 3;
          return [Math.cos(angle) * radius * 0.95, Math.sin(angle) * radius * 0.95];
        }),
        radius * 0.16,
      );
      break;

    case "cloud":
      path.arc(-radius * 0.36, radius * 0.14, radius * 0.46, 0, TAU);
      path.moveTo(radius * 0.82, radius * 0.06);
      path.arc(radius * 0.34, radius * 0.08, radius * 0.52, 0, TAU);
      path.moveTo(radius * 0.58, -radius * 0.18);
      path.arc(0, -radius * 0.3, radius * 0.54, 0, TAU);
      path.roundRect(-radius * 0.72, radius * 0.08, radius * 1.44, radius * 0.5, radius * 0.2);
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
    default:
      superellipse(path, radius * 0.97, 3.1, 0.035, time * 0.8);
      break;
  }

  return path;
}

/**
 * bubo's body: a dotless creature with big eyes, a small mouth and a lot of
 * small idle motion. Eyes follow the pointer, blink on their own rhythm and
 * squint while it thinks.
 */
export function Mascot({
  state,
  color = "#8b7dff",
  shape = "blob",
  energy = 0,
  size = 128,
  boopable = false,
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
    let nextBlink = 1.6;
    let blinkStart = -1;
    let nextWander = 0;
    let wonder = 0;
    let lastState = stateRef.current;
    let lastTime = 0;

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const halfWidth = rect.width / 2 || 1;
      const halfHeight = rect.height / 2 || 1;
      gaze.tx = Math.max(-1, Math.min(1, (event.clientX - (rect.left + halfWidth)) / halfWidth));
      gaze.ty = Math.max(-1, Math.min(1, (event.clientY - (rect.top + halfHeight)) / halfHeight));
      gaze.seen = (performance.now() - start) / 1000;
    };

    const onPointerDown = () => {
      if (boopable) boopRef.current = 1;
    };

    window.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);

    const draw = (now: number) => {
      const time = (now - start) / 1000;
      const delta = Math.min(0.05, Math.max(0.008, time - lastTime || 0.016));
      lastTime = time;

      const current = stateRef.current;
      const center = size / 2;
      const radius = size * 0.31;

      if (current !== lastState) {
        wonder = 1;
        lastState = current;
      }
      wonder *= 0.93;
      smoothed = smoothed * 0.9 + energyRef.current * 0.1;
      boopRef.current *= 0.9;

      const boop = Math.sin(boopRef.current * Math.PI) * radius * 0.16;
      const squish = Math.sin(time * (current === "thinking" ? 3.2 : 1.7));
      const breathe = 1 + squish * 0.018 + smoothed * 0.02;
      const tilt =
        current === "thinking" ? Math.sin(time * 1.8) * 0.05 : Math.sin(time * 0.7) * 0.015;

      const seesPointer = time - gaze.seen < 2.5;
      if (!seesPointer && time > nextWander) {
        gaze.tx = (Math.random() - 0.5) * 0.9;
        gaze.ty = (Math.random() - 0.5) * 0.45 + 0.08;
        nextWander = time + 1.3 + Math.random() * 2.2;
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
          nextBlink = time + (current === "streaming" ? 4 : 1.7) + Math.random() * 3.2;
        }
      }

      const squint = current === "thinking" ? 0.6 : 1;
      const eyeOpen = Math.max(0.05, openness * squint);

      context.clearRect(0, 0, size, size);
      context.save();
      context.translate(center, center + boop);
      context.rotate(tilt);
      context.scale(1 / breathe, breathe);

      // soft aura
      const aura = context.createRadialGradient(0, 0, radius * 0.4, 0, 0, radius * 1.9);
      aura.addColorStop(0, `${color}30`);
      aura.addColorStop(0.6, `${color}12`);
      aura.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = aura;
      context.beginPath();
      context.arc(0, 0, radius * 1.9, 0, TAU);
      context.fill();

      // body
      const body = bodyPath(shape, radius, time);
      context.fillStyle = color;
      context.fill(body);

      context.save();
      context.clip(body);
      const sheen = context.createLinearGradient(0, -radius, 0, radius * 1.1);
      sheen.addColorStop(0, "rgba(255,255,255,0.28)");
      sheen.addColorStop(0.42, "rgba(255,255,255,0.04)");
      sheen.addColorStop(1, "rgba(0,0,0,0.2)");
      context.fillStyle = sheen;
      context.fillRect(-radius * 1.2, -radius * 1.3, radius * 2.4, radius * 2.6);
      context.restore();

      // eyes
      const eyeRadius = radius * 0.235 * (1 + wonder * 0.12);
      const eyeOffset = radius * 0.33;
      const eyeY = -radius * 0.12 + gaze.y * radius * 0.03;
      const pupilX = gaze.x * eyeRadius * 0.42;
      const pupilY = gaze.y * eyeRadius * 0.36;

      for (const side of [-1, 1]) {
        const eyeX = side * eyeOffset + gaze.x * radius * 0.05;

        context.save();
        context.translate(eyeX, eyeY);
        context.scale(1, eyeOpen);

        context.fillStyle = "rgba(252,252,255,0.98)";
        context.beginPath();
        context.ellipse(0, 0, eyeRadius, eyeRadius * 1.02, 0, 0, TAU);
        context.fill();

        context.fillStyle = "#171426";
        context.beginPath();
        context.arc(pupilX, pupilY, eyeRadius * 0.5, 0, TAU);
        context.fill();

        context.fillStyle = "rgba(255,255,255,0.95)";
        context.beginPath();
        context.arc(
          pupilX + eyeRadius * 0.16,
          pupilY - eyeRadius * 0.2,
          eyeRadius * 0.14,
          0,
          TAU,
        );
        context.fill();

        context.restore();
      }

      // mouth
      const mouthY = radius * 0.3;
      const talking =
        current === "streaming" ? 0.25 + Math.abs(Math.sin(time * 14)) * smoothed : 0;

      if (talking > 0.05) {
        context.fillStyle = "rgba(20,16,32,0.85)";
        context.beginPath();
        context.ellipse(0, mouthY, radius * 0.11, radius * (0.02 + talking * 0.1), 0, 0, TAU);
        context.fill();
      } else if (current === "thinking") {
        context.strokeStyle = "rgba(20,16,32,0.45)";
        context.lineWidth = Math.max(1.2, radius * 0.035);
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(-radius * 0.09, mouthY);
        context.lineTo(radius * 0.09, mouthY);
        context.stroke();
      } else {
        context.strokeStyle = "rgba(20,16,32,0.5)";
        context.lineWidth = Math.max(1.2, radius * 0.035);
        context.lineCap = "round";
        context.beginPath();
        context.arc(0, mouthY - radius * 0.07, radius * 0.15, Math.PI * 0.2, Math.PI * 0.8);
        context.stroke();
      }

      // thinking dots, a small nod to the codex loader
      if (current === "thinking") {
        for (let index = 0; index < 3; index += 1) {
          const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(time * 3.4 - index * 0.7));
          context.fillStyle = `rgba(255,255,255,${0.2 + pulse * 0.65})`;
          context.beginPath();
          context.arc(
            (index - 1) * radius * 0.24,
            -radius * 1.26,
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
  }, [size, shape, color, boopable]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: "block", cursor: boopable ? "pointer" : "default" }}
      aria-hidden="true"
    />
  );
}
