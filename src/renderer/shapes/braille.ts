import { isBraille } from "./classify";
import { pushRectSnapped } from "./geometry";
import type { Color, RectData } from "./types";

/** Rasterize a Unicode Braille Pattern (U+2800-U+28FF) into rect dot instances. */
export function drawBraille(
  cp: number,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  color: Color,
  out: RectData,
): boolean {
  if (!isBraille(cp)) return false;
  const bits = cp - 0x2800;
  if (!bits) return true;

  const dotW = Math.max(1, Math.round(cellW * 0.18));
  const dotH = Math.max(1, Math.round(cellH * 0.18));
  const colX = [x + cellW * 0.25 - dotW * 0.5, x + cellW * 0.75 - dotW * 0.5];
  const rowY = [
    y + cellH * 0.125 - dotH * 0.5,
    y + cellH * 0.375 - dotH * 0.5,
    y + cellH * 0.625 - dotH * 0.5,
    y + cellH * 0.875 - dotH * 0.5,
  ];
  const dots: [number, number, number][] = [
    [0, 0, 0x01],
    [0, 1, 0x02],
    [0, 2, 0x04],
    [1, 0, 0x08],
    [1, 1, 0x10],
    [1, 2, 0x20],
    [0, 3, 0x40],
    [1, 3, 0x80],
  ];
  for (const [cx, cy, mask] of dots) {
    if (bits & mask) {
      pushRectSnapped(out, colX[cx]!, rowY[cy]!, dotW, dotH, color);
    }
  }
  return true;
}
