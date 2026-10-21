/**
 * Builds the displacement map used by the SVG refraction filter. It follows
 * the same channel layout as the liquid-glass implementations by nkzw-tech
 * (MIT): the R channel holds the horizontal offset and B the vertical offset,
 * with 128 as neutral. The map is generated at the element size so the
 * refracted band keeps a fixed pixel width instead of stretching with the
 * window.
 */
const cache = new Map<string, string>();

export function glassDisplacementMap(
  width: number,
  height: number,
  radius: number,
  band: number,
): string {
  if (typeof document === "undefined" || width < 2 || height < 2) return "";

  const scale = Math.min(1, 512 / Math.max(width, height));
  const mapWidth = Math.max(2, Math.round(width * scale));
  const mapHeight = Math.max(2, Math.round(height * scale));
  const corner = Math.max(0, Math.min(radius * scale, Math.min(mapWidth, mapHeight) / 2));
  const edge = Math.max(2, band * scale);
  const key = `${mapWidth}x${mapHeight}:${Math.round(corner)}:${Math.round(edge)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = mapWidth;
  canvas.height = mapHeight;
  const context = canvas.getContext("2d");
  if (!context) return "";

  const image = context.createImageData(mapWidth, mapHeight);
  const data = image.data;
  const halfWidth = mapWidth / 2;
  const halfHeight = mapHeight / 2;

  // Signed distance to the rounded rect, with the origin at the map center:
  // negative inside, positive outside.
  const distance = (x: number, y: number) => {
    const dx = Math.abs(x) - (halfWidth - corner);
    const dy = Math.abs(y) - (halfHeight - corner);
    const ax = Math.max(dx, 0);
    const ay = Math.max(dy, 0);
    return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - corner;
  };

  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      const index = (y * mapWidth + x) * 4;
      const cx = x + 0.5 - halfWidth;
      const cy = y + 0.5 - halfHeight;
      const inside = -distance(cx, cy);
      let normalX = 0;
      let normalY = 0;
      if (inside < edge) {
        const gradientX = distance(cx + 1, cy) - distance(cx - 1, cy);
        const gradientY = distance(cx, cy + 1) - distance(cx, cy - 1);
        const length = Math.hypot(gradientX, gradientY) || 1;
        const falloff = Math.max(0, Math.min(1, 1 - Math.max(0, inside) / edge));
        const eased = falloff * falloff * (3 - 2 * falloff);
        normalX = (gradientX / length) * eased;
        normalY = (gradientY / length) * eased;
      }
      data[index] = Math.round(128 + normalX * 127);
      data[index + 1] = 128;
      data[index + 2] = Math.round(128 + normalY * 127);
      data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  const url = canvas.toDataURL("image/png");
  if (cache.size > 64) cache.clear();
  cache.set(key, url);
  return url;
}
