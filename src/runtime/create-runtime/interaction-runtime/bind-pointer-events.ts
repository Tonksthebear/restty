import { clamp } from "../../../grid";
import {
  isPointInScrollbarHitArea,
  isPointInScrollbarThumb,
  scrollbarOffsetForPointerY,
  type OverlayScrollbarLayout,
} from "../../overlay-scrollbar";
import { createPointerAuxHandlers } from "./bind-pointer-aux-handlers";
import { createPointerUpHandler } from "./bind-pointer-up-handler";
import type {
  BindCanvasEventsOptions,
  RuntimeCell,
  RuntimeDesktopSelectionState,
  RuntimeGridState,
  RuntimeLinkState,
  RuntimeScrollbarDragState,
  RuntimeSelectionState,
  RuntimeTouchSelectionState,
} from "./types";

export type BindPointerEventsOptions = {
  canvas: HTMLCanvasElement;
  bindOptions: BindCanvasEventsOptions;
  touchSelectionMode: "off" | "drag" | "long-press";
  touchSelectionLongPressMs: number;
  touchSelectionMoveThresholdPx: number;
  selectionState: RuntimeSelectionState;
  touchSelectionState: RuntimeTouchSelectionState;
  desktopSelectionState: RuntimeDesktopSelectionState;
  scrollbarDragState: RuntimeScrollbarDragState;
  linkState: RuntimeLinkState;
  cleanupCanvasFns: Array<() => void>;
  isTouchPointer: (event: PointerEvent) => boolean;
  clearPendingTouchSelection: () => void;
  clearPendingDesktopSelection: () => void;
  tryActivatePendingTouchSelection: (pointerId: number) => boolean;
  beginSelectionDrag: (cell: RuntimeCell, pointerId: number) => void;
  noteScrollActivity: () => void;
  getOverlayScrollbarLayout: () => OverlayScrollbarLayout | null;
  pointerToCanvasPx: (event: PointerEvent) => { x: number; y: number };
  setViewportScrollOffset: (nextOffset: number) => void;
  normalizeSelectionCell: (cell: RuntimeCell) => RuntimeCell;
  positionToCell: (event: { clientX: number; clientY: number }) => RuntimeCell;
  scrollViewportByLines: (lines: number) => void;
  clearSelection: () => void;
  updateCanvasCursor: () => void;
  markNeedsRender: () => void;
  updateLinkHover: (cell: RuntimeCell | null) => void;
  getGridState: () => RuntimeGridState;
  getWasmReady: () => boolean;
  getWasmHandle: () => number;
};

