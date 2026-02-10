import { isGraphicsElementCodepoint, isSymbolLikeCodepoint } from "../../unicode/symbols";

/** Test whether a codepoint falls in a Unicode Private Use Area. */
export function isPrivateUse(cp: number): boolean {
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) ||
    (cp >= 0xf0000 && cp <= 0xffffd) ||
    (cp >= 0x100000 && cp <= 0x10fffd)
  );
}

/** Test whether a codepoint is a space-like character (NUL, SP, or EN SPACE). */
export function isSpaceCp(cp: number): boolean {
  return cp === 0 || cp === 0x20 || cp === 0x2002;
}

/** Test whether a codepoint is in the Box Drawing block (U+2500-U+257F). */
export function isBoxDrawing(cp: number): boolean {
  return cp >= 0x2500 && cp <= 0x257f;
}

/** Test whether a codepoint is in the Block Elements block (U+2580-U+259F). */
export function isBlockElement(cp: number): boolean {
  return cp >= 0x2580 && cp <= 0x259f;
}

/** Test whether a codepoint is in the Legacy Computing Symbols blocks. */
export function isLegacyComputing(cp: number): boolean {
  return (cp >= 0x1fb00 && cp <= 0x1fbff) || (cp >= 0x1cc00 && cp <= 0x1cebf);
}

/** Test whether a codepoint is a Powerline symbol (U+E0B0-U+E0D7). */
export function isPowerline(cp: number): boolean {
  return cp >= 0xe0b0 && cp <= 0xe0d7;
}

/** Test whether a codepoint is in the Braille Patterns block (U+2800-U+28FF). */
export function isBraille(cp: number): boolean {
  return cp >= 0x2800 && cp <= 0x28ff;
}

/** Test whether a codepoint is any GPU-drawable graphics element (box, block, legacy, powerline). */
export function isGraphicsElement(cp: number): boolean {
  return isGraphicsElementCodepoint(cp);
}

/** Test whether a codepoint is a symbol that may need special rendering (PUA or graphics). */
export function isSymbolCp(cp: number): boolean {
  return isSymbolLikeCodepoint(cp);
}
