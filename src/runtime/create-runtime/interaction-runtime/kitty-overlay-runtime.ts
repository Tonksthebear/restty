import type { KittyPlacement } from "../../../wasm";
import {
  computeKittyPartialVirtualFallback,
  kittyHashInt,
  kittyHashString,
  toKittySlice,
  type KittySlice,
} from "../kitty-overlay-utils";
import type { KittyImageCache } from "./kitty-image-cache";

type CreateKittyOverlayRuntimeOptions = {
  getCanvas: () => HTMLCanvasElement;
  kittyOverlayDebugEnabled: boolean;
  kittyImageCache: KittyImageCache;
};

type DrawPlan =
  | {
      type: "fallback";
      source: CanvasImageSource;
      sx: number;
      sy: number;
      sw: number;
      sh: number;
      dx: number;
      dy: number;
      dw: number;
      dh: number;
    }
  | { type: "slice"; source: CanvasImageSource; slices: KittySlice[] };

export type KittyOverlayRuntime = {
  syncKittyOverlaySize: () => void;
  clearKittyOverlay: () => void;
  drawKittyOverlay: (placements: KittyPlacement[], cellW: number, cellH: number) => void;
  detachKittyOverlayCanvas: () => void;
};

export function createKittyOverlayRuntime(options: CreateKittyOverlayRuntimeOptions): KittyOverlayRuntime {
  const { getCanvas, kittyOverlayDebugEnabled, kittyImageCache } = options;

  let kittyOverlayCanvas: HTMLCanvasElement | null = null;
  let kittyOverlayCtx: CanvasRenderingContext2D | null = null;
  let kittyOverlayDebugLastSig = "";
  let kittyOverlayLastHash = -1;

  const ensureKittyOverlayCanvas = () => {
    const canvas = getCanvas();
    const parent = canvas.parentElement;
    if (!parent || typeof document === "undefined") return;
    if (kittyOverlayCanvas && kittyOverlayCanvas.parentElement === parent) return;

    if (kittyOverlayCanvas?.parentElement) {
      kittyOverlayCanvas.parentElement.removeChild(kittyOverlayCanvas);
    }

    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === "static") {
      parent.style.position = "relative";
    }

    const overlay = document.createElement("canvas");
    overlay.className = "restty-kitty-overlay";
    overlay.style.position = "absolute";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.pointerEvents = "none";
    overlay.style.imageRendering = "pixelated";
    overlay.style.zIndex = "2";
    parent.appendChild(overlay);
    kittyOverlayCanvas = overlay;
    kittyOverlayCtx = overlay.getContext("2d");
  };

  const syncKittyOverlaySize = () => {
    const canvas = getCanvas();
    if (!kittyOverlayCanvas) return;
    if (kittyOverlayCanvas.width !== canvas.width || kittyOverlayCanvas.height !== canvas.height) {
      kittyOverlayCanvas.width = canvas.width;
      kittyOverlayCanvas.height = canvas.height;
      kittyOverlayLastHash = -1;
    }
  };

  const clearKittyOverlay = () => {
    ensureKittyOverlayCanvas();
    syncKittyOverlaySize();
    if (!kittyOverlayCtx || !kittyOverlayCanvas) return;
    kittyOverlayCtx.clearRect(0, 0, kittyOverlayCanvas.width, kittyOverlayCanvas.height);
    kittyOverlayLastHash = -1;
  };

  const drawKittyOverlay = (placements: KittyPlacement[], cellW: number, cellH: number) => {
    ensureKittyOverlayCanvas();
    syncKittyOverlaySize();
    if (!kittyOverlayCtx || !kittyOverlayCanvas) return;

    if (!placements.length) {
      if (kittyOverlayLastHash !== 0) {
        kittyOverlayCtx.clearRect(0, 0, kittyOverlayCanvas.width, kittyOverlayCanvas.height);
        kittyOverlayLastHash = 0;
      }
      return;
    }

    if (kittyOverlayDebugEnabled) {
      const groups = new Map<number, number>();
      for (const placement of placements) {
        groups.set(placement.imageId, (groups.get(placement.imageId) ?? 0) + 1);
      }
      const sample = placements
        .slice(0, 6)
        .map((placement) =>
          [
            `i=${placement.imageId}`,
            `fmt=${placement.imageFormat}`,
            `xy=${placement.x},${placement.y}`,
            `wh=${placement.width}x${placement.height}`,
            `src=${placement.sourceX},${placement.sourceY},${placement.sourceWidth}x${placement.sourceHeight}`,
            `off=${placement.cellOffsetX},${placement.cellOffsetY}`,
            `img=${placement.imageWidth}x${placement.imageHeight}`,
          ].join(" "),
        )
        .join(" | ");
      const byImage = [...groups.entries()].map(([id, count]) => `${id}:${count}`).join(",");
      const sig = `${placements.length}|${byImage}|${sample}`;
      if (sig !== kittyOverlayDebugLastSig) {
        kittyOverlayDebugLastSig = sig;
        console.log(
          `[kitty-overlay] count=${placements.length} cell=${cellW}x${cellH} images=${byImage} sample=${sample}`,
        );
      }
    }

    const activeImageIds = new Set<number>();
    const grouped = new Map<number, KittyPlacement[]>();
    const order: number[] = [];
    const drawPlans: DrawPlan[] = [];
    let hash = 2166136261;
    hash = kittyHashInt(hash, kittyOverlayCanvas.width);
    hash = kittyHashInt(hash, kittyOverlayCanvas.height);
    hash = kittyHashInt(hash, cellW | 0);
    hash = kittyHashInt(hash, cellH | 0);
    hash = kittyHashInt(hash, placements.length);

    for (const placement of placements) {
      activeImageIds.add(placement.imageId);
      hash = kittyHashInt(hash, placement.imageId);
      hash = kittyHashInt(hash, placement.x);
      hash = kittyHashInt(hash, placement.y);
      hash = kittyHashInt(hash, placement.width);
      hash = kittyHashInt(hash, placement.height);
      hash = kittyHashInt(hash, placement.sourceX);
      hash = kittyHashInt(hash, placement.sourceY);
      hash = kittyHashInt(hash, placement.sourceWidth);
      hash = kittyHashInt(hash, placement.sourceHeight);
      hash = kittyHashInt(hash, placement.cellOffsetX);
      hash = kittyHashInt(hash, placement.cellOffsetY);
      hash = kittyHashInt(hash, placement.z);
      let list = grouped.get(placement.imageId);
      if (!list) {
        list = [];
        grouped.set(placement.imageId, list);
        order.push(placement.imageId);
      }
      list.push(placement);
    }

    for (const imageId of order) {
      const group = grouped.get(imageId);
      if (!group?.length) continue;
      const decoded = kittyImageCache.resolveKittyImage(group[group.length - 1] ?? group[0]!);
      if (!decoded) {
        hash = kittyHashInt(hash, imageId);
        hash = kittyHashInt(hash, -1);
        continue;
      }
      hash = kittyHashInt(hash, imageId);
      hash = kittyHashInt(hash, decoded.width);
      hash = kittyHashInt(hash, decoded.height);
      hash = kittyHashString(hash, decoded.key);

      const slices: KittySlice[] = [];
      for (const placement of group) {
        const slice = toKittySlice(placement, decoded, cellW, cellH);
        if (slice) slices.push(slice);
      }
      if (!slices.length) continue;

      const fallback = computeKittyPartialVirtualFallback(group, slices, decoded, cellW, cellH);
      if (fallback) {
        if (kittyOverlayDebugEnabled) {
          console.log(
            `[kitty-overlay] partial-fallback i=${imageId} draw=${Math.round(fallback.dw)}x${Math.round(fallback.dh)} at ${Math.round(fallback.dx)},${Math.round(fallback.dy)} src=${decoded.width}x${decoded.height}`,
          );
        }
        hash = kittyHashInt(hash, 0xfeed);
        hash = kittyHashInt(hash, Math.round(fallback.dx));
        hash = kittyHashInt(hash, Math.round(fallback.dy));
        hash = kittyHashInt(hash, Math.round(fallback.dw));
        hash = kittyHashInt(hash, Math.round(fallback.dh));
        drawPlans.push({
          type: "fallback",
          source: decoded.source,
          sx: 0,
          sy: 0,
          sw: decoded.width,
          sh: decoded.height,
          dx: fallback.dx,
          dy: fallback.dy,
          dw: fallback.dw,
          dh: fallback.dh,
        });
        continue;
      }

      hash = kittyHashInt(hash, slices.length);
      for (const slice of slices) {
        hash = kittyHashInt(hash, slice.sx);
        hash = kittyHashInt(hash, slice.sy);
        hash = kittyHashInt(hash, slice.sw);
        hash = kittyHashInt(hash, slice.sh);
        hash = kittyHashInt(hash, Math.round(slice.dx));
        hash = kittyHashInt(hash, Math.round(slice.dy));
        hash = kittyHashInt(hash, Math.round(slice.dw));
        hash = kittyHashInt(hash, Math.round(slice.dh));
      }
      drawPlans.push({ type: "slice", source: decoded.source, slices });
    }

    const cacheDirty = kittyImageCache.pruneInactiveImages(activeImageIds);
    if (!cacheDirty && kittyOverlayLastHash === (hash | 0)) {
      return;
    }

    kittyOverlayCtx.clearRect(0, 0, kittyOverlayCanvas.width, kittyOverlayCanvas.height);
    for (const plan of drawPlans) {
      if (plan.type === "fallback") {
        kittyOverlayCtx.drawImage(
          plan.source,
          plan.sx,
          plan.sy,
          plan.sw,
          plan.sh,
          plan.dx,
          plan.dy,
          plan.dw,
          plan.dh,
        );
        continue;
      }
      for (const slice of plan.slices) {
        kittyOverlayCtx.drawImage(
          plan.source,
          slice.sx,
          slice.sy,
          slice.sw,
          slice.sh,
          slice.dx,
          slice.dy,
          slice.dw,
          slice.dh,
        );
      }
    }
    kittyOverlayLastHash = hash | 0;
  };

  const detachKittyOverlayCanvas = () => {
    if (kittyOverlayCanvas?.parentElement) {
      kittyOverlayCanvas.parentElement.removeChild(kittyOverlayCanvas);
    }
    kittyOverlayCanvas = null;
    kittyOverlayCtx = null;
    kittyOverlayLastHash = -1;
  };

  return {
    syncKittyOverlaySize,
    clearKittyOverlay,
    drawKittyOverlay,
    detachKittyOverlayCanvas,
  };
}
