import type { CreateRuntimeDebugToolsOptions } from "./types";

export function createDiagnoseCodepoint(options: CreateRuntimeDebugToolsOptions) {
  const {
    formatCodepoint,
    isNerdSymbolCodepoint,
    isSymbolCp,
    fontState,
    isSymbolFont,
    fontHasGlyph,
    pickFontIndexForText,
    shapeClusterWithFont,
    getNerdConstraint,
  } = options;

  return function diagnoseCodepoint(cp: number): void {
    console.group(`Diagnosing codepoint ${formatCodepoint(cp)}`);

    const isNerd = isNerdSymbolCodepoint(cp);
    const isSymbol = isSymbolCp(cp);
    console.log(`isNerdSymbolCodepoint: ${isNerd}, isSymbolCp: ${isSymbol}`);

    console.log(`Total fonts loaded: ${fontState.fonts.length}`);
    fontState.fonts.forEach((entry, idx) => {
      if (!entry?.font) {
        console.log(`  Font ${idx}: not loaded`);
        return;
      }
      const label = entry.label || "unknown";
      const isSym = isSymbolFont(entry);
      const text = String.fromCodePoint(cp);
      const hasGlyph = fontHasGlyph(entry.font, text);
      const glyphId = entry.font.glyphIdForChar(text);
      console.log(
        `  Font ${idx}: "${label}" isSymbolFont=${isSym} hasGlyph=${hasGlyph} glyphId=${glyphId}`,
      );
    });

    const text = String.fromCodePoint(cp);
    const pickedIndex = pickFontIndexForText(text, 1);
    const pickedEntry = fontState.fonts[pickedIndex];
    console.log(`Picked font index: ${pickedIndex} (${pickedEntry?.label || "none"})`);

    if (pickedEntry?.font) {
      const shaped = shapeClusterWithFont(pickedEntry, text);
      console.log(`Shaped glyphs: ${shaped.glyphs.length}, advance: ${shaped.advance}`);
      shaped.glyphs.forEach((glyph, index) => {
        console.log(
          `  Glyph ${index}: id=${glyph.glyphId} xAdvance=${glyph.xAdvance} xOffset=${glyph.xOffset} yOffset=${glyph.yOffset}`,
        );
      });
    }

    const constraint = getNerdConstraint(cp);
    console.log("Nerd constraint:", constraint || "none");
    console.groupEnd();
  };
}
