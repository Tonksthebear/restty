import { clamp, fontHeightUnits } from "../grid";
import { getNerdConstraint, glyphWidthUnits } from "../fonts";
import { constrainGlyphBox } from "../renderer";
import type { GlyphConstraintMeta, AtlasConstraintContext } from "./atlas-builder";

const NERD_CELL_FIT_COVER_SCALE = 1.0;
const NERD_ICON_FIT_COVER_SCALE = 2 / 3;

export function bitmapBytesPerPixel(pixelMode: number): number {
  if (pixelMode === 2 || pixelMode === 3) return 3;
  if (pixelMode === 4) return 4;
  return 1;
}

export function createAtlasBitmap(width: number, height: number, pixelMode: number) {
  const bytesPerPixel = bitmapBytesPerPixel(pixelMode);
  const pitch = Math.max(1, Math.ceil(width * bytesPerPixel));
  const size = pitch * height;
  return {
    width,
    rows: height,
    pitch,
    buffer: new Uint8Array(size),
    pixelMode,
    numGrays: pixelMode === 0 ? 2 : 256,
  };
}

export function cloneBitmap(bitmap: any, defaultPixelMode = 1) {
  const pitch = bitmap?.pitch ?? 0;
  const rows = bitmap?.rows ?? 0;
  const size = pitch * rows;
  const buffer = new Uint8Array(size);
  if (bitmap?.buffer) {
    buffer.set(bitmap.buffer.subarray(0, size));
  }
  return {
    width: bitmap?.width ?? 0,
    rows,
    pitch,
    buffer,
    pixelMode: bitmap?.pixelMode ?? defaultPixelMode,
    numGrays: bitmap?.numGrays ?? 256,
  };
}

export function copyBitmapToAtlas(src: any, dst: any, dstX: number, dstY: number): void {
  const bytesPerPixel = bitmapBytesPerPixel(src.pixelMode ?? 1);
  const rowBytes = src.width * bytesPerPixel;
  for (let y = 0; y < src.rows; y += 1) {
    const srcRow = y * src.pitch;
    const dstRow = (dstY + y) * dst.pitch + dstX * bytesPerPixel;
    dst.buffer.set(src.buffer.subarray(srcRow, srcRow + rowBytes), dstRow);
  }
}

export function nextPowerOf2(n: number): number {
  if (n <= 0) return 1;
  let v = n - 1;
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  return v + 1;
}

export function packGlyphs(
  sizes: Array<{ width: number; height: number }>,
  maxWidth: number,
  maxHeight: number,
) {
  const shelves: Array<{ y: number; height: number; width: number }> = [];
  const placements: Array<{ x: number; y: number; placed: boolean }> = [];
  let atlasWidth = 0;
  let atlasHeight = 0;

  for (let i = 0; i < sizes.length; i += 1) {
    const size = sizes[i];
    let placed = false;
    let bestShelf = -1;
    let bestY = maxHeight;

    for (let j = 0; j < shelves.length; j += 1) {
      const shelf = shelves[j];
      if (shelf.width + size.width <= maxWidth && size.height <= shelf.height) {
        if (shelf.y < bestY) {
          bestShelf = j;
          bestY = shelf.y;
        }
      }
    }

    if (bestShelf >= 0) {
      const shelf = shelves[bestShelf];
      placements.push({ x: shelf.width, y: shelf.y, placed: true });
      shelf.width += size.width;
      atlasWidth = Math.max(atlasWidth, shelf.width);
      placed = true;
    } else {
      const newY = atlasHeight;
      if (newY + size.height <= maxHeight && size.width <= maxWidth) {
        shelves.push({ y: newY, height: size.height, width: size.width });
        placements.push({ x: 0, y: newY, placed: true });
        atlasHeight = newY + size.height;
        atlasWidth = Math.max(atlasWidth, size.width);
        placed = true;
      }
    }

    if (!placed) placements.push({ x: 0, y: 0, placed: false });
  }

  const finalWidth = nextPowerOf2(atlasWidth);
  const finalHeight = nextPowerOf2(atlasHeight);
  return {
    width: Math.min(finalWidth, maxWidth),
    height: Math.min(finalHeight, maxHeight),
    placements,
  };
}

