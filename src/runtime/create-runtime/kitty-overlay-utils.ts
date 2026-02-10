import type { KittyPlacement } from "../../wasm";

export type KittyDecodedImageLike = {
  width: number;
  height: number;
};

export type KittySlice = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  rawSw: number;
  rawSh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

export function kittyHashInt(hash: number, value: number): number {
  let h = hash >>> 0;
  h ^= value | 0;
  h = Math.imul(h, 16777619) >>> 0;
  return h;
}

export function kittyHashString(hash: number, value: string): number {
  let h = hash >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h = kittyHashInt(h, value.charCodeAt(i));
  }
  return h;
}

export function toKittySlice(
  placement: KittyPlacement,
  decoded: KittyDecodedImageLike,
  cellW: number,
  cellH: number,
): KittySlice | null {
  const srcW = decoded.width >>> 0;
  const srcH = decoded.height >>> 0;
  if (!srcW || !srcH) return null;
  if (!placement.width || !placement.height) return null;

  const sxRaw = Math.max(0, Math.min(placement.sourceX >>> 0, srcW));
  const syRaw = Math.max(0, Math.min(placement.sourceY >>> 0, srcH));
  const swMax = Math.max(0, srcW - sxRaw);
  const shMax = Math.max(0, srcH - syRaw);
  let sx = sxRaw;
  let sy = syRaw;
  const rawSw = Math.max(0, Math.min(placement.sourceWidth >>> 0, swMax));
  const rawSh = Math.max(0, Math.min(placement.sourceHeight >>> 0, shMax));
  let sw = rawSw;
  let sh = rawSh;

  // Ghostty can emit zero-sized source slices after integer rounding.
  // Canvas drawImage drops those; sample a 1px edge instead so the slice
  // remains visible and small images don't disappear completely.
  if (sw === 0) {
    sx = Math.min(sxRaw, srcW - 1);
    sw = 1;
  }
  if (sh === 0) {
    sy = Math.min(syRaw, srcH - 1);
    sh = 1;
  }

  const dx = placement.x * cellW + placement.cellOffsetX;
  const dy = placement.y * cellH + placement.cellOffsetY;
  return {
    sx,
    sy,
    sw,
    sh,
    rawSw,
    rawSh,
    dx,
    dy,
    dw: placement.width,
    dh: placement.height,
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) * 0.5;
}

export function computeKittyPartialVirtualFallback(
  placements: KittyPlacement[],
  slices: KittySlice[],
  decoded: KittyDecodedImageLike,
  cellW: number,
  cellH: number,
): { dx: number; dy: number; dw: number; dh: number } | null {
  if (!placements.some((p) => p.z === -1)) return null;
  const srcW = decoded.width >>> 0;
  const srcH = decoded.height >>> 0;
  if (!srcW || !srcH) return null;
  const usable = slices.filter((s) => s.rawSw > 0 && s.rawSh > 0 && s.dw > 0 && s.dh > 0);

  let boundMinX = Number.POSITIVE_INFINITY;
  let boundMinY = Number.POSITIVE_INFINITY;
  let boundMaxX = Number.NEGATIVE_INFINITY;
  let boundMaxY = Number.NEGATIVE_INFINITY;
  for (const p of placements) {
    if (!p.width || !p.height) continue;
    const dx = p.x * cellW + p.cellOffsetX;
    const dy = p.y * cellH + p.cellOffsetY;
    boundMinX = Math.min(boundMinX, dx);
    boundMinY = Math.min(boundMinY, dy);
    boundMaxX = Math.max(boundMaxX, dx + p.width);
    boundMaxY = Math.max(boundMaxY, dy + p.height);
  }
  const boundsW = Math.max(0, boundMaxX - boundMinX);
  const boundsH = Math.max(0, boundMaxY - boundMinY);
  const containFromBounds = (): { dx: number; dy: number; dw: number; dh: number } | null => {
    if (!Number.isFinite(boundMinX) || !Number.isFinite(boundMinY)) return null;
    if (!Number.isFinite(boundMaxX) || !Number.isFinite(boundMaxY)) return null;
    if (boundsW <= 0 || boundsH <= 0) return null;
    const scale = Math.min(boundsW / srcW, boundsH / srcH);
    if (!Number.isFinite(scale) || scale <= 0) return null;
    const dw = srcW * scale;
    const dh = srcH * scale;
    const dx = boundMinX + (boundsW - dw) / 2;
    const dy = boundMinY + (boundsH - dh) / 2;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    if (dw <= 0 || dh <= 0) return null;
    return { dx, dy, dw, dh };
  };
  if (usable.length < 2) {
    return containFromBounds();
  }

  let srcMinX = Number.POSITIVE_INFINITY;
  let srcMaxX = 0;
  let srcMinY = Number.POSITIVE_INFINITY;
  let srcMaxY = 0;
  for (const s of usable) {
    srcMinX = Math.min(srcMinX, s.sx);
    srcMaxX = Math.max(srcMaxX, s.sx + s.rawSw);
    srcMinY = Math.min(srcMinY, s.sy);
    srcMaxY = Math.max(srcMaxY, s.sy + s.rawSh);
  }
  const covX = Math.max(0, srcMaxX - srcMinX) / srcW;
  const covY = Math.max(0, srcMaxY - srcMinY) / srcH;
  // Only recover when we clearly have an incomplete virtual mapping.
  if (covX >= 0.9 && covY >= 0.9) return null;

  const scaleXs: number[] = [];
  const scaleYs: number[] = [];
  const anchorXs: number[] = [];
  const anchorYs: number[] = [];
  for (const s of usable) {
    const scaleX = s.dw / s.rawSw;
    const scaleY = s.dh / s.rawSh;
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
      continue;
    }
    scaleXs.push(scaleX);
    scaleYs.push(scaleY);
  }
  if (!scaleXs.length || !scaleYs.length) return null;

  const scaleX = median(scaleXs);
  const scaleY = median(scaleYs);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    return null;
  }

  for (const s of usable) {
    anchorXs.push(s.dx - s.sx * scaleX);
    anchorYs.push(s.dy - s.sy * scaleY);
  }
  if (!anchorXs.length || !anchorYs.length) return null;

  const dx = median(anchorXs);
  const dy = median(anchorYs);
  const dw = srcW * scaleX;
  const dh = srcH * scaleY;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dw) || !Number.isFinite(dh)) {
    return null;
  }
  if (dw <= 0 || dh <= 0) return null;

  // Verify fit: predicted placement should roughly match input placements.
  const xErrs: number[] = [];
  const yErrs: number[] = [];
  for (const s of usable) {
    const px = dx + s.sx * scaleX;
    const py = dy + s.sy * scaleY;
    xErrs.push(Math.abs(px - s.dx));
    yErrs.push(Math.abs(py - s.dy));
  }
  const maxXErr = Math.max(2, cellW * 0.75);
  const maxYErr = Math.max(2, cellH * 0.75);
  if (median(xErrs) > maxXErr || median(yErrs) > maxYErr) {
    return containFromBounds();
  }

  return { dx, dy, dw, dh };
}
