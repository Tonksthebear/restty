import type { Color, RectData } from "./types";

/** Return a new color with its alpha channel multiplied by the given factor. */
export function applyAlpha(color: Color, alpha: number): Color {
  return [color[0], color[1], color[2], color[3] * alpha];
}

/** Append a rect instance (position, size, color) to the output array. */
export function pushRect(
  out: RectData,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Color,
): void {
  out.push(x, y, w, h, color[0], color[1], color[2], color[3]);
}

/** Append a rect snapped to pixel boundaries (floor origin, ceil extent). */
export function pushRectSnapped(
  out: RectData,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Color,
): void {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.ceil(x + w);
  const y1 = Math.ceil(y + h);
  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1 - y0);
  if (width <= 0 || height <= 0) return;
  out.push(x0, y0, width, height, color[0], color[1], color[2], color[3]);
}

/** Append a rect with rounded position and at-least-1px dimensions for box drawing. */
export function pushRectBox(
  out: RectData,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Color,
): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  if (width <= 0 || height <= 0) return;
  out.push(x0, y0, width, height, color[0], color[1], color[2], color[3]);
}
