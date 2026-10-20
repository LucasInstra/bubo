import { useEffect, useRef } from "react";
import type { OrbState } from "../lib/types";

const TAU = Math.PI * 2;

const PALETTE: Record<OrbState, { core: string; dot: string; glow: string }> = {
  idle: { core: "#8b7dff", dot: "#d6d0ff", glow: "rgba(124,92,255,0.30)" },
  thinking: { core: "#ffa063", dot: "#ffe0c7", glow: "rgba(255,138,92,0.28)" },
  streaming: { core: "#43dda0", dot: "#c6ffe6", glow: "rgba(61,220,151,0.28)" },
};

const DOTS = 150;

interface OrbProps {
  state: OrbState;
  energy?: number;
  size?: number;
}

export function Orb({ state, energy = 0, size = 128 }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<OrbState>(state);
  const energyRef = useRef(energy);

  stateRef.current = state;
  energyRef.current = energy;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

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
    let smoothedEnergy = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const time = (now - start) / 1000;
      const current = stateRef.current;
      const palette = PALETTE[current];

      smoothedEnergy = smoothedEnergy * 0.92 + energyRef.current * 0.08;

      const speed = current === "idle" ? 0.22 : current === "thinking" ? 0.95 : 0.55;
      const breathe = 1 + Math.sin(time * 1.4) * 0.025 + smoothedEnergy * 0.09;
      const radius = size * 0.33 * breathe;
      const spin = time * speed;
      const tilt = -0.42 + Math.sin(time * 0.33) * 0.06;

      const center = size / 2;
      ctx.clearRect(0, 0, size, size);

      const glow = ctx.createRadialGradient(center, center, 0, center, center, radius * 1.7);
      glow.addColorStop(0, palette.glow);
      glow.addColorStop(0.55, palette.glow.replace(/0\.\d+\)$/, "0.08)"));
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(center, center, radius * 1.7, 0, TAU);
      ctx.fill();

      const core = ctx.createRadialGradient(
        center,
        center - radius * 0.18,
        0,
        center,
        center,
        radius * 0.62,
      );
      core.addColorStop(0, palette.dot);
      core.addColorStop(0.45, palette.core);
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(center, center, radius * 0.62, 0, TAU);
      ctx.fill();
      ctx.restore();

      const cosTilt = Math.cos(tilt);
      const sinTilt = Math.sin(tilt);
      const cosSpin = Math.cos(spin);
      const sinSpin = Math.sin(spin);
      const jitter = current === "streaming" ? smoothedEnergy * 2.6 : 0;

      for (const dot of dots) {
        const x = dot.x * cosSpin - dot.z * sinSpin;
        const z0 = dot.x * sinSpin + dot.z * cosSpin;
        const y = dot.y * cosTilt - z0 * sinTilt;
        const z = dot.y * sinTilt + z0 * cosTilt;

        const depth = (z + 1) / 2;
        const perspective = 1 + z * 0.18;
        const px = center + x * radius * perspective + (Math.random() - 0.5) * jitter;
        const py = center + y * radius * perspective + (Math.random() - 0.5) * jitter;
        const dotSize = (0.85 + depth * 2.1) * (1 + smoothedEnergy * 0.3);

        ctx.globalAlpha = 0.1 + depth * 0.85;
        ctx.fillStyle = palette.dot;
        ctx.beginPath();
        ctx.arc(px, py, dotSize, 0, TAU);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: "block" }}
      aria-hidden="true"
    />
  );
}
