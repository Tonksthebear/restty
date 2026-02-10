import { clamp } from "../../../grid";
import type { Color } from "../../../renderer";
import {
  computeOverlayScrollbarLayout,
  pushRoundedVerticalBar,
  resolveOverlayScrollbarAlpha,
  type OverlayScrollbarLayout,
} from "../../overlay-scrollbar";
import type {
  RuntimeGridState,
  RuntimeLinkState,
  RuntimeScrollbarState,
  RuntimeSelectionState,
} from "./types";
import type { ResttyWasm, ResttyWasmExports } from "../../../wasm";

export type CreateScrollbarRuntimeOptions = {
  showOverlayScrollbar: boolean;
  scrollbarState: RuntimeScrollbarState;
  selectionState: RuntimeSelectionState;
  linkState: RuntimeLinkState;
  getCanvas: () => HTMLCanvasElement;
  getCurrentDpr: () => number;
  getGridState: () => RuntimeGridState;
  getWasmReady: () => boolean;
  getWasm: () => ResttyWasm | null;
  getWasmHandle: () => number;
  getWasmExports: () => ResttyWasmExports | null;
  updateLinkHover: (cell: null) => void;
  markNeedsRender: () => void;
};

export type ScrollbarRuntime = {
  noteScrollActivity: () => void;
  scrollViewportByLines: (lines: number) => void;
  setViewportScrollOffset: (nextOffset: number) => void;
  pointerToCanvasPx: (event: PointerEvent) => { x: number; y: number };
  getOverlayScrollbarLayout: () => OverlayScrollbarLayout | null;
  appendOverlayScrollbar: (overlayData: number[], total: number, offset: number, len: number) => void;
};

export function createScrollbarRuntime(options: CreateScrollbarRuntimeOptions): ScrollbarRuntime {
  const {
    showOverlayScrollbar,
    scrollbarState,
    selectionState,
    linkState,
    getCanvas,
    getCurrentDpr,
    getGridState,
    getWasmReady,
    getWasm,
    getWasmHandle,
    getWasmExports,
    updateLinkHover,
    markNeedsRender,
  } = options;

  let scrollRemainder = 0;

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
    markNeedsRender();
    noteScrollActivity();
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
    markNeedsRender();
    noteScrollActivity();
  };

  const pointerToCanvasPx = (event: PointerEvent) => {
    const canvas = getCanvas();
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const getOverlayScrollbarLayout = () => {
    const wasmHandle = getWasmHandle();
    const wasmExports = getWasmExports();
    const { rows } = getGridState();
    if (!showOverlayScrollbar || !wasmExports?.restty_scrollbar_total || !wasmHandle) return null;
    if (!rows) return null;
    const total = wasmExports.restty_scrollbar_total(wasmHandle) || 0;
    const offset = wasmExports.restty_scrollbar_offset
      ? wasmExports.restty_scrollbar_offset(wasmHandle)
      : 0;
    const len = wasmExports.restty_scrollbar_len ? wasmExports.restty_scrollbar_len(wasmHandle) : rows;
    const canvas = getCanvas();
    return computeOverlayScrollbarLayout(
      total,
      offset,
      len,
      canvas.width,
      canvas.height,
      getCurrentDpr(),
    );
  };

  const appendOverlayScrollbar = (overlayData: number[], total: number, offset: number, len: number) => {
    if (!showOverlayScrollbar) return;
    const canvas = getCanvas();
    const layout = computeOverlayScrollbarLayout(
      total,
      offset,
      len,
      canvas.width,
      canvas.height,
      getCurrentDpr(),
    );
    if (!layout) return;
    const alpha = resolveOverlayScrollbarAlpha(performance.now(), scrollbarState.lastInputAt);
    if (alpha <= 0.01) return;

    const thumbColor: Color = [0.96, 0.96, 0.96, alpha * 0.75];
    pushRoundedVerticalBar(
      overlayData,
      layout.trackX,
      layout.thumbY,
      layout.width,
      layout.thumbH,
      thumbColor,
    );
  };

  return {
    noteScrollActivity,
    scrollViewportByLines,
    setViewportScrollOffset,
    pointerToCanvasPx,
    getOverlayScrollbarLayout,
    appendOverlayScrollbar,
  };
}
