import { isPowerline } from "./classify";
import { pushRectSnapped } from "./geometry";
import type { Color, RectData } from "./types";

/** Rasterize a Powerline glyph (U+E0B0-U+E0D7) into rect scanline instances. */
export function drawPowerline(
  cp: number,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  color: Color,
  out: RectData,
): boolean {
  if (!isPowerline(cp)) return false;

  const w = cellW;
  const h = cellH;
  const steps = Math.max(2, Math.round(Math.max(w, h)));

  const drawTriangle = (mode: string) => {
    for (let i = 0; i < steps; i += 1) {
      const t = steps === 1 ? 0 : i / (steps - 1);
      const py = y + t * h;
      let x0 = x;
      let x1 = x + w;
      if (mode === "right") {
        const span = w * (1 - Math.abs(t - 0.5) * 2);
        x1 = x + span;
      } else if (mode === "left") {
        const span = w * (1 - Math.abs(t - 0.5) * 2);
        x0 = x + (w - span);
      } else if (mode === "diag_ul_lr") {
        x1 = x + t * w;
      } else if (mode === "diag_ur_ll") {
        x0 = x + t * w;
      } else if (mode === "diag_ul_lr_inv") {
        x1 = x + (1 - t) * w;
      } else if (mode === "diag_ur_ll_inv") {
        x0 = x + (1 - t) * w;
      }
      pushRectSnapped(out, x0, py, Math.max(1, x1 - x0), 1, color);
    }
  };

  switch (cp) {
    case 0xe0b0:
      drawTriangle("right");
      return true;
    case 0xe0b2:
      drawTriangle("left");
      return true;
    case 0xe0b8:
      drawTriangle("diag_ul_lr");
      return true;
    case 0xe0ba:
      drawTriangle("diag_ur_ll");
      return true;
    case 0xe0bc:
      drawTriangle("diag_ul_lr_inv");
      return true;
    case 0xe0be:
      drawTriangle("diag_ur_ll_inv");
      return true;
    case 0xe0b9:
    case 0xe0bb:
    case 0xe0bd:
    case 0xe0bf:
    case 0xe0b1:
    case 0xe0b3:
      drawTriangle(cp === 0xe0b9 || cp === 0xe0bf ? "diag_ul_lr" : "diag_ur_ll");
      return true;
    default:
      return false;
  }
}
