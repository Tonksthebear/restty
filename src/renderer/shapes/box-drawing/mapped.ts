import { pushRectSnapped } from "../geometry";
import {
  BOX_STYLE_DOUBLE,
  BOX_STYLE_HEAVY,
  BOX_STYLE_LIGHT,
  BOX_STYLE_NONE,
  type Color,
  type RectData,
} from "../types";

const satSub = (a: number, b: number) => (a > b ? a - b : 0);

export function drawMappedBoxDrawing(
  spec: readonly [number, number, number, number],
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  color: Color,
  out: RectData,
  lightStroke: number,
  heavyStroke: number,
): boolean {
  const [up, right, down, left] = spec;
  const light = lightStroke;
  const heavy = heavyStroke;
  const cellWInt = Math.max(1, Math.round(cellW));
  const cellHInt = Math.max(1, Math.round(cellH));

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
