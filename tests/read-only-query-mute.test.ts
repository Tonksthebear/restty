import { expect, test } from "bun:test";
import { createInputHandler } from "../src/input";
import {
  createRuntimeAppApi,
  type RuntimeAppApiSharedState,
} from "../src/runtime/create-runtime/runtime-app-api";

/**
 * Production contract (create-runtime when appOptions.readOnly === true):
 * - createInputHandler({ sendReply: ptySink, suppressQueryReplies: true })
 * - createRuntimeAppApi({ readOnly: true }) short-circuits WASM drain
 *
 * Query replies must not hit the PTY sink. Keyboard and mouse encodings must.
 */

function createReadOnlyHandler(sink: (data: string) => void) {
  return createInputHandler({
    sendReply: sink,
    suppressQueryReplies: true,
    getCursorPosition: () => ({ row: 3, col: 7 }),
    getDefaultColors: () => ({
      fg: { r: 0xaa, g: 0xbb, b: 0xcc },
      bg: { r: 0x11, g: 0x22, b: 0x33 },
      cursor: { r: 0xdd, g: 0xee, b: 0xff },
    }),
    positionToCell: () => ({ row: 0, col: 0 }),
  });
}

test("readOnly mutes OSC 10/11/12, DA, and DSR query replies on the PTY sink", () => {
  const sink: string[] = [];
  const input = createReadOnlyHandler((data) => {
    sink.push(data);
  });

  // Positive control: live handler still replies (proves stimuli are valid).
  const liveSink: string[] = [];
  const live = createInputHandler({
    sendReply: (data) => {
      liveSink.push(data);
    },
    getCursorPosition: () => ({ row: 3, col: 7 }),
    getDefaultColors: () => ({
      fg: { r: 0xaa, g: 0xbb, b: 0xcc },
      bg: { r: 0x11, g: 0x22, b: 0x33 },
      cursor: { r: 0xdd, g: 0xee, b: 0xff },
    }),
  });

  const stimuli = [
    "\x1b]10;?\x07", // OSC 10 fg
    "\x1b]11;?\x07", // OSC 11 bg
    "\x1b]12;?\x07", // OSC 12 cursor
    "\x1b[c", // DA primary
    "\x1b[0c", // DA primary variant
    "\x1b[6n", // DSR CPR
  ];

  for (const seq of stimuli) {
    live.filterOutput(seq);
    input.filterOutput(seq);
  }

  expect(liveSink.length).toBeGreaterThan(0);
  expect(liveSink.some((r) => r.includes("rgb:"))).toBe(true);
  expect(liveSink.some((r) => r.includes("?1;2c") || r.endsWith("c"))).toBe(true);
  expect(liveSink.some((r) => r.includes("R"))).toBe(true);

  // readOnly / suppressQueryReplies: zero replies on the shared PTY sink.
  expect(sink).toEqual([]);
});

test("readOnly keeps Kitty key encode and mouse encode on the same PTY sink", () => {
  const sink: string[] = [];
  // Production path: getKittyKeyboardFlags reads live WASM flags after GHOSTSNP.
  const KITTY_FLAG_DISAMBIGUATE = 1 << 0;
  const input = createInputHandler({
    sendReply: (data) => {
      sink.push(data);
    },
    suppressQueryReplies: true,
    getCursorPosition: () => ({ row: 3, col: 7 }),
    getDefaultColors: () => ({
      fg: { r: 0xaa, g: 0xbb, b: 0xcc },
      bg: { r: 0x11, g: 0x22, b: 0x33 },
      cursor: { r: 0xdd, g: 0xee, b: 0xff },
    }),
    positionToCell: () => ({ row: 0, col: 0 }),
    getKittyKeyboardFlags: () => KITTY_FLAG_DISAMBIGUATE,
  });

  // Kitty keyboard encode path (sendKeyInput → ptyTransport.sendInput), not sendReply.
  const kittySeq = input.encodeKeyEvent({
    key: "a",
    code: "KeyA",
    type: "keydown",
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    getModifierState: () => false,
  } as unknown as KeyboardEvent);
  expect(kittySeq).toBe("\x1b[97;5u");

  // Mouse encode uses the same sendReply sink as query replies would —
  // after rehydrate it must still emit SGR reports while queries stay muted.
  input.setMouseMode("auto");
  input.rehydrateMouseFromTrackingBits?.((1 << 1) | (1 << 5)); // 1000 + 1006
  expect(input.isMouseActive()).toBe(true);

  const wheel = {
    deltaY: 40,
    deltaMode: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
  } as WheelEvent;
  expect(input.sendMouseEvent("wheel", wheel)).toBe(true);
  expect(sink.length).toBeGreaterThan(0);
  expect(sink[0]!.startsWith("\u001b[<")).toBe(true);

  // Queries still produce zero additional sink traffic.
  const before = sink.length;
  input.filterOutput("\x1b]10;?\x07\x1b[c\x1b[6n");
  expect(sink.length).toBe(before);
});

