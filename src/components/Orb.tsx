import { useEffect, useRef } from "react";
import type { OrbState } from "../lib/types";

const TAU = Math.PI * 2;
const DOTS = 150;

const PALETTE: Record<OrbState, { core: string; dot: string; glow: string }> = {
  idle: { core: "#8b7dff", dot: "#d6d0ff", glow: "rgba(124,92,255,0.30)" },
  thinking: { core: "#ffa063", dot: "#ffe0c7", glow: "rgba(255,138,92,0.28)" },
  streaming: { core: "#43dda0", dot: "#c6ffe6", glow: "rgba(61,220,151,0.28)" },
};

interface OrbProps {
  state: OrbState;
  energy?: number;
  size?: number;
}

/**
 * A dotted sphere with a small face: eyes blink, pupils follow the pointer,
 * the mouth moves while the reply streams and the whole thing breathes.
 */
export function Orb({ state, energy = 0, size = 128 }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<OrbState>(state);
  const energyRef = useRef(energy);

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

    const dots = Array.from({ length: DOTS }, (_, index) => {
      const k = index + 0.5;
      const phi = Math.acos(1 - (2 * k) / DOTS);
      const theta = Math.PI * (1 + Math.sqrt(5)) * k;
      return {
        x: Math.sin(phi) * Math.cos(theta),
        y: Math.cos(phi),
        z: Math.sin(phi) * Math.sin(theta),
      };
    });

    let frame = 0;
    let smoothed = 0;
    let nextBlink = 1.4;
    let blinkStart = -1;
    let nextWander = 0;
    let wonder = 0;
    let lastState = stateRef.current;
    let lastTime = 0;

    const gaze = { x: 0, y: 0, tx: 0, ty: 0, seen: -10 };
    const start = performance.now();

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const halfWidth = rect.width / 2 || 1;
      const halfHeight = rect.height / 2 || 1;
      gaze.tx = Math.max(-1, Math.min(1, (event.clientX - (rect.left + halfWidth)) / halfWidth));
      gaze.ty = Math.max(-1, Math.min(1, (event.clientY - (rect.top + halfHeight)) / halfHeight));
      gaze.seen = (performance.now() - start) / 1000;
    };
    window.addEventListener("pointermove", onPointerMove);

    const draw = (now: number) => {
      const time = (now - start) / 1000;
      const delta = Math.min(0.05, Math.max(0.008, time - lastTime || 0.016));
      lastTime = time;

      const current = stateRef.current;
      const palette = PALETTE[current];
      const center = size / 2;

      if (current !== lastState) {
        wonder = 1;
        lastState = current;
      }
      wonder *= 0.93;
      smoothed = smoothed * 0.92 + energyRef.current * 0.08;

      const speed = current === "idle" ? 0.22 : current === "thinking" ? 0.95 : 0.55;
      const breathe = 1 + Math.sin(time * 1.35) * 0.025 + smoothed * 0.06;
      const radius = size * 0.33 * breathe;
      const spin = time * speed;
      const tilt = -0.42 + Math.sin(time * 0.33) * 0.06;
      const bob = Math.sin(time * 1.2) * radius * 0.012;

      context.clearRect(0, 0, size, size);

      // ambient glow
      const glow = context.createRadialGradient(center, center, 0, center, center, radius * 1.7);
      glow.addColorStop(0, palette.glow);
      glow.addColorStop(0.55, palette.glow.replace(/0\.\d+\)$/, "0.08)"));
      glow.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(center, center, radius * 1.7, 0, TAU);
      context.fill();

      const faceX = center;
      const faceY = center + bob;
      const faceRadiusX = radius * 0.62;
      const faceRadiusY = radius * 0.47;
      const tiny = size < 30;
      const compact = size < 46;
      const showFace = !tiny;

      // the dotted shell, with a window open where the face sits
      const cosTilt = Math.cos(tilt);
      const sinTilt = Math.sin(tilt);
      const cosSpin = Math.cos(spin);
      const sinSpin = Math.sin(spin);
      const jitter = current === "streaming" ? smoothed * 2.6 : 0;

      if (!compact) {
        for (const dot of dots) {
          const x = dot.x * cosSpin - dot.z * sinSpin;
          const z0 = dot.x * sinSpin + dot.z * cosSpin;
          const y = dot.y * cosTilt - z0 * sinTilt;
          const z = dot.y * sinTilt + z0 * cosTilt;

          const depth = (z + 1) / 2;
          const perspective = 1 + z * 0.18;
          const px = center + x * radius * perspective + (Math.random() - 0.5) * jitter;
          const py = center + y * radius * perspective + (Math.random() - 0.5) * jitter;

          if (showFace && z > -0.2) {
            const nx = (px - faceX) / faceRadiusX;
            const ny = (py - faceY) / faceRadiusY;
            if (nx * nx + ny * ny < 1) continue;
          }

          const dotSize = (0.85 + depth * 2.1) * (1 + smoothed * 0.3);
          context.globalAlpha = 0.1 + depth * 0.85;
          context.fillStyle = palette.dot;
          context.beginPath();
          context.arc(px, py, dotSize, 0, TAU);
          context.fill();
        }
        context.globalAlpha = 1;
      } else {
        const disc = context.createRadialGradient(
          center,
          center,
          radius * 0.1,
          center,
          center,
          radius * 1.05,
        );
        disc.addColorStop(0, "rgba(214,208,255,0.32)");
        disc.addColorStop(0.65, palette.glow.replace(/0\.\d+\)$/, "0.16)"));
        disc.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = disc;
        context.beginPath();
        context.arc(center, center, radius * 1.05, 0, TAU);
        context.fill();
      }

      // gaze: follow the pointer, otherwise wander and blink
      const seesPointer = time - gaze.seen < 2.5;
      if (!seesPointer && time > nextWander) {
        gaze.tx = (Math.random() - 0.5) * 0.9;
        gaze.ty = (Math.random() - 0.5) * 0.5 + 0.1;
        nextWander = time + 1.2 + Math.random() * 2.4;
      }
      if (current === "thinking") {
        gaze.tx = Math.max(-1, Math.min(1, gaze.tx + (Math.random() - 0.5) * 0.35));
        gaze.ty = Math.max(-1, Math.min(1, gaze.ty + (Math.random() - 0.5) * 0.2));
      }
      const ease = current === "thinking" ? 0.16 : 0.075;
      gaze.x += (gaze.tx - gaze.x) * ease * (delta * 60);
      gaze.y += (gaze.ty - gaze.y) * ease * (delta * 60);

      if (blinkStart < 0 && time >= nextBlink) {
        blinkStart = time;
      }

      let openness = 1;
      if (blinkStart >= 0) {
        const elapsed = time - blinkStart;
        if (elapsed < 0.07) {
          openness = 1 - elapsed / 0.07;
        } else if (elapsed < 0.15) {
          openness = (elapsed - 0.07) / 0.08;
        } else {
          blinkStart = -1;
          openness = 1;
          nextBlink = time + (current === "streaming" ? 4 : 1.8) + Math.random() * 3.6;
        }
      }

      const squint = current === "thinking" ? 0.62 : current === "streaming" ? 1.04 : 1;
      const eyeOpen = Math.max(0.06, openness * squint);

      if (showFace) {
        const eyeRadius = radius * (compact ? 0.2 : 0.145) * (1 + wonder * 0.16);
        const eyeOffsetX = radius * (compact ? 0.31 : 0.26);
        const eyeY = faceY - radius * (compact ? 0.02 : 0.03);
        const pupilX = gaze.x * eyeRadius * 0.34;
        const pupilY = gaze.y * eyeRadius * 0.3;

        for (const side of [-1, 1]) {
          const eyeX = faceX + side * eyeOffsetX + gaze.x * radius * 0.045;

          context.save();
          context.translate(eyeX, eyeY);
          context.scale(1, eyeOpen);

          context.fillStyle = "rgba(247,245,255,0.97)";
          context.beginPath();
          context.arc(0, 0, eyeRadius, 0, TAU);
          context.fill();

          context.fillStyle = "#171426";
          context.beginPath();
          context.arc(pupilX, pupilY, eyeRadius * 0.56, 0, TAU);
          context.fill();

          context.fillStyle = "rgba(255,255,255,0.92)";
          context.beginPath();
          context.arc(eyeRadius * 0.2, -eyeRadius * 0.26, eyeRadius * 0.17, 0, TAU);
          context.fill();

          context.restore();
        }

        if (!compact) {
          const mouthY = faceY + radius * 0.3;
          const talking =
            current === "streaming" ? 0.3 + Math.abs(Math.sin(time * 13)) * smoothed : 0;

          if (talking > 0.05) {
            context.fillStyle = "rgba(22,18,34,0.9)";
            context.beginPath();
            context.ellipse(
              faceX,
              mouthY,
              radius * 0.13,
              radius * (0.02 + talking * 0.1),
              0,
              0,
              TAU,
            );
            context.fill();
          } else {
            context.strokeStyle = "rgba(238,236,255,0.55)";
            context.lineWidth = Math.max(1.1, radius * 0.03);
            context.lineCap = "round";
            context.beginPath();
            context.arc(
              faceX,
              mouthY - radius * 0.06,
              radius * 0.17,
              Math.PI * (current === "thinking" ? 0.32 : 0.18),
              Math.PI * (current === "thinking" ? 0.68 : 0.82),
            );
            context.stroke();
          }
        }
      } else {
        const bead = context.createRadialGradient(
          center,
          center,
          0,
          center,
          center,
          radius * 0.8,
        );
        bead.addColorStop(0, "rgba(247,245,255,0.85)");
        bead.addColorStop(0.45, palette.glow);
        bead.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = bead;
        context.beginPath();
        context.arc(center, center, radius * 0.8, 0, TAU);
        context.fill();
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: "block" }}
      aria-hidden="true"
    />
  );
}
