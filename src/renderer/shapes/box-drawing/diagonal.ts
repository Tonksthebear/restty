import { pushRectBox } from "../geometry";
import type { Color, RectData } from "../types";

export function drawDiagonal(
  dir: "ul_lr" | "ur_ll",
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  light: number,
  color: Color,
  out: RectData,
): void {
  const thickness = light;
  const steps = Math.max(2, Math.round(Math.max(cellW, cellH)));
  for (let i = 0; i < steps; i += 1) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const px = dir === "ul_lr" ? x + t * cellW : x + (1 - t) * cellW;
    const py = y + t * cellH;
    pushRectBox(out, px - thickness * 0.5, py - thickness * 0.5, thickness, thickness, color);
  }
}