export function resolveFontScaleForAtlas(
  font: any,
  fontSize: number,
  sizeMode?: string | null,
): number {
  if (font && typeof font.scaleForSize === "function") {
    return font.scaleForSize(fontSize, sizeMode ?? undefined);
  }
  const upem = font?.unitsPerEm ?? font?.upem ?? 1000;
  return upem > 0 ? fontSize / upem : 1;
}

export function fontCapHeightUnits(font: any): number {
  if (!font) return 1;

  const capFromOs2 = font?.os2?.sCapHeight ?? font?._os2?.sCapHeight;
  if (Number.isFinite(capFromOs2) && capFromOs2 > 0) return capFromOs2;

  if (typeof font.glyphIdForChar === "function" && typeof font.getGlyphBounds === "function") {
    const capGlyphId = font.glyphIdForChar("H");
    if (capGlyphId !== undefined && capGlyphId !== null && capGlyphId !== 0) {
      const bounds = font.getGlyphBounds(capGlyphId);
      const yMax = bounds?.yMax;
      if (Number.isFinite(yMax) && yMax > 0) return yMax;
      const height = (bounds?.yMax ?? 0) - (bounds?.yMin ?? 0);
      if (Number.isFinite(height) && height > 0) return height;
    }
  }

  const ascender = font?.ascender;
  if (Number.isFinite(ascender) && ascender > 0) return ascender * 0.75;

  const faceHeight = fontHeightUnits(font);
  if (Number.isFinite(faceHeight) && faceHeight > 0) return faceHeight * 0.6;

  return 1;
}

export function buildNerdMetrics(
  cellW: number,
  cellH: number,
  lineHeight: number,
  primaryFont: any,
  primaryScale: number,
  iconScale: number,
) {
  let faceWidth = cellW;
  if (
    primaryFont &&
    typeof primaryFont.glyphIdForChar === "function" &&
    typeof primaryFont.advanceWidth === "function"
  ) {
    const mGlyphId = primaryFont.glyphIdForChar("M");
    if (mGlyphId !== undefined && mGlyphId !== null && mGlyphId !== 0) {
      const width = primaryFont.advanceWidth(mGlyphId) * primaryScale;
      if (Number.isFinite(width) && width > 0) faceWidth = width;
    }
  }

  const capHeight = fontCapHeightUnits(primaryFont) * primaryScale;
  const safeIconScale = Number.isFinite(iconScale) ? Math.max(0.5, Math.min(2, iconScale)) : 1;
  const iconHeight = lineHeight * safeIconScale;
  const iconHeightSingle = clamp(((2 * capHeight + lineHeight) / 3) * safeIconScale, 1, iconHeight);

  return {
    cellWidth: cellW,
    cellHeight: cellH,
    faceWidth,
    faceHeight: lineHeight,
    faceY: (cellH - lineHeight) * 0.5,
    iconHeight,
    iconHeightSingle,
  };
}

export function nerdConstraintSignature(
  glyphMeta?: Map<number, GlyphConstraintMeta>,
  constraintContext?: AtlasConstraintContext | null,
): string {
  if (!glyphMeta?.size || !constraintContext) return "";
  const m = constraintContext.nerdMetrics;
  return [
    `ih:${m.iconHeight.toFixed(3)}`,
    `ih1:${m.iconHeightSingle.toFixed(3)}`,
    `iw:${m.cellWidth.toFixed(3)}`,
    `cw:${constraintContext.cellW.toFixed(3)}`,
    `ch:${constraintContext.cellH.toFixed(3)}`,
    `is:${NERD_ICON_FIT_COVER_SCALE.toFixed(4)}`,
    `cs:${NERD_CELL_FIT_COVER_SCALE.toFixed(4)}`,
  ].join("|");
}

function scaleGlyphBoxAroundCenter(
  box: { x: number; y: number; width: number; height: number },
  factor: number,
) {
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 1e-6) return box;
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  const w = box.width * factor;
  const h = box.height * factor;
  return {
    x: cx - w * 0.5,
    y: cy - h * 0.5,
    width: w,
    height: h,
  };
}

function scaleGlyphBoxAnchoredLeft(
  box: { x: number; y: number; width: number; height: number },
  factor: number,
) {
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 1e-6) return box;
  const w = box.width * factor;
  const h = box.height * factor;
  return {
    x: box.x,
    y: box.y + (box.height - h) * 0.5,
    width: w,
    height: h,
  };
}

