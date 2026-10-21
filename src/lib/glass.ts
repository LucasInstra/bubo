/**
 * Builds the displacement map used by the SVG refraction filter. It follows
 * the same channel layout as Apple-style liquid glass implementations: the R
 * channel holds the horizontal offset and B the vertical offset, with 128 as
 * neutral. The map is generated at the element size so the refracted band
 * keeps a fixed pixel width instead of stretching with the window.
 */
export function glassDisplacementMap(
  width: number,
  height: number,
  radius: number,
  band: number,
): string {
  if (typeof document === "undefined" || width < 2 || height < 2) return "";

  const scale = Math.min(1, 480 / Math.max(width, height));
  const mapWidth = Math.max(2, Math.round(width * scale));
  const mapHeight = Math.max(2, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = mapWidth;
  canvas.height = mapHeight;
  const context = canvas.getContext("2d");
  if (!context) return "";

  const image = context.createImageData(mapWidth, mapHeight);
  const data = image.data;
  const corner = Math.min(radius * scale, Math.min(mapWidth, mapHeight) / 2);
  const edge = Math.max(2, band * scale);

  // Signed distance to the rounded rect: negative inside, positive outside.
  const distance = (x: number, y: number) => {
    const dx = Math.abs(x - mapWidth / 2) - (mapWidth / 2 - corner);
    const dy = Math.abs(y - mapHeight / 2) - (mapHeight / 2 - corner);
    const ax = Math.max(dx, 0);
    const ay = Math.max(dy, 0);
    return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - corner;
  };

  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      const index = (y * mapWidth + x) * 4;
      const inside = -distance(x + 0.5, y + 0.5);
      let normalX = 0;
      let normalY = 0;
      if (inside < edge) {
        const gradientX = distance(x + 1.5, y + 0.5) - distance(x - 0.5, y + 0.5);
        const gradientY = distance(x + 0.5, y + 1.5) - distance(x + 0.5, y - 0.5);
        const length = Math.hypot(gradientX, gradientY) || 1;
        const falloff = 1 - Math.max(0, inside) / edge;
        normalX = (gradientX / length) * falloff;
        normalY = (gradientY / length) * falloff;
      }
      data[index] = Math.round(128 + normalX * 127);
      data[index + 1] = 128;
      data[index + 2] = Math.round(128 + normalY * 127);
      data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
