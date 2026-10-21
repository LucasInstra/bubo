import { useId, useLayoutEffect, useRef, useState } from "react";
import { glassDisplacementMap } from "../lib/glass";

interface GlassRefractionProps {
  radius?: number;
  /** Width of the refracted band, in pixels. */
  band?: number;
  /** Maximum displacement at the edge, in pixels. */
  displacement?: number;
  /** Chromatic aberration strength; 0 disables the color fringing. */
  aberration?: number;
  blur?: number;
  saturation?: number;
  /** Adds the thin lit rim that reads as polished glass. */
  specular?: boolean;
  className?: string;
}

/**
 * A backdrop layer that blurs what is behind it and refracts the edges with an
 * SVG displacement map. The filter chain follows the liquid-glass React
 * implementation by nkzw-tech (MIT): the displacement map doubles as the edge
 * mask, the RGB channels are displaced by slightly different scales for
 * chromatic aberration, and the center is composited back untouched. The map
 * is generated at the element size, so the band keeps the same thickness on
 * panels and cards alike. Render it as the first child of a positioned
 * surface; the surface content must sit on a higher z-index.
 */
export function GlassRefraction({
  radius = 16,
  band = 30,
  displacement = 40,
  aberration = 2,
  blur = 12,
  saturation = 170,
  specular = true,
  className = "",
}: GlassRefractionProps) {
  const rawId = useId();
  const filterId = `bubo-glass-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [map, setMap] = useState("");

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width < 2 || height < 2) return;
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
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
  }, []);

  useLayoutEffect(() => {
    if (!size.width || !size.height) return;
    setMap(glassDisplacementMap(size.width, size.height, radius, band));
  }, [size.width, size.height, radius, band]);

  const pad = Math.ceil(displacement / 2 + 8);
  const greenScale = displacement * Math.max(0, 1 - aberration * 0.05);
  const blueScale = displacement * Math.max(0, 1 - aberration * 0.1);

  return (
    <>
      <svg aria-hidden="true" className="glass-refraction-defs">
        <defs>
          <filter
            id={filterId}
            colorInterpolationFilters="sRGB"
            filterUnits="userSpaceOnUse"
            x={-pad}
            y={-pad}
            width={Math.max(0, size.width) + pad * 2}
            height={Math.max(0, size.height) + pad * 2}
          >
            {map && (
              <feImage
                href={map}
                x="0"
                y="0"
                width={size.width}
                height={size.height}
                preserveAspectRatio="none"
                result="DISPLACEMENT_MAP"
              />
            )}
            <feColorMatrix
              in="DISPLACEMENT_MAP"
              result="EDGE_INTENSITY"
              type="matrix"
              values="0.3 0.3 0.3 0 0  0.3 0.3 0.3 0 0  0.3 0.3 0.3 0 0  0 0 0 1 0"
            />
            <feComponentTransfer in="EDGE_INTENSITY" result="EDGE_MASK">
              <feFuncA type="discrete" tableValues={`0 ${aberration * 0.05} 1`} />
            </feComponentTransfer>
            <feOffset in="SourceGraphic" dx="0" dy="0" result="CENTER_ORIGINAL" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="DISPLACEMENT_MAP"
              result="RED_DISPLACED"
              scale={displacement}
              xChannelSelector="R"
              yChannelSelector="B"
            />
            <feColorMatrix
              in="RED_DISPLACED"
              result="RED_CHANNEL"
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="DISPLACEMENT_MAP"
              result="GREEN_DISPLACED"
              scale={greenScale}
              xChannelSelector="R"
              yChannelSelector="B"
            />
            <feColorMatrix
              in="GREEN_DISPLACED"
              result="GREEN_CHANNEL"
              type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="DISPLACEMENT_MAP"
              result="BLUE_DISPLACED"
              scale={blueScale}
              xChannelSelector="R"
              yChannelSelector="B"
            />
            <feColorMatrix
              in="BLUE_DISPLACED"
              result="BLUE_CHANNEL"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            />
            <feBlend in="GREEN_CHANNEL" in2="BLUE_CHANNEL" mode="screen" result="GB_COMBINED" />
            <feBlend in="RED_CHANNEL" in2="GB_COMBINED" mode="screen" result="RGB_COMBINED" />
            <feGaussianBlur
              in="RGB_COMBINED"
              result="ABERRATED_BLURRED"
              stdDeviation={Math.max(0.1, 0.5 - aberration * 0.1)}
            />
            <feComposite
              in="ABERRATED_BLURRED"
              in2="EDGE_MASK"
              operator="in"
              result="EDGE_ABERRATION"
            />
            <feComponentTransfer in="EDGE_MASK" result="INVERTED_MASK">
              <feFuncA type="table" tableValues="1 0" />
            </feComponentTransfer>
            <feComposite
              in="CENTER_ORIGINAL"
              in2="INVERTED_MASK"
              operator="in"
              result="CENTER_CLEAN"
            />
            <feComposite in="EDGE_ABERRATION" in2="CENTER_CLEAN" operator="over" />
          </filter>
        </defs>
      </svg>
      <span
        ref={ref}
        className={`glass-refraction ${className}`}
        aria-hidden="true"
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
      {specular && (
        <>
          <span className="glass-specular" style={{ borderRadius: radius }} aria-hidden="true" />
          <span
            className="glass-specular glass-specular-overlay"
            style={{ borderRadius: radius }}
            aria-hidden="true"
          />
        </>
      )}
    </>
  );
}
