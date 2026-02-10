import { pushRectBox } from "../geometry";
import type { Color, RectData } from "../types";

const satSub = (a: number, b: number) => (a > b ? a - b : 0);

export function drawDashedHorizontal(
  count: number,
  thickness: number,
  desiredGap: number,
  x: number,
  y: number,
  cellWInt: number,
  cellHInt: number,
  color: Color,
  out: RectData,
): void {
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
}

export function drawDashedVertical(
  count: number,
  thickness: number,
  desiredGap: number,
  x: number,
  y: number,
  cellWInt: number,
  cellHInt: number,
  color: Color,
  out: RectData,
): void {
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
}
