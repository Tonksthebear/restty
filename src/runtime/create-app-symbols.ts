import { getNerdConstraint, type NerdConstraint } from "../fonts";
import { isSymbolCp } from "../renderer";
import type { ResttyTouchSelectionMode } from "./types";

const RENDERER_SYMBOL_FALLBACK_RANGES: ReadonlyArray<readonly [number, number]> = [
  // Miscellaneous Technical: includes symbols like ⏎/⏵ used by prompts.
  [0x2300, 0x23ff],
  // Geometric Shapes: includes boxed/dot indicators often used in prompts.
  [0x25a0, 0x25ff],
  // Misc Symbols and Arrows: additional modern prompt icon block.
  [0x2b00, 0x2bff],
];

export const DEFAULT_SYMBOL_CONSTRAINT: NerdConstraint = {
  // For non-Nerd symbol-like glyphs in fallback fonts, center inside the cell
  // to reduce baseline drift caused by mismatched font metrics.
  size: "fit",
  align_horizontal: "center",
  align_vertical: "center",
  max_constraint_width: 1,
};

export const DEFAULT_APPLE_SYMBOLS_CONSTRAINT: NerdConstraint = {
  // Apple Symbols tends to render UI arrows/icons smaller than terminal-native
  // output. Use cover for closer parity.
  size: "cover",
  align_horizontal: "center",
  align_vertical: "center",
  max_constraint_width: 1,
};

export const DEFAULT_EMOJI_CONSTRAINT: NerdConstraint = {
  // Match Ghostty's emoji treatment: maximize size, preserve aspect, center.
  size: "cover",
  align_horizontal: "center",
  align_vertical: "center",
  pad_left: 0.025,
  pad_right: 0.025,
};

export function normalizeTouchSelectionMode(
  value: ResttyTouchSelectionMode | undefined,
): ResttyTouchSelectionMode {
  if (value === "drag" || value === "long-press" || value === "off") return value;
  return "long-press";
}

export function clampFiniteNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  round = false,
): number {
  if (!Number.isFinite(value)) return fallback;
  const numeric = round ? Math.round(value as number) : Number(value);
  return Math.min(max, Math.max(min, numeric));
}

export function isRenderSymbolLike(cp: number): boolean {
  return isSymbolCp(cp) || isRendererSymbolFallbackRange(cp);
}

export function resolveSymbolConstraint(cp: number): NerdConstraint | null {
  return getNerdConstraint(cp);
}

export function isRendererSymbolFallbackRange(cp: number): boolean {
  for (let i = 0; i < RENDERER_SYMBOL_FALLBACK_RANGES.length; i += 1) {
    const [start, end] = RENDERER_SYMBOL_FALLBACK_RANGES[i];
    if (cp >= start && cp <= end) return true;
  }
  return false;
}

export function rendererSymbolFallbackRanges(): ReadonlyArray<readonly [number, number]> {
  return RENDERER_SYMBOL_FALLBACK_RANGES;
}
