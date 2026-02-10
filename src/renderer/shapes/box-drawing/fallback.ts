import type { Color, RectData } from "../types";
import { drawDashedHorizontal, drawDashedVertical } from "./dashed-lines";
import { drawDiagonal } from "./diagonal";
import { drawRoundedCorner } from "./rounded-corner";

export function drawFallbackBoxDrawing(
  cp: number,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  color: Color,
  out: RectData,
  light: number,
  heavy: number,
): boolean {
  const cellWInt = Math.max(1, Math.round(cellW));
  const cellHInt = Math.max(1, Math.round(cellH));

  // Mirror Ghostty dash tiling so adjacent cells compose into even dash rhythm.
  switch (cp) {
    case 0x2504:
      drawDashedHorizontal(3, light, Math.max(4, light), x, y, cellWInt, cellHInt, color, out);
      return true;
    case 0x2505:
      drawDashedHorizontal(3, heavy, Math.max(4, light), x, y, cellWInt, cellHInt, color, out);
      return true;
    case 0x2508:
      drawDashedHorizontal(4, light, Math.max(4, light), x, y, cellWInt, cellHInt, color, out);
      return true;
    case 0x2509:
      drawDashedHorizontal(4, heavy, Math.max(4, light), x, y, cellWInt, cellHInt, color, out);
      return true;
    case 0x2506:
      drawDashedVertical(3, light, Math.max(4, light), x, y, cellWInt, cellHInt, color, out);
      return true;
    case 0x2507:
      drawDashedVertical(3, heavy, Math.max(4, light), x, y, cellWInt, cellHInt, color, out);
      return true;
    case 0x250a:
      drawDashedVertical(4, light, Math.max(4, light), x, y, cellWInt, cellHInt, color, out);
      return true;
    case 0x250b:
      drawDashedVertical(4, heavy, Math.max(4, light), x, y, cellWInt, cellHInt, color, out);
      return true;
    case 0x254c:
      drawDashedHorizontal(2, light, light, x, y, cellWInt, cellHInt, color, out);
      return true;
    case 0x254d:
      drawDashedHorizontal(2, heavy, heavy, x, y, cellWInt, cellHInt, color, out);
      return true;
    case 0x254e:
      drawDashedVertical(2, light, heavy, x, y, cellWInt, cellHInt, color, out);
      return true;
    case 0x254f:
      drawDashedVertical(2, heavy, heavy, x, y, cellWInt, cellHInt, color, out);
      return true;
    case 0x256d:
    case 0x256e:
    case 0x256f:
    case 0x2570:
      drawRoundedCorner(cp, x, y, cellW, cellH, light, color, out);
      return true;
    case 0x2571:
      drawDiagonal("ur_ll", x, y, cellW, cellH, light, color, out);
      return true;
    case 0x2572:
      drawDiagonal("ul_lr", x, y, cellW, cellH, light, color, out);
      return true;
    case 0x2573:
      drawDiagonal("ul_lr", x, y, cellW, cellH, light, color, out);
      drawDiagonal("ur_ll", x, y, cellW, cellH, light, color, out);
      return true;
    default:
      return false;
  }
}
