import { useId, useLayoutEffect, useRef, useState } from "react";
import { glassDisplacementMap } from "../lib/glass";

interface GlassRefractionProps {
  radius?: number;
  /** Width of the refracted band, in pixels. */
  band?: number;
  /** Maximum displacement at the edge, in pixels. */
  displacement?: number;
  /** Softening of the displaced edge, in pixels. */
  aberration?: number;
  blur?: number;
  saturation?: number;
  className?: string;
}

/**
 * A backdrop layer that blurs what is behind it and refracts the edges with an
 * SVG displacement map. The technique follows the liquid-glass React
 * implementation by nkzw-tech (MIT), with a map generated at the element size
 * so the band stays the same thickness on panels and cards alike. Render it as
 * the first child of a positioned surface; the surface content must sit on a
 * higher z-index so it stays sharp.
 */
export function GlassRefraction({
  radius = 16,
  band = 22,
  displacement = 26,
  aberration = 1.6,
  blur = 18,
  saturation = 175,
  className = "",
}: GlassRefractionProps) {
  const rawId = useId();
  const filterId = `bubo-glass-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ref = useRef<HTMLSpanElement>(null);
  const [map, setMap] = useState("");

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      setMap(glassDisplacementMap(width, height, radius, band));
    };
    measure();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [radius, band]);

  return (
    <>
      <svg aria-hidden="true" className="glass-refraction-defs">
        <defs>
          <filter
            id={filterId}
            colorInterpolationFilters="sRGB"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            {map && (
              <feImage
                href={map}
                x="0"
                y="0"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="MAP"
              />
            )}
            <feDisplacementMap
              in="SourceGraphic"
              in2="MAP"
              scale={displacement}
              xChannelSelector="R"
              yChannelSelector="B"
              result="SHIFTED"
            />
            <feGaussianBlur in="SHIFTED" stdDeviation={Math.max(0.1, 0.6 - aberration * 0.1)} />
          </filter>
        </defs>
      </svg>
      <span
        ref={ref}
        className={`glass-refraction ${className}`}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 0,
          backdropFilter: `blur(${blur}px) saturate(${saturation}%)`,
          WebkitBackdropFilter: `blur(${blur}px) saturate(${saturation}%)`,
          filter: map ? `url(#${filterId})` : undefined,
        }}
      />
    </>
  );
}
