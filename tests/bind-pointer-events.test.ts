import { expect, test } from "bun:test";
import type { InputHandler } from "../src/input";
import { bindPointerEvents } from "../src/runtime/create-runtime/interaction-runtime/bind-pointer-events";

type Listener = EventListenerOrEventListenerObject;

class FakeCanvas {
  style: Record<string, string> = {};
  private listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener | null): void {
    if (!listener) return;
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set<Listener>();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: Listener | null): void {
    if (!listener) return;
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: Event): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of set) {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }

  setPointerCapture(): void {}

  releasePointerCapture(): void {}
}

function createInputHandlerStub(options: {
  sendMouseEvent: (kind: "down" | "up" | "move" | "wheel") => boolean;
  mouseActive?: boolean;
  altScreen?: boolean;
}): InputHandler {
  return {
    sequences: {
      enter: "\r",
      backspace: "\x7f",
      delete: "\x1b[3~",
      tab: "\t",
      shiftTab: "\x1b[Z",
      escape: "\x1b",
    },
    encodeKeyEvent: () => "",
    encodeBeforeInput: () => "",
    mapKeyForPty: (seq: string) => seq,
    filterOutput: (output: string) => output,
    setReplySink: () => {},
    setCursorProvider: () => {},
    setPositionToCell: () => {},
    setPositionToPixel: () => {},
    setWindowOpHandler: () => {},
    setMouseMode: () => {},
    getMouseStatus: () => ({
      mode: "auto",
      active: options.mouseActive ?? true,
      detail: "sgr",
      enabled: true,
    }),
    isMouseActive: () => options.mouseActive ?? true,
    isBracketedPaste: () => false,
    isFocusReporting: () => false,
    isAltScreen: () => options.altScreen ?? true,
    isSynchronizedOutput: () => false,
    isPromptClickEventsEnabled: () => false,
    encodePromptClickEvent: () => "",
    sendMouseEvent: (kind) => options.sendMouseEvent(kind),
  };
}

function createPointerEvent(
  overrides: Partial<PointerEvent> = {},
): { event: PointerEvent; prevented: () => boolean } {
  let prevented = false;
  const event = {
    button: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    pointerType: "mouse",
    pointerId: 1,
    clientX: 12,
    clientY: 8,
    preventDefault: () => {
      prevented = true;
    },
    ...overrides,
  } as PointerEvent;
  return { event, prevented: () => prevented };
}

test("bindPointerEvents routes primary click to app mouse when mouse reporting is active", () => {
  const mouseKinds: string[] = [];
  const canvas = new FakeCanvas();
  const desktopSelectionState = {
    pendingPointerId: null,
    pendingCell: null,
    startedWithActiveSelection: false,
  };

  bindPointerEvents({
    canvas: canvas as unknown as HTMLCanvasElement,
    bindOptions: {
      inputHandler: createInputHandlerStub({
        sendMouseEvent: (kind) => {
          mouseKinds.push(kind);
          return true;
        },
      }),
      sendKeyInput: () => {},
      sendPasteText: () => {},
      sendPastePayloadFromDataTransfer: () => false,
      getLastKeydownSeq: () => "",
      getLastKeydownSeqAt: () => 0,
      keydownBeforeinputDedupeMs: 80,
      openLink: () => {},
    },
    touchSelectionMode: "off",
    touchSelectionLongPressMs: 450,
    touchSelectionMoveThresholdPx: 10,
    selectionState: { active: false, dragging: false, anchor: null, focus: null },
    touchSelectionState: {
      pendingPointerId: null,
      activePointerId: null,
      panPointerId: null,
      pendingCell: null,
      pendingStartedAt: 0,
      pendingStartX: 0,
      pendingStartY: 0,
      panLastY: 0,
      pendingTimer: 0,
    },
    desktopSelectionState,
    scrollbarDragState: { pointerId: null, thumbGrabRatio: 0.5 },
    linkState: { hoverId: 0, hoverUri: "" },
    cleanupCanvasFns: [],
    isTouchPointer: (event) => event.pointerType === "touch",
    clearPendingTouchSelection: () => {},
    clearPendingDesktopSelection: () => {
      desktopSelectionState.pendingPointerId = null;
      desktopSelectionState.pendingCell = null;
      desktopSelectionState.startedWithActiveSelection = false;
    },
    tryActivatePendingTouchSelection: () => false,
    beginSelectionDrag: () => {},
    noteScrollActivity: () => {},
    getOverlayScrollbarLayout: () => null,
    pointerToCanvasPx: () => ({ x: 0, y: 0 }),
    setViewportScrollOffset: () => {},
    normalizeSelectionCell: (cell) => cell,
    positionToCell: () => ({ row: 0, col: 0 }),
    scrollViewportByLines: () => {},
    clearSelection: () => {},
    updateCanvasCursor: () => {},
    markNeedsRender: () => {},
    updateLinkHover: () => {},
    getGridState: () => ({ cols: 80, rows: 24, cellW: 10, cellH: 20 }),
    getWasmReady: () => true,
    getWasmHandle: () => 1,
  });

  const down = createPointerEvent();
  canvas.emit("pointerdown", down.event as unknown as Event);
  expect(mouseKinds).toEqual(["down"]);
  expect(down.prevented()).toBe(true);
  expect(desktopSelectionState.pendingPointerId).toBeNull();

  const up = createPointerEvent();
  canvas.emit("pointerup", up.event as unknown as Event);
  expect(mouseKinds).toEqual(["down", "up"]);
  expect(up.prevented()).toBe(true);
});

