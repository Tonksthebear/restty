import { clamp } from "../grid";
import { pushRectBox, type Color } from "../renderer";

export const OVERLAY_SCROLLBAR_WIDTH_CSS_PX = 7;
export const OVERLAY_SCROLLBAR_MARGIN_CSS_PX = 4;
export const OVERLAY_SCROLLBAR_INSET_Y_CSS_PX = 2;
export const OVERLAY_SCROLLBAR_MIN_THUMB_CSS_PX = 28;
export const OVERLAY_SCROLLBAR_CAP_SUPERSAMPLE = 8;

export type OverlayScrollbarLayout = {
  total: number;
  offset: number;
  len: number;
  denom: number;
  width: number;
  trackX: number;
  trackY: number;
  trackH: number;
  thumbY: number;
  thumbH: number;
};

export function computeOverlayScrollbarLayout(
  total: number,
  offset: number,
  len: number,
  canvasWidth: number,
  canvasHeight: number,
  currentDpr: number,
): OverlayScrollbarLayout | null {
  if (!(total > len && len > 0)) return null;
  const dpr = Math.max(1, currentDpr || 1);
  const width = Math.max(1, Math.round(OVERLAY_SCROLLBAR_WIDTH_CSS_PX * dpr));
  const margin = Math.max(1, Math.round(OVERLAY_SCROLLBAR_MARGIN_CSS_PX * dpr));
  const insetY = Math.max(0, Math.round(OVERLAY_SCROLLBAR_INSET_Y_CSS_PX * dpr));
  const trackX = Math.max(0, canvasWidth - margin - width);
  const trackY = insetY;
  const trackH = Math.max(width, canvasHeight - insetY * 2);
  const denom = Math.max(1, total - len);
  const dynamicThumbH = Math.round(trackH * (len / total));
  const minThumbH = Math.max(width, Math.round(OVERLAY_SCROLLBAR_MIN_THUMB_CSS_PX * dpr));
  const thumbH = Math.min(trackH, Math.max(minThumbH, dynamicThumbH));
  const thumbY = trackY + Math.round((offset / denom) * (trackH - thumbH));
  return { total, offset, len, denom, width, trackX, trackY, trackH, thumbY, thumbH };
}

export function isPointInScrollbarHitArea(layout: OverlayScrollbarLayout, x: number, y: number) {
  const hitPadX = Math.max(3, Math.round(layout.width * 0.35));
  return (
    x >= layout.trackX - hitPadX &&
    x <= layout.trackX + layout.width + hitPadX &&
    y >= layout.trackY &&
    y <= layout.trackY + layout.trackH
  );
}

export function isPointInScrollbarThumb(layout: OverlayScrollbarLayout, x: number, y: number) {
  return (
    x >= layout.trackX &&
    x <= layout.trackX + layout.width &&
    y >= layout.thumbY &&
    y <= layout.thumbY + layout.thumbH
  );
}

export function scrollbarOffsetForPointerY(
  layout: OverlayScrollbarLayout,
  pointerY: number,
  thumbGrabRatio: number,
) {
  const thumbTop = pointerY - layout.thumbH * thumbGrabRatio;
  const trackSpan = Math.max(1, layout.trackH - layout.thumbH);
  const ratio = clamp((thumbTop - layout.trackY) / trackSpan, 0, 1);
  return Math.round(ratio * layout.denom);
}

export function pushRoundedVerticalBar(
  out: number[],
  x: number,
  y: number,
  w: number,
  h: number,
  color: Color,
  capSupersample = OVERLAY_SCROLLBAR_CAP_SUPERSAMPLE,
) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  const radius = Math.min(width * 0.5, height * 0.5);
  if (radius <= 0) {
    pushRectBox(out, x0, y0, width, height, color);
    return;
  }

  const capRows = Math.min(height, Math.max(1, Math.ceil(radius)));
  const middleStart = capRows;
  const middleEnd = Math.max(middleStart, height - capRows);
  const middleH = middleEnd - middleStart;
  if (middleH > 0) {
    pushRectBox(out, x0, y0 + middleStart, width, middleH, color);
  }

  const radiusSq = radius * radius;
  const centerX = width * 0.5;
  const topCenterY = radius;
  const bottomCenterY = height - radius;
  const samplesPerAxis = Math.max(1, capSupersample | 0);
  const totalSamples = samplesPerAxis * samplesPerAxis;
  const invSamples = 1 / totalSamples;
  const alphaBase = color[3];
  const alphaEpsilon = 1 / 255;

  const sampleCapPixelCoverage = (localX: number, localY: number, centerY: number) => {
    let hits = 0;
    for (let sy = 0; sy < samplesPerAxis; sy += 1) {
      const sampleY = localY + (sy + 0.5) / samplesPerAxis;
      for (let sx = 0; sx < samplesPerAxis; sx += 1) {
        const sampleX = localX + (sx + 0.5) / samplesPerAxis;
        const dx = sampleX - centerX;
        const dy = sampleY - centerY;
        if (dx * dx + dy * dy <= radiusSq) hits += 1;
      }
    }
    return hits * invSamples;
  };

  for (let row = 0; row < capRows; row += 1) {
    const topY = y0 + row;
    const bottomY = y0 + height - 1 - row;
    for (let col = 0; col < width; col += 1) {
      const coverageTop = sampleCapPixelCoverage(col, row, topCenterY);
      if (coverageTop > 0) {
        const alpha = alphaBase * coverageTop;
        if (alpha > alphaEpsilon) {
          out.push(x0 + col, topY, 1, 1, color[0], color[1], color[2], alpha);
        }
      }
      if (bottomY !== topY) {
        const localBottomY = height - 1 - row;
        const coverageBottom = sampleCapPixelCoverage(col, localBottomY, bottomCenterY);
        if (coverageBottom > 0) {
          const alpha = alphaBase * coverageBottom;
          if (alpha > alphaEpsilon) {
            out.push(x0 + col, bottomY, 1, 1, color[0], color[1], color[2], alpha);
          }
        }
      }
    }
  }
}

export function resolveOverlayScrollbarAlpha(now: number, lastInputAt: number): number {
  const since = now - lastInputAt;
  const fadeDelay = 160;
  const fadeDuration = 520;
  if (since < fadeDelay) return 0.68;
  if (since < fadeDelay + fadeDuration) {
    return 0.68 * (1 - (since - fadeDelay) / fadeDuration);
  }
  return 0;
}
