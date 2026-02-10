import { BOX_LINE_MAP } from "../../box-drawing-map";
import type { Color, RectData } from "../types";
import { drawFallbackBoxDrawing } from "./fallback";
import { drawMappedBoxDrawing } from "./mapped";

/**
 * Rasterize a Unicode Box Drawing character (U+2500-U+257F) into rect instances.
 * Handles straight segments, dashed lines, rounded corners, and diagonal lines.
 */
export function drawBoxDrawing(
  cp: number,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  color: Color,
  out: RectData,
  boxThicknessPx?: number,
): boolean {
  // Ghostty derives box_thickness from underline thickness.
  // When callers provide it, use that directly for closer parity.
  const hasBoxThickness =
    Number.isFinite(boxThicknessPx) && typeof boxThicknessPx === "number" && boxThicknessPx > 0;
  const lightStroke = hasBoxThickness
    ? Math.max(1, Math.round(boxThicknessPx))
    : Math.max(1, Math.floor(cellH / 16));
  const heavyStroke = lightStroke * 2;
  const spec = BOX_LINE_MAP.get(cp);

  if (!spec) {
    return drawFallbackBoxDrawing(
      cp,
      x,
      y,
      cellW,
      cellH,
      color,
      out,
      lightStroke,
      heavyStroke,
    );
  }

  return drawMappedBoxDrawing(spec, x, y, cellW, cellH, color, out, lightStroke, heavyStroke);
}
