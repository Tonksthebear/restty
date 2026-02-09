import { GHOSTTY_SYMBOL_RANGES } from "./ghostty-symbol-ranges";

/** True when cp is a Ghostty "graphics element" handled specially in renderer logic. */
export function isGraphicsElementCodepoint(cp: number): boolean {
  const isBoxDrawing = cp >= 0x2500 && cp <= 0x257f;
  const isBlockElement = cp >= 0x2580 && cp <= 0x259f;
  const isLegacyComputing = (cp >= 0x1fb00 && cp <= 0x1fbff) || (cp >= 0x1cc00 && cp <= 0x1cebf);
  const isPowerline = cp >= 0xe0b0 && cp <= 0xe0d7;
  return isBoxDrawing || isBlockElement || isLegacyComputing || isPowerline;
}

/** True when cp is in Ghostty's generated is_symbol lookup table. */
export function isGhosttySymbolCodepoint(cp: number): boolean {
  if (!Number.isFinite(cp)) return false;
  const codepoint = Math.trunc(cp);
  if (codepoint < 0 || codepoint > 0x10ffff) return false;
  return isCodepointInRanges(codepoint, GHOSTTY_SYMBOL_RANGES);
}

/** Symbol-like codepoint for renderer constraint/fit behavior. */
export function isSymbolLikeCodepoint(cp: number): boolean {
  return isGraphicsElementCodepoint(cp) || isGhosttySymbolCodepoint(cp);
}

function isCodepointInRanges(
  cp: number,
  ranges: ReadonlyArray<readonly [number, number]>,
): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const range = ranges[mid];
    const start = range[0];
    const end = range[1];
    if (cp < start) {
      hi = mid - 1;
      continue;
    }
    if (cp > end) {
      lo = mid + 1;
      continue;
    }
    return true;
  }
  return false;
}
