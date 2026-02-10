import { pushRectBox } from "../geometry";
import type { Color, RectData } from "../types";

type Point = { x: number; y: number };
type Segment = {
  ax: number;
  ay: number;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  len: number;
};

const sampleOffsets: ReadonlyArray<readonly [number, number]> = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
];

const cubicPoint = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * a.x + 3 * mt2 * t * b.x + 3 * mt * t2 * c.x + t2 * t * d.x,
    y: mt2 * mt * a.y + 3 * mt2 * t * b.y + 3 * mt * t2 * c.y + t2 * t * d.y,
  };
};

const addSegment = (segments: Segment[], a: Point, b: Point): void => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-6) return;
  const ux = dx / len;
  const uy = dy / len;
  segments.push({ ax: a.x, ay: a.y, ux, uy, nx: -uy, ny: ux, len });
};

const sampleInsideStroke = (sx: number, sy: number, segments: Segment[], half: number): boolean => {
  for (const seg of segments) {
    const rx = sx - seg.ax;
    const ry = sy - seg.ay;
    const along = rx * seg.ux + ry * seg.uy;
    if (along < 0 || along > seg.len) continue;
    const perp = Math.abs(rx * seg.nx + ry * seg.ny);
    if (perp <= half + 1e-6) return true;
  }
  return false;
};

export function drawRoundedCorner(
  cornerCp: 0x256d | 0x256e | 0x256f | 0x2570,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  light: number,
  color: Color,
  out: RectData,
): void {
  // Mirror Ghostty's rounded box corners: cubic centerline + butt-capped stroke.
  const thickness = Math.max(1, Math.round(light));
  const half = thickness * 0.5;
  const s = 0.25;
  const cx = x + Math.floor((cellW - thickness) * 0.5) + half;
  const cy = y + Math.floor((cellH - thickness) * 0.5) + half;
  const r = Math.min(cellW, cellH) * 0.5;

  const p0: Point = { x: cx, y };
  const p1: Point = { x: cx, y: cy - r };
  const c1: Point = { x: cx, y: cy - s * r };
  const c2: Point = { x: cx, y: cy };
  const p2: Point = { x: cx, y: cy };
  const p3: Point = { x: cx, y: cy };
  let p4: Point = { x: x + cellW, y: cy };

  switch (cornerCp) {
    case 0x256d: // ╭
      p0.y = y + cellH;
      p1.y = cy + r;
      c1.y = cy + s * r;
      c2.x = cx + s * r;
      p2.x = cx + r;
      p3.x = cx + r;
      p4 = { x: x + cellW, y: cy };
      break;
    case 0x256e: // ╮
      p0.y = y + cellH;
      p1.y = cy + r;
      c1.y = cy + s * r;
      c2.x = cx - s * r;
      p2.x = cx - r;
      p3.x = cx - r;
      p4 = { x, y: cy };
      break;
    case 0x256f: // ╯
      c2.x = cx - s * r;
      p2.x = cx - r;
      p3.x = cx - r;
      p4 = { x, y: cy };
      break;
    case 0x2570: // ╰
      c2.x = cx + s * r;
      p2.x = cx + r;
      p3.x = cx + r;
      p4 = { x: x + cellW, y: cy };
      break;
  }

  const steps = Math.max(10, Math.round(Math.max(cellW, cellH) * 1.5));
  const curvePoints: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    curvePoints.push(cubicPoint(p1, c1, c2, p2, t));
  }

  const segments: Segment[] = [];
  addSegment(segments, p0, p1);
  for (let i = 1; i < curvePoints.length; i += 1) {
    addSegment(segments, curvePoints[i - 1]!, curvePoints[i]!);
  }
  addSegment(segments, p3, p4);

  const minX = Math.max(Math.floor(x), Math.floor(Math.min(p0.x, p4.x, cx - r) - half - 1));
  const maxX = Math.min(
    Math.ceil(x + cellW) - 1,
    Math.ceil(Math.max(p0.x, p4.x, cx + r) + half + 1),
  );
  const minY = Math.max(Math.floor(y), Math.floor(Math.min(p0.y, p4.y, cy - r) - half - 1));
  const maxY = Math.min(
    Math.ceil(y + cellH) - 1,
    Math.ceil(Math.max(p0.y, p4.y, cy + r) + half + 1),
  );
  if (maxX < minX || maxY < minY) return;

  for (let py = minY; py <= maxY; py += 1) {
    let runX = -1;
    let runCoverage = 0;
    for (let px = minX; px <= maxX; px += 1) {
      let coverage = 0;
      for (const [ox, oy] of sampleOffsets) {
        if (sampleInsideStroke(px + ox, py + oy, segments, half)) coverage += 1;
      }
      if (coverage > 0 && runX < 0) {
        runX = px;
        runCoverage = coverage;
        continue;
      }
      if (coverage > 0 && coverage === runCoverage) continue;
      if (runX >= 0) {
        const alphaColor: Color = [
          color[0],
          color[1],
          color[2],
          color[3] * (runCoverage / sampleOffsets.length),
        ];
        pushRectBox(out, runX, py, px - runX, 1, alphaColor);
        runX = coverage > 0 ? px : -1;
        runCoverage = coverage;
      }
    }
    if (runX >= 0) {
      const alphaColor: Color = [
        color[0],
        color[1],
        color[2],
        color[3] * (runCoverage / sampleOffsets.length),
      ];
      pushRectBox(out, runX, py, maxX - runX + 1, 1, alphaColor);
    }
  }
}