export function bindPointerEvents(options: BindPointerEventsOptions) {
  const {
    canvas,
    bindOptions,
    touchSelectionMode,
    touchSelectionLongPressMs,
    touchSelectionMoveThresholdPx,
    selectionState,
    touchSelectionState,
    desktopSelectionState,
    scrollbarDragState,
    linkState,
    cleanupCanvasFns,
    isTouchPointer,
    clearPendingTouchSelection,
    clearPendingDesktopSelection,
    tryActivatePendingTouchSelection,
    beginSelectionDrag,
    noteScrollActivity,
    getOverlayScrollbarLayout,
    pointerToCanvasPx,
    setViewportScrollOffset,
    normalizeSelectionCell,
    positionToCell,
    scrollViewportByLines,
    clearSelection,
    updateCanvasCursor,
    markNeedsRender,
    updateLinkHover,
    getGridState,
    getWasmReady,
    getWasmHandle,
  } = options;

  const { inputHandler, sendKeyInput, openLink } = bindOptions;

  const shouldRoutePointerToAppMouse = (shiftKey: boolean) => {
    if (shiftKey) return false;
    return inputHandler.isMouseActive();
  };

  canvas.style.touchAction =
    touchSelectionMode === "long-press" || touchSelectionMode === "drag"
      ? "none"
      : "pan-y pinch-zoom";

  const onPointerDown = (event: PointerEvent) => {
    if (!isTouchPointer(event) && event.button === 0) {
      const layout = getOverlayScrollbarLayout();
      if (layout) {
        const point = pointerToCanvasPx(event);
        if (isPointInScrollbarHitArea(layout, point.x, point.y)) {
          event.preventDefault();
          noteScrollActivity();
          const hitThumb = isPointInScrollbarThumb(layout, point.x, point.y);
          scrollbarDragState.pointerId = event.pointerId;
          scrollbarDragState.thumbGrabRatio = hitThumb
            ? clamp((point.y - layout.thumbY) / Math.max(1, layout.thumbH), 0, 1)
            : 0.5;
          const targetOffset = scrollbarOffsetForPointerY(
            layout,
            point.y,
            scrollbarDragState.thumbGrabRatio,
          );
          setViewportScrollOffset(targetOffset);
          canvas.setPointerCapture?.(event.pointerId);
          return;
        }
      }
    }

    if (
      shouldRoutePointerToAppMouse(event.shiftKey) &&
      inputHandler.sendMouseEvent("down", event)
    ) {
      clearPendingDesktopSelection();
      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    if (isTouchPointer(event)) {
      if (event.button !== 0) return;
      const cell = normalizeSelectionCell(positionToCell(event));
      touchSelectionState.activePointerId = null;
      touchSelectionState.panPointerId = null;

      if (touchSelectionMode === "off") return;
      if (touchSelectionMode === "drag") {
        event.preventDefault();
        beginSelectionDrag(cell, event.pointerId);
        return;
      }

      clearPendingTouchSelection();
      touchSelectionState.pendingPointerId = event.pointerId;
      touchSelectionState.pendingCell = cell;
      touchSelectionState.pendingStartedAt = performance.now();
      touchSelectionState.pendingStartX = event.clientX;
      touchSelectionState.pendingStartY = event.clientY;
      touchSelectionState.panPointerId = event.pointerId;
      touchSelectionState.panLastY = event.clientY;
      touchSelectionState.pendingTimer = setTimeout(() => {
        tryActivatePendingTouchSelection(event.pointerId);
      }, touchSelectionLongPressMs);
      return;
    }

    if (event.button !== 0) return;
    event.preventDefault();
    const cell = normalizeSelectionCell(positionToCell(event));
    updateLinkHover(cell);
    desktopSelectionState.pendingPointerId = event.pointerId;
    desktopSelectionState.pendingCell = cell;
    desktopSelectionState.startedWithActiveSelection = selectionState.active;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (scrollbarDragState.pointerId === event.pointerId) {
      const layout = getOverlayScrollbarLayout();
      if (!layout) {
        scrollbarDragState.pointerId = null;
        return;
      }
      const point = pointerToCanvasPx(event);
      const targetOffset = scrollbarOffsetForPointerY(
        layout,
        point.y,
        scrollbarDragState.thumbGrabRatio,
      );
      setViewportScrollOffset(targetOffset);
      event.preventDefault();
      return;
    }

    if (isTouchPointer(event)) {
      if (touchSelectionState.pendingPointerId === event.pointerId) {
        const dx = event.clientX - touchSelectionState.pendingStartX;
        const dy = event.clientY - touchSelectionState.pendingStartY;
        if (dx * dx + dy * dy >= touchSelectionMoveThresholdPx * touchSelectionMoveThresholdPx) {
          clearPendingTouchSelection();
        } else {
          tryActivatePendingTouchSelection(event.pointerId);
        }
        if (touchSelectionState.pendingPointerId === event.pointerId) {
          if (
            touchSelectionMode === "long-press" &&
            touchSelectionState.panPointerId === event.pointerId
          ) {
            const deltaPx = touchSelectionState.panLastY - event.clientY;
            touchSelectionState.panLastY = event.clientY;
            scrollViewportByLines((deltaPx / Math.max(1, getGridState().cellH)) * 1.5);
            event.preventDefault();
          }
          return;
        }
      }
      if (selectionState.dragging && touchSelectionState.activePointerId === event.pointerId) {
        const cell = normalizeSelectionCell(positionToCell(event));
        event.preventDefault();
        selectionState.focus = cell;
        updateLinkHover(null);
        updateCanvasCursor();
        markNeedsRender();
        return;
      }
      if (
        touchSelectionMode === "long-press" &&
        touchSelectionState.panPointerId === event.pointerId
      ) {
        const deltaPx = touchSelectionState.panLastY - event.clientY;
        touchSelectionState.panLastY = event.clientY;
        scrollViewportByLines((deltaPx / Math.max(1, getGridState().cellH)) * 1.5);
        event.preventDefault();
      }
      return;
    }

    const cell = normalizeSelectionCell(positionToCell(event));
    if (
      desktopSelectionState.pendingPointerId === event.pointerId &&
      desktopSelectionState.pendingCell
    ) {
      const anchor = desktopSelectionState.pendingCell;
      if (anchor.row !== cell.row || anchor.col !== cell.col) {
        beginSelectionDrag(anchor, event.pointerId);
        selectionState.focus = cell;
        updateLinkHover(null);
        updateCanvasCursor();
        markNeedsRender();
        return;
      }
      updateLinkHover(cell);
      return;
    }

    if (selectionState.dragging) {
      event.preventDefault();
      selectionState.focus = cell;
      updateLinkHover(null);
      updateCanvasCursor();
      markNeedsRender();
      return;
    }

    if (
      shouldRoutePointerToAppMouse(event.shiftKey) &&
      inputHandler.sendMouseEvent("move", event)
    ) {
      event.preventDefault();
      return;
    }

    updateLinkHover(cell);
  };

  const onPointerUp = createPointerUpHandler({
    inputHandler,
    sendKeyInput,
    openLink,
    scrollbarDragState,
    isTouchPointer,
    touchSelectionState,
    selectionState,
    normalizeSelectionCell,
    positionToCell,
    clearPendingTouchSelection,
    clearPendingDesktopSelection,
    desktopSelectionState,
    clearSelection,
    updateCanvasCursor,
    markNeedsRender,
    shouldRoutePointerToAppMouse,
    linkState,
    updateLinkHover,
  });

  const { onPointerCancel, onWheel, onContextMenu, onPointerLeave } = createPointerAuxHandlers({
    inputHandler,
    shouldRoutePointerToAppMouse,
    scrollViewportByLines,
    getWasmReady,
    getWasmHandle,
    getGridState,
    updateLinkHover,
    clearPendingDesktopSelection,
    clearPendingTouchSelection,
    isTouchPointer,
    selectionState,
    touchSelectionState,
    desktopSelectionState,
    scrollbarDragState,
    updateCanvasCursor,
    markNeedsRender,
  });

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);

  cleanupCanvasFns.push(() => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
    clearPendingTouchSelection();
    scrollbarDragState.pointerId = null;
  });
}
