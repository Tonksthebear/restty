import { clamp } from "../../../grid";
import { createNativeScrollbarHost } from "../native-scrollbar-host";
import type {
  RuntimeGridState,
  RuntimeLinkState,
  RuntimeScrollbarState,
  RuntimeSelectionState,
} from "./types";
import type { ResttyWasm, ResttyWasmExports } from "../../../wasm";

export type CreateScrollbarRuntimeOptions = {
  scrollbarState: RuntimeScrollbarState;
  selectionState: RuntimeSelectionState;
  linkState: RuntimeLinkState;
  getCanvas: () => HTMLCanvasElement;
  getGridState: () => RuntimeGridState;
  getWasmReady: () => boolean;
  getWasm: () => ResttyWasm | null;
  getWasmHandle: () => number;
  getWasmExports: () => ResttyWasmExports | null;
  updateLinkHover: (cell: null) => void;
  markNeedsRender: () => void;
  markSearchDirty?: () => void;
};

export type ScrollbarRuntime = {
  destroy: () => void;
  noteScrollActivity: () => void;
  scrollViewportByLines: (lines: number) => void;
  scrollViewportByWheel: (event: WheelEvent) => void;
  syncScrollbar: (total: number, offset: number, len: number) => void;
};

export function createScrollbarRuntime(options: CreateScrollbarRuntimeOptions): ScrollbarRuntime {
  const {
    scrollbarState,
    selectionState,
    linkState,
    getCanvas,
    getGridState,
    getWasmReady,
    getWasm,
    getWasmHandle,
    getWasmExports,
    updateLinkHover,
    markNeedsRender,
    markSearchDirty,
  } = options;

  let scrollRemainder = 0;
  let pendingPrecisionScrollPx = 0;
  const hasCoarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(any-pointer: coarse)").matches;
  const hasTouchPoints = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  const nativeScrollHost =
    !hasCoarsePointer && !hasTouchPoints && typeof document !== "undefined"
      ? createNativeScrollbarHost({
          canvas: getCanvas(),
          getGridState,
          noteScrollActivity: () => {
            scrollbarState.lastInputAt = performance.now();
          },
          setViewportScrollOffset: (nextOffset) => {
            setViewportScrollOffset(nextOffset);
          },
        })
      : null;

  const getViewportScrollOffset = () => {
    const wasmHandle = getWasmHandle();
    const wasmExports = getWasmExports();
    if (!wasmHandle || !wasmExports?.restty_scrollbar_offset) return 0;
    return wasmExports.restty_scrollbar_offset(wasmHandle) || 0;
  };

  const shiftSelectionByRows = (deltaRows: number) => {
    if (!deltaRows) return;
    if (!selectionState.active && !selectionState.dragging) return;
    if (!selectionState.anchor || !selectionState.focus) return;
    const { rows } = getGridState();
    const maxAbs = Math.max(1024, (rows || 24) * 128);
    selectionState.anchor = {
      row: clamp(selectionState.anchor.row + deltaRows, -maxAbs, maxAbs),
      col: selectionState.anchor.col,
    };
    selectionState.focus = {
      row: clamp(selectionState.focus.row + deltaRows, -maxAbs, maxAbs),
      col: selectionState.focus.col,
    };
    markNeedsRender();
  };

  const noteScrollActivity = () => {
    scrollbarState.lastInputAt = performance.now();
    nativeScrollHost?.flash();
  };

  const scrollViewportByLines = (lines: number) => {
    const wasm = getWasm();
    const wasmHandle = getWasmHandle();
    const { cellH } = getGridState();
    if (!getWasmReady() || !wasm || !wasmHandle || !cellH) return;
    scrollRemainder += lines;
    const delta = Math.trunc(scrollRemainder);
    scrollRemainder -= delta;
    if (!delta) return;
    const beforeOffset = getViewportScrollOffset();
    wasm.scrollViewport(wasmHandle, delta);
    const afterOffset = getViewportScrollOffset();
    shiftSelectionByRows(beforeOffset - afterOffset);
    if (linkState.hoverId) updateLinkHover(null);
    wasm.renderUpdate(wasmHandle);
    markSearchDirty?.();
    markNeedsRender();
    noteScrollActivity();
  };

  const scrollViewportByWheel = (event: WheelEvent) => {
    const { cellH, rows } = getGridState();
    if (!cellH) return;

    // Cap lines moved per wheel event so trackpad acceleration cannot jump
    // dozens of rows at once (felt as laggy + huge jump, especially scroll-up).
    const maxLinesPerEvent = Math.max(4, Math.min(12, Math.floor((rows || 24) / 4) || 4));

    const isPrecision = event.deltaMode === 0;
    if (isPrecision) {
      // 1:1 pixel→line accumulation (was *2, which amplified jumps).
      const pendingPx = pendingPrecisionScrollPx + event.deltaY;
      if (Math.abs(pendingPx) < cellH) {
        pendingPrecisionScrollPx = pendingPx;
        noteScrollActivity();
        return;
      }

      const rawLines = Math.trunc(pendingPx / cellH);
      pendingPrecisionScrollPx = pendingPx - rawLines * cellH;
      if (!rawLines) return;
      const sign = rawLines < 0 ? -1 : 1;
      const lines = sign * Math.min(Math.abs(rawLines), maxLinesPerEvent);
      scrollViewportByLines(lines);
      return;
    }

    pendingPrecisionScrollPx = 0;
    if (event.deltaMode === 1) {
      // Line mode: honor multi-line deltas; do not collapse to ±1 * 3 only.
      const raw = Math.round(event.deltaY) || (event.deltaY < 0 ? -1 : 1);
      const sign = raw < 0 ? -1 : 1;
      const lines = sign * Math.min(Math.abs(raw) * 3, maxLinesPerEvent);
      scrollViewportByLines(lines);
      return;
    }

    const pageLines = rows > 0 ? rows : 24;
    const raw = event.deltaY * pageLines;
    const sign = raw < 0 ? -1 : 1;
    scrollViewportByLines(sign * Math.min(Math.abs(raw), maxLinesPerEvent));
  };

  const setViewportScrollOffset = (nextOffset: number) => {
    const wasm = getWasm();
    const wasmHandle = getWasmHandle();
    const wasmExports = getWasmExports();
    if (!getWasmReady() || !wasm || !wasmHandle || !wasmExports?.restty_scrollbar_total) return;
    const total = wasmExports.restty_scrollbar_total(wasmHandle) || 0;
    const len = wasmExports.restty_scrollbar_len ? wasmExports.restty_scrollbar_len(wasmHandle) : 0;
    const current = wasmExports.restty_scrollbar_offset
      ? wasmExports.restty_scrollbar_offset(wasmHandle)
      : 0;
    const maxOffset = Math.max(0, total - len);
    const clamped = clamp(Math.round(nextOffset), 0, maxOffset);
    const delta = clamped - current;
    if (!delta) return;
    const beforeOffset = getViewportScrollOffset();
    wasm.scrollViewport(wasmHandle, delta);
    const afterOffset = getViewportScrollOffset();
    shiftSelectionByRows(beforeOffset - afterOffset);
    if (linkState.hoverId) updateLinkHover(null);
    wasm.renderUpdate(wasmHandle);
    markSearchDirty?.();
    markNeedsRender();
    noteScrollActivity();
  };

  return {
    destroy: () => {
      nativeScrollHost?.destroy();
    },
    noteScrollActivity,
    scrollViewportByLines,
    scrollViewportByWheel,
    syncScrollbar: (total, offset, len) => {
      nativeScrollHost?.sync(total, offset, len);
    },
  };
}
