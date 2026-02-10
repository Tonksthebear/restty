import { applyAlpha, pushRectSnapped } from "./geometry";
import type { Color, RectData } from "./types";

// Fractional fill helper
function fillFrac(
  out: RectData,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  fx0: number,
  fx1: number,
  fy0: number,
  fy1: number,
  color: Color,
): void {
  const px0 = x + cellW * fx0;
  const px1 = x + cellW * fx1;
  const py0 = y + cellH * fy0;
  const py1 = y + cellH * fy1;
  pushRectSnapped(out, px0, py0, px1 - px0, py1 - py0, color);
}

/** Rasterize a Unicode Block Element (U+2580-U+259F) into rect instances. */
export function drawBlockElement(
  cp: number,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  color: Color,
  out: RectData,
): boolean {
  const full = () => pushRectSnapped(out, x, y, cellW, cellH, color);
  const lower = (fraction: number) =>
    fillFrac(out, x, y, cellW, cellH, 0, 1, 1 - fraction, 1, color);
  const upper = (fraction: number) => fillFrac(out, x, y, cellW, cellH, 0, 1, 0, fraction, color);
  const left = (fraction: number) => fillFrac(out, x, y, cellW, cellH, 0, fraction, 0, 1, color);
  const right = (fraction: number) =>
    fillFrac(out, x, y, cellW, cellH, 1 - fraction, 1, 0, 1, color);

  switch (cp) {
    case 0x2580:
      upper(0.5);
      return true;
    case 0x2581:
      lower(0.125);
      return true;
    case 0x2582:
      lower(0.25);
      return true;
    case 0x2583:
      lower(0.375);
      return true;
    case 0x2584:
      lower(0.5);
      return true;
    case 0x2585:
      lower(0.625);
      return true;
    case 0x2586:
      lower(0.75);
      return true;
    case 0x2587:
      lower(0.875);
      return true;
    case 0x2588:
      full();
      return true;
    case 0x2589:
      left(0.875);
      return true;
    case 0x258a:
      left(0.75);
      return true;
    case 0x258b:
      left(0.625);
      return true;
    case 0x258c:
      left(0.5);
      return true;
    case 0x258d:
      left(0.375);
      return true;
    case 0x258e:
      left(0.25);
      return true;
    case 0x258f:
      left(0.125);
      return true;
    case 0x2590:
      right(0.5);
      return true;
    case 0x2591:
      pushRectSnapped(out, x, y, cellW, cellH, applyAlpha(color, 0.25));
      return true;
    case 0x2592:
      pushRectSnapped(out, x, y, cellW, cellH, applyAlpha(color, 0.5));
      return true;
    case 0x2593:
      pushRectSnapped(out, x, y, cellW, cellH, applyAlpha(color, 0.75));
      return true;
    case 0x2594:
      upper(0.125);
      return true;
    case 0x2595:
      right(0.125);
      return true;
    case 0x2596:
      fillFrac(out, x, y, cellW, cellH, 0, 0.5, 0.5, 1, color);
      return true;
    case 0x2597:
      fillFrac(out, x, y, cellW, cellH, 0.5, 1, 0.5, 1, color);
      return true;
    case 0x2598:
      fillFrac(out, x, y, cellW, cellH, 0, 0.5, 0, 0.5, color);
      return true;
    case 0x2599:
      fillFrac(out, x, y, cellW, cellH, 0, 0.5, 0, 1, color);
      fillFrac(out, x, y, cellW, cellH, 0.5, 1, 0.5, 1, color);
      return true;
    case 0x259a:
      fillFrac(out, x, y, cellW, cellH, 0, 0.5, 0, 0.5, color);
      fillFrac(out, x, y, cellW, cellH, 0.5, 1, 0.5, 1, color);
      return true;
    case 0x259b:
      fillFrac(out, x, y, cellW, cellH, 0, 1, 0, 0.5, color);
      fillFrac(out, x, y, cellW, cellH, 0, 0.5, 0.5, 1, color);
      return true;
    case 0x259c:
      fillFrac(out, x, y, cellW, cellH, 0, 1, 0, 0.5, color);
      fillFrac(out, x, y, cellW, cellH, 0.5, 1, 0.5, 1, color);
      return true;
    case 0x259d:
      fillFrac(out, x, y, cellW, cellH, 0.5, 1, 0, 0.5, color);
      return true;
    case 0x259e:
      fillFrac(out, x, y, cellW, cellH, 0.5, 1, 0, 0.5, color);
      fillFrac(out, x, y, cellW, cellH, 0, 0.5, 0.5, 1, color);
      return true;
    case 0x259f:
      fillFrac(out, x, y, cellW, cellH, 0.5, 1, 0, 1, color);
      fillFrac(out, x, y, cellW, cellH, 0, 0.5, 0.5, 1, color);
      return true;
    default:
      return false;
  }
}