test("readOnly createRuntimeAppApi discards WASM drainOutput without PTY sendInput", () => {
  const sent: string[] = [];
  let drainCalls = 0;
  let remaining = 2;

  const sharedState: RuntimeAppApiSharedState = {
    wasm: {
      drainOutput: () => {
        drainCalls += 1;
        if (remaining <= 0) return null;
        remaining -= 1;
        return "\x1b[?1;2c";
      },
      write: () => undefined,
      writeBytes: () => undefined,
      setPixelSize: () => undefined,
      renderUpdate: () => undefined,
    } as never,
    wasmExports: null,
    wasmHandle: 1,
    wasmReady: true,
    activeState: null,
    needsRender: false,
    lastRenderTime: 0,
    currentContextType: null,
    isFocused: false,
    lastKeydownSeq: "",
    lastKeydownSeqAt: 0,
  };

  const runtime = createRuntimeAppApi({
    session: {} as never,
    ptyTransport: {
      isConnected: () => true,
      connect: () => undefined,
      disconnect: () => undefined,
      sendInput: (data: string) => {
        sent.push(data);
      },
      resize: () => undefined,
    } as never,
    inputHandler: {
      encodeKeyEvent: () => "",
      isSynchronizedOutput: () => false,
      setMouseMode: () => undefined,
      getMouseStatus: () => "auto",
    } as never,
    ptyInputRuntime: {
      setPtyStatus: () => undefined,
      updateMouseStatus: () => undefined,
      scheduleSyncOutputReset: () => undefined,
      cancelSyncOutputReset: () => undefined,
      connectPty: () => undefined,
      disconnectPty: () => undefined,
      sendKeyInput: () => undefined,
      sendPasteText: () => undefined,
      sendPastePayloadFromDataTransfer: () => false,
      getCprPosition: () => ({ row: 1, col: 1 }),
    } as never,
    interaction: {
      selectionState: { active: false, dragging: false },
      linkState: { hoverId: null, hoverUri: null },
      imeState: { composing: false, preedit: "", selectionStart: 0, selectionEnd: 0 },
      clearSelection: () => undefined,
      updateLinkHover: () => undefined,
    } as never,
    lifecycleThemeSizeRuntime: {
      cancelScheduledSizeUpdate: () => undefined,
      getActiveTheme: () => null,
    },
    cleanupFns: [],
    cleanupCanvasFns: [],
    callbacks: undefined,
    fpsEl: null,
    backendEl: null,
    inputDebugEl: null,
    imeInput: null,
    attachWindowEvents: false,
    isMacPlatform: false,
    textEncoder: new TextEncoder(),
    readState: () => sharedState,
    writeState: (patch) => Object.assign(sharedState, patch),
    appendLog: () => undefined,
    shouldSuppressWasmLog: () => false,
    runBeforeInputHook: (text) => text,
    runBeforeRenderOutputHook: (text) => text,
    runBeforeRenderOutputBytesHook: () => true,
    getSelectionText: () => "",
    initialPreferredRenderer: "auto",
    readOnly: true,
    CURSOR_BLINK_MS: 600,
    RESIZE_ACTIVE_MS: 180,
    TARGET_RENDER_FPS: 60,
    BACKGROUND_RENDER_FPS: 15,
    KITTY_FLAG_REPORT_EVENTS: 1 << 1,
    resizeState: { lastAt: 0 },
    tickWebGPU: () => undefined,
    tickWebGL: () => undefined,
    updateGrid: () => undefined,
    gridState: { cols: 80, rows: 24 },
    getCanvas: () => ({ width: 800, height: 480 }) as HTMLCanvasElement,
    applyTheme: () => undefined,
    ensureFont: async () => undefined,
    updateSize: () => undefined,
    log: () => undefined,
    replaceCanvas: () => undefined,
    rebuildWebGPUShaderStages: () => undefined,
    rebuildWebGLShaderStages: () => undefined,
    setShaderStagesDirty: () => undefined,
    clearWebGPUShaderStages: () => undefined,
    destroyWebGPUStageTargets: () => undefined,
    clearWebGLShaderStages: () => undefined,
    destroyWebGLStageTargets: () => undefined,
    markSearchDirty: () => undefined,
    handleSearchWasmReset: () => undefined,
  });

  // sendInput triggers flushWasmOutputToPty after write.
  runtime.sendInput("x", "program");
  expect(drainCalls).toBeGreaterThan(0);
  expect(sent).toEqual([]);
});