test("bindPointerEvents keeps Shift+click as local selection bypass", () => {
  const mouseKinds: string[] = [];
  const canvas = new FakeCanvas();
  const desktopSelectionState = {
    pendingPointerId: null as number | null,
    pendingCell: null as { row: number; col: number } | null,
    startedWithActiveSelection: false,
  };

  bindPointerEvents({
    canvas: canvas as unknown as HTMLCanvasElement,
    bindOptions: {
      inputHandler: createInputHandlerStub({
        sendMouseEvent: (kind) => {
          mouseKinds.push(kind);
          return true;
        },
      }),
      sendKeyInput: () => {},
      sendPasteText: () => {},
      sendPastePayloadFromDataTransfer: () => false,
      getLastKeydownSeq: () => "",
      getLastKeydownSeqAt: () => 0,
      keydownBeforeinputDedupeMs: 80,
      openLink: () => {},
    },
    touchSelectionMode: "off",
    touchSelectionLongPressMs: 450,
    touchSelectionMoveThresholdPx: 10,
    selectionState: { active: false, dragging: false, anchor: null, focus: null },
    touchSelectionState: {
      pendingPointerId: null,
      activePointerId: null,
      panPointerId: null,
      pendingCell: null,
      pendingStartedAt: 0,
      pendingStartX: 0,
      pendingStartY: 0,
      panLastY: 0,
      pendingTimer: 0,
    },
    desktopSelectionState,
    scrollbarDragState: { pointerId: null, thumbGrabRatio: 0.5 },
    linkState: { hoverId: 0, hoverUri: "" },
    cleanupCanvasFns: [],
    isTouchPointer: (event) => event.pointerType === "touch",
    clearPendingTouchSelection: () => {},
    clearPendingDesktopSelection: () => {
      desktopSelectionState.pendingPointerId = null;
      desktopSelectionState.pendingCell = null;
      desktopSelectionState.startedWithActiveSelection = false;
    },
    tryActivatePendingTouchSelection: () => false,
    beginSelectionDrag: () => {},
    noteScrollActivity: () => {},
    getOverlayScrollbarLayout: () => null,
    pointerToCanvasPx: () => ({ x: 0, y: 0 }),
    setViewportScrollOffset: () => {},
    normalizeSelectionCell: (cell) => cell,
    positionToCell: () => ({ row: 1, col: 1 }),
    scrollViewportByLines: () => {},
    clearSelection: () => {},
    updateCanvasCursor: () => {},
    markNeedsRender: () => {},
    updateLinkHover: () => {},
    getGridState: () => ({ cols: 80, rows: 24, cellW: 10, cellH: 20 }),
    getWasmReady: () => true,
    getWasmHandle: () => 1,
  });

  const down = createPointerEvent({ shiftKey: true, pointerId: 7 });
  canvas.emit("pointerdown", down.event as unknown as Event);
  expect(mouseKinds).toEqual([]);
  expect(down.prevented()).toBe(true);
  expect(desktopSelectionState.pendingPointerId).toBe(7);
});

test("bindPointerEvents routes mouse when reporting is active even outside alt-screen", () => {
  const mouseKinds: string[] = [];
  const canvas = new FakeCanvas();

  bindPointerEvents({
    canvas: canvas as unknown as HTMLCanvasElement,
    bindOptions: {
      inputHandler: createInputHandlerStub({
        altScreen: false,
        sendMouseEvent: (kind) => {
          mouseKinds.push(kind);
          return true;
        },
      }),
      sendKeyInput: () => {},
      sendPasteText: () => {},
      sendPastePayloadFromDataTransfer: () => false,
      getLastKeydownSeq: () => "",
      getLastKeydownSeqAt: () => 0,
      keydownBeforeinputDedupeMs: 80,
      openLink: () => {},
    },
    touchSelectionMode: "off",
    touchSelectionLongPressMs: 450,
    touchSelectionMoveThresholdPx: 10,
    selectionState: { active: false, dragging: false, anchor: null, focus: null },
    touchSelectionState: {
      pendingPointerId: null,
      activePointerId: null,
      panPointerId: null,
      pendingCell: null,
      pendingStartedAt: 0,
      pendingStartX: 0,
      pendingStartY: 0,
      panLastY: 0,
      pendingTimer: 0,
    },
    desktopSelectionState: {
      pendingPointerId: null,
      pendingCell: null,
      startedWithActiveSelection: false,
    },
    scrollbarDragState: { pointerId: null, thumbGrabRatio: 0.5 },
    linkState: { hoverId: 0, hoverUri: "" },
    cleanupCanvasFns: [],
    isTouchPointer: (event) => event.pointerType === "touch",
    clearPendingTouchSelection: () => {},
    clearPendingDesktopSelection: () => {},
    tryActivatePendingTouchSelection: () => false,
    beginSelectionDrag: () => {},
    noteScrollActivity: () => {},
    getOverlayScrollbarLayout: () => null,
    pointerToCanvasPx: () => ({ x: 0, y: 0 }),
    setViewportScrollOffset: () => {},
    normalizeSelectionCell: (cell) => cell,
    positionToCell: () => ({ row: 0, col: 0 }),
    scrollViewportByLines: () => {},
    clearSelection: () => {},
    updateCanvasCursor: () => {},
    markNeedsRender: () => {},
    updateLinkHover: () => {},
    getGridState: () => ({ cols: 80, rows: 24, cellW: 10, cellH: 20 }),
    getWasmReady: () => true,
    getWasmHandle: () => 1,
  });

  const down = createPointerEvent();
  canvas.emit("pointerdown", down.event as unknown as Event);
  expect(mouseKinds).toEqual(["down"]);
  expect(down.prevented()).toBe(true);
});
