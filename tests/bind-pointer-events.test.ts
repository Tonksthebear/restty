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
  sendMouseEvent: (
    kind: "down" | "up" | "move" | "wheel",
    event: PointerEvent | WheelEvent,
  ) => boolean;
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
    sendMouseEvent: (kind, event) => options.sendMouseEvent(kind, event),
  };
}

function createPointerEvent(overrides: Partial<PointerEvent> = {}): {
  event: PointerEvent;
  prevented: () => boolean;
} {
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

function createMouseEvent(overrides: Partial<MouseEvent> = {}): {
  event: MouseEvent;
  prevented: () => boolean;
} {
  let prevented = false;
  const event = {
    shiftKey: false,
    preventDefault: () => {
      prevented = true;
    },
    ...overrides,
  } as MouseEvent;
  return { event, prevented: () => prevented };
}

function createWheelEvent(overrides: Partial<WheelEvent> = {}): {
  event: WheelEvent;
  prevented: () => boolean;
} {
  let prevented = false;
  const event = {
    shiftKey: false,
    deltaY: 40,
    deltaMode: 0,
    preventDefault: () => {
      prevented = true;
    },
    ...overrides,
  } as WheelEvent;
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
    linkState: { hoverId: 0, hoverUri: "" },
    cleanupCanvasFns: [],
    isTouchPointer: (event) => event.pointerType === "touch",
    clearPendingTouchSelection: () => {},
    clearPendingDesktopSelection: () => {},
    tryActivatePendingTouchSelection: () => false,
    beginSelectionDrag: () => {},
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

test("bindPointerEvents keeps Shift+contextmenu as local bypass", () => {
  const canvas = new FakeCanvas();

  bindPointerEvents({
    canvas: canvas as unknown as HTMLCanvasElement,
    bindOptions: {
      inputHandler: createInputHandlerStub({
        sendMouseEvent: () => true,
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
    linkState: { hoverId: 0, hoverUri: "" },
    cleanupCanvasFns: [],
    isTouchPointer: (event) => event.pointerType === "touch",
    clearPendingTouchSelection: () => {},
    clearPendingDesktopSelection: () => {},
    tryActivatePendingTouchSelection: () => false,
    beginSelectionDrag: () => {},
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

  const normalContextMenu = createMouseEvent();
  canvas.emit("contextmenu", normalContextMenu.event as unknown as Event);
  expect(normalContextMenu.prevented()).toBe(true);

  const shiftContextMenu = createMouseEvent({ shiftKey: true });
  canvas.emit("contextmenu", shiftContextMenu.event as unknown as Event);
  expect(shiftContextMenu.prevented()).toBe(false);
});

test("bindPointerEvents routes wheel through native-host scroll handler", () => {
  const canvas = new FakeCanvas();
  let wheelCalls = 0;

  bindPointerEvents({
    canvas: canvas as unknown as HTMLCanvasElement,
    bindOptions: {
      inputHandler: createInputHandlerStub({
        mouseActive: false,
        sendMouseEvent: () => false,
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
    linkState: { hoverId: 0, hoverUri: "" },
    cleanupCanvasFns: [],
    isTouchPointer: (event) => event.pointerType === "touch",
    clearPendingTouchSelection: () => {},
    clearPendingDesktopSelection: () => {},
    tryActivatePendingTouchSelection: () => false,
    beginSelectionDrag: () => {},
    normalizeSelectionCell: (cell) => cell,
    positionToCell: () => ({ row: 0, col: 0 }),
    scrollViewportByLines: () => {
      throw new Error("line scroll path should not run");
    },
    scrollViewportByWheel: () => {
      wheelCalls += 1;
    },
    clearSelection: () => {},
    updateCanvasCursor: () => {},
    markNeedsRender: () => {},
    updateLinkHover: () => {},
    getGridState: () => ({ cols: 80, rows: 24, cellW: 10, cellH: 20 }),
    getWasmReady: () => true,
    getWasmHandle: () => 1,
  });

  const wheel = createWheelEvent();
  canvas.emit("wheel", wheel.event as unknown as Event);
  expect(wheelCalls).toBe(1);
  expect(wheel.prevented()).toBe(true);
});

test("bindPointerEvents maps touch pan to mouse wheel when mouse tracking is active", () => {
  const mouseKinds: string[] = [];
  const wheelDeltas: Array<{ deltaY: number; deltaMode: number }> = [];
  let lineScrolls = 0;
  const canvas = new FakeCanvas();
  const touchSelectionState = {
    pendingPointerId: null as number | null,
    activePointerId: null as number | null,
    panPointerId: null as number | null,
    pendingCell: null as { row: number; col: number } | null,
    pendingStartedAt: 0,
    pendingStartX: 0,
    pendingStartY: 0,
    panLastY: 0,
    pendingTimer: 0,
  };

  bindPointerEvents({
    canvas: canvas as unknown as HTMLCanvasElement,
    bindOptions: {
      inputHandler: createInputHandlerStub({
        mouseActive: true,
        sendMouseEvent: (kind, event) => {
          mouseKinds.push(kind);
          if (kind === "wheel") {
            const wheel = event as WheelEvent;
            wheelDeltas.push({ deltaY: wheel.deltaY, deltaMode: wheel.deltaMode });
          }
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
    touchSelectionMode: "long-press",
    touchSelectionLongPressMs: 450,
    touchSelectionMoveThresholdPx: 10,
    selectionState: { active: false, dragging: false, anchor: null, focus: null },
    touchSelectionState,
    desktopSelectionState: {
      pendingPointerId: null,
      pendingCell: null,
      startedWithActiveSelection: false,
    },
    linkState: { hoverId: 0, hoverUri: "" },
    cleanupCanvasFns: [],
    isTouchPointer: (event) => event.pointerType === "touch",
    clearPendingTouchSelection: () => {
      touchSelectionState.pendingPointerId = null;
      touchSelectionState.pendingCell = null;
    },
    clearPendingDesktopSelection: () => {},
    tryActivatePendingTouchSelection: () => false,
    beginSelectionDrag: () => {},
    normalizeSelectionCell: (cell) => cell,
    positionToCell: () => ({ row: 2, col: 3 }),
    scrollViewportByLines: () => {
      lineScrolls += 1;
    },
    scrollViewportByWheel: () => {
      throw new Error("local wheel path should not run for app mouse pan");
    },
    clearSelection: () => {},
    updateCanvasCursor: () => {},
    markNeedsRender: () => {},
    updateLinkHover: () => {},
    getGridState: () => ({ cols: 80, rows: 24, cellW: 10, cellH: 20 }),
    getWasmReady: () => true,
    getWasmHandle: () => 1,
  });

  // Must not send mouse "down" on touch press when we will pan-to-wheel.
  const down = createPointerEvent({
    pointerType: "touch",
    pointerId: 7,
    clientY: 100,
  });
  canvas.emit("pointerdown", down.event as unknown as Event);
  expect(mouseKinds).toEqual([]);
  expect(touchSelectionState.panPointerId).toBe(7);

  // Finger moves up 40px → synthetic wheel with negative deltaY → app mouse "wheel".
  const move = createPointerEvent({
    pointerType: "touch",
    pointerId: 7,
    clientY: 60,
  });
  canvas.emit("pointermove", move.event as unknown as Event);
  expect(mouseKinds).toEqual(["wheel"]);
  expect(wheelDeltas).toEqual([{ deltaY: -40, deltaMode: 0 }]);
  expect(lineScrolls).toBe(0);
  expect(move.prevented()).toBe(true);
});

test("bindPointerEvents touch pan uses local scroll when mouse tracking is off", () => {
  let lineScrolls = 0;
  const canvas = new FakeCanvas();
  const touchSelectionState = {
    pendingPointerId: null as number | null,
    activePointerId: null as number | null,
    panPointerId: null as number | null,
    pendingCell: null as { row: number; col: number } | null,
    pendingStartedAt: 0,
    pendingStartX: 0,
    pendingStartY: 0,
    panLastY: 0,
    pendingTimer: 0,
  };

  bindPointerEvents({
    canvas: canvas as unknown as HTMLCanvasElement,
    bindOptions: {
      inputHandler: createInputHandlerStub({
        mouseActive: false,
        sendMouseEvent: () => {
          throw new Error("mouse path should not run");
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
    touchSelectionMode: "long-press",
    touchSelectionLongPressMs: 450,
    touchSelectionMoveThresholdPx: 10,
    selectionState: { active: false, dragging: false, anchor: null, focus: null },
    touchSelectionState,
    desktopSelectionState: {
      pendingPointerId: null,
      pendingCell: null,
      startedWithActiveSelection: false,
    },
    linkState: { hoverId: 0, hoverUri: "" },
    cleanupCanvasFns: [],
    isTouchPointer: (event) => event.pointerType === "touch",
    clearPendingTouchSelection: () => {
      touchSelectionState.pendingPointerId = null;
    },
    clearPendingDesktopSelection: () => {},
    tryActivatePendingTouchSelection: () => false,
    beginSelectionDrag: () => {},
    normalizeSelectionCell: (cell) => cell,
    positionToCell: () => ({ row: 0, col: 0 }),
    scrollViewportByLines: () => {
      lineScrolls += 1;
    },
    clearSelection: () => {},
    updateCanvasCursor: () => {},
    markNeedsRender: () => {},
    updateLinkHover: () => {},
    getGridState: () => ({ cols: 80, rows: 24, cellW: 10, cellH: 20 }),
    getWasmReady: () => true,
    getWasmHandle: () => 1,
  });

  canvas.emit(
    "pointerdown",
    createPointerEvent({ pointerType: "touch", pointerId: 3, clientY: 200 })
      .event as unknown as Event,
  );
  canvas.emit(
    "pointermove",
    createPointerEvent({ pointerType: "touch", pointerId: 3, clientY: 140 })
      .event as unknown as Event,
  );
  expect(lineScrolls).toBe(1);
});

test("bindPointerEvents touch pan falls back to local scroll when app mouse refuses the wheel", () => {
  let lineScrolls = 0;
  let wheelCalls = 0;
  const canvas = new FakeCanvas();
  const touchSelectionState = {
    pendingPointerId: null as number | null,
    activePointerId: null as number | null,
    panPointerId: null as number | null,
    pendingCell: null as { row: number; col: number } | null,
    pendingStartedAt: 0,
    pendingStartX: 0,
    pendingStartY: 0,
    panLastY: 0,
    pendingTimer: 0,
  };

  bindPointerEvents({
    canvas: canvas as unknown as HTMLCanvasElement,
    bindOptions: {
      inputHandler: createInputHandlerStub({
        mouseActive: true,
        sendMouseEvent: () => false,
      }),
      sendKeyInput: () => {},
      sendPasteText: () => {},
      sendPastePayloadFromDataTransfer: () => false,
      getLastKeydownSeq: () => "",
      getLastKeydownSeqAt: () => 0,
      keydownBeforeinputDedupeMs: 80,
      openLink: () => {},
    },
    touchSelectionMode: "long-press",
    touchSelectionLongPressMs: 450,
    touchSelectionMoveThresholdPx: 10,
    selectionState: { active: false, dragging: false, anchor: null, focus: null },
    touchSelectionState,
    desktopSelectionState: {
      pendingPointerId: null,
      pendingCell: null,
      startedWithActiveSelection: false,
    },
    linkState: { hoverId: 0, hoverUri: "" },
    cleanupCanvasFns: [],
    isTouchPointer: (event) => event.pointerType === "touch",
    clearPendingTouchSelection: () => {
      touchSelectionState.pendingPointerId = null;
    },
    clearPendingDesktopSelection: () => {},
    tryActivatePendingTouchSelection: () => false,
    beginSelectionDrag: () => {},
    normalizeSelectionCell: (cell) => cell,
    positionToCell: () => ({ row: 0, col: 0 }),
    scrollViewportByLines: () => {
      lineScrolls += 1;
    },
    scrollViewportByWheel: () => {
      wheelCalls += 1;
    },
    clearSelection: () => {},
    updateCanvasCursor: () => {},
    markNeedsRender: () => {},
    updateLinkHover: () => {},
    getGridState: () => ({ cols: 80, rows: 24, cellW: 10, cellH: 20 }),
    getWasmReady: () => true,
    getWasmHandle: () => 1,
  });

  canvas.emit(
    "pointerdown",
    createPointerEvent({ pointerType: "touch", pointerId: 4, clientY: 80 })
      .event as unknown as Event,
  );
  canvas.emit(
    "pointermove",
    createPointerEvent({ pointerType: "touch", pointerId: 4, clientY: 40 })
      .event as unknown as Event,
  );
  expect(lineScrolls).toBe(1);
  expect(wheelCalls).toBe(0);
});

test("bindPointerEvents touch pan with selection off still uses wheel when mouse is active", () => {
  const mouseKinds: string[] = [];
  let lineScrolls = 0;
  const canvas = new FakeCanvas();
  const touchSelectionState = {
    pendingPointerId: null as number | null,
    activePointerId: null as number | null,
    panPointerId: null as number | null,
    pendingCell: null as { row: number; col: number } | null,
    pendingStartedAt: 0,
    pendingStartX: 0,
    pendingStartY: 0,
    panLastY: 0,
    pendingTimer: 0,
  };

  bindPointerEvents({
    canvas: canvas as unknown as HTMLCanvasElement,
    bindOptions: {
      inputHandler: createInputHandlerStub({
        mouseActive: true,
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
    touchSelectionState,
    desktopSelectionState: {
      pendingPointerId: null,
      pendingCell: null,
      startedWithActiveSelection: false,
    },
    linkState: { hoverId: 0, hoverUri: "" },
    cleanupCanvasFns: [],
    isTouchPointer: (event) => event.pointerType === "touch",
    clearPendingTouchSelection: () => {},
    clearPendingDesktopSelection: () => {},
    tryActivatePendingTouchSelection: () => false,
    beginSelectionDrag: () => {},
    normalizeSelectionCell: (cell) => cell,
    positionToCell: () => ({ row: 0, col: 0 }),
    scrollViewportByLines: () => {
      lineScrolls += 1;
    },
    clearSelection: () => {},
    updateCanvasCursor: () => {},
    markNeedsRender: () => {},
    updateLinkHover: () => {},
    getGridState: () => ({ cols: 80, rows: 24, cellW: 10, cellH: 20 }),
    getWasmReady: () => true,
    getWasmHandle: () => 1,
  });

  canvas.emit(
    "pointerdown",
    createPointerEvent({ pointerType: "touch", pointerId: 9, clientY: 50 })
      .event as unknown as Event,
  );
  canvas.emit(
    "pointermove",
    createPointerEvent({ pointerType: "touch", pointerId: 9, clientY: 10 })
      .event as unknown as Event,
  );
  expect(mouseKinds).toEqual(["wheel"]);
  expect(lineScrolls).toBe(0);
});

test("bindPointerEvents routes desktop wheel to app mouse without local scroll", () => {
  const mouseKinds: string[] = [];
  let localWheels = 0;
  const canvas = new FakeCanvas();

  bindPointerEvents({
    canvas: canvas as unknown as HTMLCanvasElement,
    bindOptions: {
      inputHandler: createInputHandlerStub({
        mouseActive: true,
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
    linkState: { hoverId: 0, hoverUri: "" },
    cleanupCanvasFns: [],
    isTouchPointer: (event) => event.pointerType === "touch",
    clearPendingTouchSelection: () => {},
    clearPendingDesktopSelection: () => {},
    tryActivatePendingTouchSelection: () => false,
    beginSelectionDrag: () => {},
    normalizeSelectionCell: (cell) => cell,
    positionToCell: () => ({ row: 0, col: 0 }),
    scrollViewportByLines: () => {
      throw new Error("line scroll path should not run");
    },
    scrollViewportByWheel: () => {
      localWheels += 1;
    },
    clearSelection: () => {},
    updateCanvasCursor: () => {},
    markNeedsRender: () => {},
    updateLinkHover: () => {},
    getGridState: () => ({ cols: 80, rows: 24, cellW: 10, cellH: 20 }),
    getWasmReady: () => true,
    getWasmHandle: () => 1,
  });

  const wheel = createWheelEvent({ deltaY: 12, deltaMode: 0 });
  canvas.emit("wheel", wheel.event as unknown as Event);
  expect(mouseKinds).toEqual(["wheel"]);
  expect(localWheels).toBe(0);
  expect(wheel.prevented()).toBe(true);
});
