import { BOX_LINE_MAP } from "../box-drawing-map";
import { pushRectBox, pushRectSnapped } from "./geometry";
import {
  BOX_STYLE_DOUBLE,
  BOX_STYLE_HEAVY,
  BOX_STYLE_LIGHT,
  BOX_STYLE_NONE,
  type Color,
  type RectData,
} from "./types";

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
    const light = lightStroke;
    const heavy = heavyStroke;
    const cellWInt = Math.max(1, Math.round(cellW));
    const cellHInt = Math.max(1, Math.round(cellH));
    const satSub = (a: number, b: number) => (a > b ? a - b : 0);

    // Mirror Ghostty dash tiling so adjacent cells compose into even dash rhythm.
    const dashedH = (count: number, thickness: number, desiredGap: number) => {
      const thickPx = Math.max(1, Math.round(thickness));
      const gapCount = count;
      if (cellWInt < count + gapCount) {
        const y0 = y + Math.floor(satSub(cellHInt, thickPx) / 2);
        pushRectBox(out, x, y0, cellWInt, thickPx, color);
        return;
      }
      const maxGap = Math.floor(cellWInt / (2 * count));
      const gapWidth = Math.min(Math.max(1, Math.round(desiredGap)), maxGap);
      const totalGapWidth = gapCount * gapWidth;
      const totalDashWidth = cellWInt - totalGapWidth;
      const dashWidth = Math.floor(totalDashWidth / count);
      let extra = totalDashWidth % count;
      const y0 = y + Math.floor(satSub(cellHInt, thickPx) / 2);
      let px = x + Math.floor(gapWidth / 2);
      for (let i = 0; i < count; i += 1) {
        let seg = dashWidth;
        if (extra > 0) {
          seg += 1;
          extra -= 1;
        }
        pushRectBox(out, px, y0, seg, thickPx, color);
        px += seg + gapWidth;
      }
    };

    const dashedV = (count: number, thickness: number, desiredGap: number) => {
      const thickPx = Math.max(1, Math.round(thickness));
      const gapCount = count;
      if (cellHInt < count + gapCount) {
        const x0 = x + Math.floor(satSub(cellWInt, thickPx) / 2);
        pushRectBox(out, x0, y, thickPx, cellHInt, color);
        return;
      }
      const maxGap = Math.floor(cellHInt / (2 * count));
      const gapHeight = Math.min(Math.max(1, Math.round(desiredGap)), maxGap);
      const totalGapHeight = gapCount * gapHeight;
      const totalDashHeight = cellHInt - totalGapHeight;
      const dashHeight = Math.floor(totalDashHeight / count);
      let extra = totalDashHeight % count;
      const x0 = x + Math.floor(satSub(cellWInt, thickPx) / 2);
      let py = y;
      for (let i = 0; i < count; i += 1) {
        let seg = dashHeight;
        if (extra > 0) {
          seg += 1;
          extra -= 1;
        }
        pushRectBox(out, x0, py, thickPx, seg, color);
        py += seg + gapHeight;
      }
    };

    const drawDiagonal = (dir: "ul_lr" | "ur_ll") => {
      const thickness = light;
      const steps = Math.max(2, Math.round(Math.max(cellW, cellH)));
      for (let i = 0; i < steps; i += 1) {
        const t = steps === 1 ? 0 : i / (steps - 1);
        const px = dir === "ul_lr" ? x + t * cellW : x + (1 - t) * cellW;
        const py = y + t * cellH;
        pushRectBox(out, px - thickness * 0.5, py - thickness * 0.5, thickness, thickness, color);
      }
    };

    const drawRoundedCorner = (cornerCp: 0x256d | 0x256e | 0x256f | 0x2570) => {
      // Mirror Ghostty's rounded box corners: cubic centerline + butt-capped stroke.
      const thickness = Math.max(1, Math.round(light));
      const half = thickness * 0.5;
      const s = 0.25;
      const cx = x + Math.floor((cellW - thickness) * 0.5) + half;
      const cy = y + Math.floor((cellH - thickness) * 0.5) + half;
      const r = Math.min(cellW, cellH) * 0.5;

      type Point = { x: number; y: number };
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

      type Segment = {
        ax: number;
        ay: number;
        ux: number;
        uy: number;
        nx: number;
        ny: number;
        len: number;
      };
      const segments: Segment[] = [];
      const addSegment = (a: Point, b: Point) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len <= 1e-6) return;
        const ux = dx / len;
        const uy = dy / len;
        segments.push({ ax: a.x, ay: a.y, ux, uy, nx: -uy, ny: ux, len });
      };

      const cubicPoint = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const t2 = t * t;
        return {
          x: mt2 * mt * a.x + 3 * mt2 * t * b.x + 3 * mt * t2 * c.x + t2 * t * d.x,
          y: mt2 * mt * a.y + 3 * mt2 * t * b.y + 3 * mt * t2 * c.y + t2 * t * d.y,
        };
      };

      const steps = Math.max(10, Math.round(Math.max(cellW, cellH) * 1.5));
      const curvePoints: Point[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        curvePoints.push(cubicPoint(p1, c1, c2, p2, t));
      }

      addSegment(p0, p1);
      for (let i = 1; i < curvePoints.length; i += 1) {
        addSegment(curvePoints[i - 1]!, curvePoints[i]!);
      }
      addSegment(p3, p4);

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

      const sampleOffsets: ReadonlyArray<readonly [number, number]> = [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ];

      const sampleInsideStroke = (sx: number, sy: number): boolean => {
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

      for (let py = minY; py <= maxY; py += 1) {
        let runX = -1;
        let runCoverage = 0;
        for (let px = minX; px <= maxX; px += 1) {
          let coverage = 0;
          for (const [ox, oy] of sampleOffsets) {
            if (sampleInsideStroke(px + ox, py + oy)) coverage += 1;
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
    };

    switch (cp) {
      case 0x2504:
        dashedH(3, light, Math.max(4, light));
        return true;
      case 0x2505:
        dashedH(3, heavy, Math.max(4, light));
        return true;
      case 0x2508:
        dashedH(4, light, Math.max(4, light));
        return true;
      case 0x2509:
        dashedH(4, heavy, Math.max(4, light));
        return true;
      case 0x2506:
        dashedV(3, light, Math.max(4, light));
        return true;
      case 0x2507:
        dashedV(3, heavy, Math.max(4, light));
        return true;
      case 0x250a:
        dashedV(4, light, Math.max(4, light));
        return true;
      case 0x250b:
        dashedV(4, heavy, Math.max(4, light));
        return true;
      case 0x254c:
        dashedH(2, light, light);
        return true;
      case 0x254d:
        dashedH(2, heavy, heavy);
        return true;
      case 0x254e:
        dashedV(2, light, heavy);
        return true;
      case 0x254f:
        dashedV(2, heavy, heavy);
        return true;
      case 0x256d:
      case 0x256e:
      case 0x256f:
      case 0x2570:
        drawRoundedCorner(cp);
        return true;
      case 0x2571:
        drawDiagonal("ur_ll");
        return true;
      case 0x2572:
        drawDiagonal("ul_lr");
        return true;
      case 0x2573:
        drawDiagonal("ul_lr");
        drawDiagonal("ur_ll");
        return true;
      default:
        return false;
    }
  }

  const [up, right, down, left] = spec;
  const light = lightStroke;
  const heavy = heavyStroke;
  const cellWInt = Math.max(1, Math.round(cellW));
  const cellHInt = Math.max(1, Math.round(cellH));

  const satSub = (a: number, b: number) => (a > b ? a - b : 0);
  const hLightTop = Math.floor(satSub(cellHInt, light) / 2);
  const hLightBottom = hLightTop + light;
  const hHeavyTop = Math.floor(satSub(cellHInt, heavy) / 2);
  const hHeavyBottom = hHeavyTop + heavy;
  const hDoubleTop = satSub(hLightTop, light);
  const hDoubleBottom = hLightBottom + light;

  const vLightLeft = Math.floor(satSub(cellWInt, light) / 2);
  const vLightRight = vLightLeft + light;
  const vHeavyLeft = Math.floor(satSub(cellWInt, heavy) / 2);
  const vHeavyRight = vHeavyLeft + heavy;
  const vDoubleLeft = satSub(vLightLeft, light);
  const vDoubleRight = vLightRight + light;

  const upBottom =
    left === BOX_STYLE_HEAVY || right === BOX_STYLE_HEAVY
      ? hHeavyBottom
      : left !== right || down === up
        ? left === BOX_STYLE_DOUBLE || right === BOX_STYLE_DOUBLE
          ? hDoubleBottom
          : hLightBottom
        : left === BOX_STYLE_NONE && right === BOX_STYLE_NONE
          ? hLightBottom
          : hLightTop;

  const downTop =
    left === BOX_STYLE_HEAVY || right === BOX_STYLE_HEAVY
      ? hHeavyTop
      : left !== right || up === down
        ? left === BOX_STYLE_DOUBLE || right === BOX_STYLE_DOUBLE
          ? hDoubleTop
          : hLightTop
        : left === BOX_STYLE_NONE && right === BOX_STYLE_NONE
          ? hLightTop
          : hLightBottom;

  const leftRight =
    up === BOX_STYLE_HEAVY || down === BOX_STYLE_HEAVY
      ? vHeavyRight
      : up !== down || left === right
        ? up === BOX_STYLE_DOUBLE || down === BOX_STYLE_DOUBLE
          ? vDoubleRight
          : vLightRight
        : up === BOX_STYLE_NONE && down === BOX_STYLE_NONE
          ? vLightRight
          : vLightLeft;

  const rightLeft =
    up === BOX_STYLE_HEAVY || down === BOX_STYLE_HEAVY
      ? vHeavyLeft
      : up !== down || right === left
        ? up === BOX_STYLE_DOUBLE || down === BOX_STYLE_DOUBLE
          ? vDoubleLeft
          : vLightLeft
        : up === BOX_STYLE_NONE && down === BOX_STYLE_NONE
          ? vLightLeft
          : vLightRight;

  const drawBox = (x0: number, y0: number, x1: number, y1: number) => {
    if (x1 <= x0 || y1 <= y0) return;
    pushRectSnapped(out, x + x0, y + y0, x1 - x0, y1 - y0, color);
  };

  const drawHorizontalBand = (style: number) => {
    if (style === BOX_STYLE_LIGHT) {
      drawBox(0, hLightTop, cellWInt, hLightBottom);
      return;
    }
    if (style === BOX_STYLE_HEAVY) {
      drawBox(0, hHeavyTop, cellWInt, hHeavyBottom);
      return;
    }
    if (style === BOX_STYLE_DOUBLE) {
      drawBox(0, hDoubleTop, cellWInt, hLightTop);
      drawBox(0, hLightBottom, cellWInt, hDoubleBottom);
    }
  };

  const drawVerticalBand = (style: number) => {
    if (style === BOX_STYLE_LIGHT) {
      drawBox(vLightLeft, 0, vLightRight, cellHInt);
      return;
    }
    if (style === BOX_STYLE_HEAVY) {
      drawBox(vHeavyLeft, 0, vHeavyRight, cellHInt);
      return;
    }
    if (style === BOX_STYLE_DOUBLE) {
      drawBox(vDoubleLeft, 0, vLightLeft, cellHInt);
      drawBox(vLightRight, 0, vDoubleRight, cellHInt);
    }
  };

  // Fast path for pure straight lines to avoid overlapping rects in instance output.
  if (
    up === BOX_STYLE_NONE &&
    down === BOX_STYLE_NONE &&
    left !== BOX_STYLE_NONE &&
    left === right
  ) {
    drawHorizontalBand(left);
    return true;
  }
  if (left === BOX_STYLE_NONE && right === BOX_STYLE_NONE && up !== BOX_STYLE_NONE && up === down) {
    drawVerticalBand(up);
    return true;
  }

  switch (up) {
    case BOX_STYLE_NONE:
      break;
    case BOX_STYLE_LIGHT:
      drawBox(vLightLeft, 0, vLightRight, upBottom);
      break;
    case BOX_STYLE_HEAVY:
      drawBox(vHeavyLeft, 0, vHeavyRight, upBottom);
      break;
    case BOX_STYLE_DOUBLE: {
      const leftBottom = left === BOX_STYLE_DOUBLE ? hLightTop : upBottom;
      const rightBottom = right === BOX_STYLE_DOUBLE ? hLightTop : upBottom;
      drawBox(vDoubleLeft, 0, vLightLeft, leftBottom);
      drawBox(vLightRight, 0, vDoubleRight, rightBottom);
      break;
    }
  }

  switch (right) {
    case BOX_STYLE_NONE:
      break;
    case BOX_STYLE_LIGHT:
      drawBox(rightLeft, hLightTop, cellWInt, hLightBottom);
      break;
    case BOX_STYLE_HEAVY:
      drawBox(rightLeft, hHeavyTop, cellWInt, hHeavyBottom);
      break;
    case BOX_STYLE_DOUBLE: {
      const topLeft = up === BOX_STYLE_DOUBLE ? vLightRight : rightLeft;
      const bottomLeft = down === BOX_STYLE_DOUBLE ? vLightRight : rightLeft;
      drawBox(topLeft, hDoubleTop, cellWInt, hLightTop);
      drawBox(bottomLeft, hLightBottom, cellWInt, hDoubleBottom);
      break;
    }
  }

  switch (down) {
    case BOX_STYLE_NONE:
      break;
    case BOX_STYLE_LIGHT:
      drawBox(vLightLeft, downTop, vLightRight, cellHInt);
      break;
    case BOX_STYLE_HEAVY:
      drawBox(vHeavyLeft, downTop, vHeavyRight, cellHInt);
      break;
    case BOX_STYLE_DOUBLE: {
      const leftTop = left === BOX_STYLE_DOUBLE ? hLightBottom : downTop;
      const rightTop = right === BOX_STYLE_DOUBLE ? hLightBottom : downTop;
      drawBox(vDoubleLeft, leftTop, vLightLeft, cellHInt);
      drawBox(vLightRight, rightTop, vDoubleRight, cellHInt);
      break;
    }
  }

  switch (left) {
    case BOX_STYLE_NONE:
      break;
    case BOX_STYLE_LIGHT:
      drawBox(0, hLightTop, leftRight, hLightBottom);
      break;
    case BOX_STYLE_HEAVY:
      drawBox(0, hHeavyTop, leftRight, hHeavyBottom);
      break;
    case BOX_STYLE_DOUBLE: {
      const topRight = up === BOX_STYLE_DOUBLE ? vLightLeft : leftRight;
      const bottomRight = down === BOX_STYLE_DOUBLE ? vLightLeft : leftRight;
      drawBox(0, hDoubleTop, topRight, hLightTop);
      drawBox(0, hLightBottom, bottomRight, hDoubleBottom);
      break;
    }
  }

  return true;
}