export function tightenNerdConstraintBox(
  box: { x: number; y: number; width: number; height: number },
  constraint: any,
) {
  if (!constraint) return box;
  if (constraint.size !== "fit_cover1") return box;
  if (constraint.height === "icon") {
    return scaleGlyphBoxAnchoredLeft(box, NERD_ICON_FIT_COVER_SCALE);
  }
  if (constraint.height !== undefined && constraint.height !== "cell") return box;
  return scaleGlyphBoxAroundCenter(box, NERD_CELL_FIT_COVER_SCALE);
}

export function buildGlyphAtlasWithConstraints(options: {
  font: any;
  glyphIds: number[];
  fontSize: number;
  sizeMode: string;
  padding: number;
  maxWidth: number;
  maxHeight: number;
  pixelMode: number;
  hinting: boolean;
  rasterizeGlyph?: (
    font: any,
    glyphId: number,
    fontSize: number,
    options?: any,
  ) => { bitmap: any; bearingX: number; bearingY: number } | null;
  rasterizeGlyphWithTransform?: (
    font: any,
    glyphId: number,
    fontSize: number,
    matrix: number[] | number[][],
    options?: any,
  ) => { bitmap: any; bearingX: number; bearingY: number } | null;
  glyphMeta?: Map<number, GlyphConstraintMeta>;
  constraintContext?: AtlasConstraintContext;
}) {
  const {
    font,
    glyphIds,
    fontSize,
    sizeMode,
    padding,
    maxWidth,
    maxHeight,
    pixelMode,
    hinting,
    rasterizeGlyph,
    rasterizeGlyphWithTransform,
    glyphMeta,
    constraintContext,
  } = options;

  const scale = resolveFontScaleForAtlas(font, fontSize, sizeMode);
  const glyphData: Array<{
    glyphId: number;
    bitmap: any;
    bearingX: number;
    bearingY: number;
    advance: number;
    constraintWidth: number;
  }> = [];

  if (!rasterizeGlyph) {
    return { atlas: null, constrainedGlyphWidths: null };
  }

  const rasterOptions = {
    padding: 0,
    pixelMode,
    sizeMode,
    hinting,
  };

  for (let i = 0; i < glyphIds.length; i += 1) {
    const glyphId = glyphIds[i];
    const raster = rasterizeGlyph(font, glyphId, fontSize, rasterOptions);
    if (!raster) continue;

    let didConstraint = false;
    const meta = glyphMeta?.get(glyphId);
    const widthSet =
      meta?.widths && meta.widths.size
        ? Array.from(meta.widths.values())
        : [Math.max(1, meta?.constraintWidth ?? 1)];
    const widths = Array.from(new Set(widthSet.map((w) => Math.max(1, w)))).sort();
    const constraint = meta?.cp ? getNerdConstraint(meta.cp) : null;

    if (constraint && constraintContext && rasterizeGlyphWithTransform) {
      for (let j = 0; j < widths.length; j += 1) {
        const constraintWidth = widths[j];
        const maxCellWidth = constraintContext.cellW * constraintWidth;
        const maxCellHeight = constraintContext.cellH;
        let bitmapScale = 1;

        const widthUnits = glyphWidthUnits(constraintContext.fontEntry, glyphId);
        let glyphWidthPx = widthUnits * constraintContext.fontScale;
        if (!Number.isFinite(glyphWidthPx) || glyphWidthPx <= 0) {
          glyphWidthPx = raster.bitmap?.width ?? 0;
        }
        if (glyphWidthPx > 0 && maxCellWidth > 0) {
          const fit = maxCellWidth / glyphWidthPx;
          if (fit > 0 && fit < 1) bitmapScale = fit;
        }

        let gw = (raster.bitmap?.width ?? 0) * bitmapScale;
        let gh = (raster.bitmap?.rows ?? 0) * bitmapScale;
        if (gw > 0 && gh > 0 && maxCellWidth > 0 && maxCellHeight > 0) {
          const fitScale = Math.min(1, maxCellWidth / gw, maxCellHeight / gh);
          if (fitScale < 1) {
            bitmapScale *= fitScale;
            gw *= fitScale;
            gh *= fitScale;
          }
        }

        const baseY =
          constraintContext.yPad +
          constraintContext.baselineOffset +
          constraintContext.baselineAdjust;
        const scaledBox = {
          x: raster.bearingX * bitmapScale,
          y: baseY - raster.bearingY * bitmapScale,
          width: gw,
          height: gh,
        };
        const adjusted = constrainGlyphBox(
          scaledBox,
          constraint,
          constraintContext.nerdMetrics,
          constraintWidth,
        );
        const tightened = tightenNerdConstraintBox(adjusted, constraint);

        if (
          tightened.width > 0 &&
          tightened.height > 0 &&
          raster.bitmap?.width &&
          raster.bitmap?.rows
        ) {
          const targetLeft = tightened.x;
          const targetTop = baseY - tightened.y;
          const scaleX = tightened.width / raster.bitmap.width;
          const scaleY = tightened.height / raster.bitmap.rows;
          if (Number.isFinite(scaleX) && scaleX > 0 && Number.isFinite(scaleY) && scaleY > 0) {
            const tx = targetLeft - raster.bearingX * scaleX;
            const ty = targetTop - raster.bearingY * scaleY;
            const transformed = rasterizeGlyphWithTransform(
              font,
              glyphId,
              fontSize,
              [scaleX, 0, 0, scaleY, tx, ty],
              rasterOptions,
            );
            if (transformed) {
              glyphData.push({
                glyphId,
                bitmap: cloneBitmap(transformed.bitmap),
                bearingX: transformed.bearingX,
                bearingY: transformed.bearingY,
                advance: font.advanceWidth(glyphId) * scale,
                constraintWidth,
              });
              didConstraint = true;
            }
          }
        }
      }
    }

    if (!didConstraint) {
      const advance = font.advanceWidth(glyphId) * scale;
      glyphData.push({
        glyphId,
        bitmap: cloneBitmap(raster.bitmap),
        bearingX: raster.bearingX,
        bearingY: raster.bearingY,
        advance,
        constraintWidth: 0,
      });
    }
  }

  glyphData.sort((a, b) => (b.bitmap?.rows ?? 0) - (a.bitmap?.rows ?? 0));

  const {
    width: atlasWidth,
    height: atlasHeight,
    placements,
  } = packGlyphs(
    glyphData.map((g) => ({
      width: (g.bitmap?.width ?? 0) + padding * 2,
      height: (g.bitmap?.rows ?? 0) + padding * 2,
    })),
    maxWidth,
    maxHeight,
  );

  const atlas = createAtlasBitmap(atlasWidth, atlasHeight, pixelMode);
  const glyphMetrics = new Map();

  const glyphMetricsByWidth = new Map<number, Map<number, any>>();

  for (let i = 0; i < glyphData.length; i += 1) {
    const glyph = glyphData[i];
    const placement = placements[i];
    if (!placement?.placed || !glyph.bitmap) continue;
    copyBitmapToAtlas(glyph.bitmap, atlas, placement.x + padding, placement.y + padding);
    const metrics = {
      glyphId: glyph.glyphId,
      atlasX: placement.x + padding,
      atlasY: placement.y + padding,
      width: glyph.bitmap.width,
      height: glyph.bitmap.rows,
      bearingX: glyph.bearingX,
      bearingY: glyph.bearingY,
      advance: glyph.advance,
    };
    const widthKey = glyph.constraintWidth ?? 0;
    if (widthKey > 0) {
      let widthMap = glyphMetricsByWidth.get(widthKey);
      if (!widthMap) {
        widthMap = new Map();
        glyphMetricsByWidth.set(widthKey, widthMap);
      }
      widthMap.set(glyph.glyphId, metrics);
      if (!glyphMetrics.has(glyph.glyphId) || widthKey === 1) {
        glyphMetrics.set(glyph.glyphId, metrics);
      }
    } else {
      if (!glyphMetrics.has(glyph.glyphId)) {
        glyphMetrics.set(glyph.glyphId, metrics);
      }
    }
  }

  return {
    atlas: {
      bitmap: atlas,
      glyphs: glyphMetrics,
      glyphsByWidth: glyphMetricsByWidth,
      fontSize,
    },
    constrainedGlyphWidths: null,
  };
}
