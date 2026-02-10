import { getNerdConstraint, glyphWidthUnits } from "../../fonts";
import { constrainGlyphBox } from "../../renderer";
import type { GlyphConstraintMeta, AtlasConstraintContext } from "../atlas-builder";
import { cloneBitmap, copyBitmapToAtlas, createAtlasBitmap } from "./bitmap-utils";
import { packGlyphs } from "./packing-utils";
import { resolveFontScaleForAtlas, tightenNerdConstraintBox } from "./nerd-metrics-utils";

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
