import { atlasRegionToImageData } from "../atlas-debug-utils";
import type { CreateRuntimeDebugToolsOptions } from "./types";

export function createDumpAtlasForCodepoint(options: CreateRuntimeDebugToolsOptions) {
  const {
    getActiveState,
    atlasCanvas,
    atlasInfoEl,
    pickFontIndexForText,
    fontState,
    formatCodepoint,
    ensureAtlasForFont,
    gridState,
    fontConfig,
    isSymbolFont,
    symbolAtlasPadding,
    atlasPadding,
    pixelModeGray,
    pixelModeRgba,
  } = options;

  return function dumpAtlasForCodepoint(cp: number) {
    if (!atlasCanvas || !atlasInfoEl) return;
    const state = getActiveState();
    if (!state || !("device" in state)) {
      atlasInfoEl.textContent = "atlas debug unavailable (renderer not ready)";
      return;
    }

    const entryText = String.fromCodePoint(cp);
    const fontIndex = pickFontIndexForText(entryText, 1);
    const entry = fontState.fonts[fontIndex];
    if (!entry?.font) {
      atlasInfoEl.textContent = "font not ready";
      return;
    }

    const glyphId = entry.font.glyphIdForChar(entryText);
    if (!glyphId) {
      atlasInfoEl.textContent = `missing glyph for ${formatCodepoint(cp)}`;
      return;
    }

    const atlasScale = entry.atlasScale ?? 1;
    ensureAtlasForFont(
      state.device,
      state,
      entry,
      new Set([glyphId]),
      gridState.fontSizePx || fontConfig.sizePx,
      fontIndex,
      atlasScale,
    );

    const atlas = entry.atlas;
    if (!atlas) {
      atlasInfoEl.textContent = "atlas missing";
      return;
    }

    const metrics = atlas.glyphs.get(glyphId);
    if (!metrics) {
      atlasInfoEl.textContent = `glyph not in atlas (${formatCodepoint(cp)})`;
      return;
    }

    const width = Math.max(1, metrics.width);
    const height = Math.max(1, metrics.height);
    atlasCanvas.width = width;
    atlasCanvas.height = height;
    const ctx = atlasCanvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    const imageData = atlasRegionToImageData(
      atlas,
      metrics.atlasX,
      metrics.atlasY,
      width,
      height,
      pixelModeGray,
      pixelModeRgba,
    );
    ctx.putImageData(imageData, 0, 0);

    atlasInfoEl.textContent = [
      `cp ${formatCodepoint(cp)} glyph ${glyphId}`,
      `font ${fontIndex}: ${entry.label ?? "unknown"}`,
      `atlas ${atlas.bitmap.width}x${atlas.bitmap.rows} pad ${isSymbolFont(entry) ? symbolAtlasPadding : atlasPadding}`,
      `glyph ${metrics.width}x${metrics.height} bearing ${metrics.bearingX},${metrics.bearingY}`,
    ].join("\n");
  };
}
