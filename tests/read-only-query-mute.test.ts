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

const DEFAULT_COLORS = {
  fg: [0xaa, 0xbb, 0xcc] as [number, number, number],
  bg: [0x11, 0x22, 0x33] as [number, number, number],
  cursor: [0xdd, 0xee, 0xff] as [number, number, number],
};

/** Match OutputFilter OSC color reply encoding (8-bit → 16-bit hex). */
function oscColorReply(code: string, rgb: [number, number, number]): string {
  const toHex4 = (value: number) =>
    Math.round(Math.max(0, Math.min(255, value)) * 257)
      .toString(16)
      .padStart(4, "0");
  return `\u001b]${code};rgb:${toHex4(rgb[0])}/${toHex4(rgb[1])}/${toHex4(rgb[2])}\u0007`;
}

const OSC10 = oscColorReply("10", DEFAULT_COLORS.fg);
const OSC11 = oscColorReply("11", DEFAULT_COLORS.bg);
const OSC12 = oscColorReply("12", DEFAULT_COLORS.cursor);

function createReadOnlyHandler(sink: (data: string) => void) {
  return createInputHandler({
    sendReply: sink,
    suppressQueryReplies: true,
    getCursorPosition: () => ({ row: 3, col: 7 }),
    getDefaultColors: () => DEFAULT_COLORS,
    positionToCell: () => ({ row: 0, col: 0 }),
  });
}

test("readOnly mutes OSC 10/11/12, DA, and DSR query replies on the PTY sink", () => {
  const sink: string[] = [];
  const input = createReadOnlyHandler((data) => {
    sink.push(data);
  });

  // Positive control: live handler emits exact well-formed replies.
  const liveSink: string[] = [];
  const live = createInputHandler({
    sendReply: (data) => {
      liveSink.push(data);
    },
    getCursorPosition: () => ({ row: 3, col: 7 }),
    getDefaultColors: () => DEFAULT_COLORS,
  });

  live.filterOutput("\u001b]10;?\u0007");
  live.filterOutput("\u001b]11;?\u0007");
  live.filterOutput("\u001b]12;?\u0007");
  live.filterOutput("\u001b[c");
  live.filterOutput("\u001b[0c");
  live.filterOutput("\u001b[6n");

  expect(liveSink).toEqual([OSC10, OSC11, OSC12, "\u001b[?1;2c", "\u001b[?1;2c", "\u001b[3;7R"]);

  // Same stimuli through readOnly handler → zero PTY sink traffic.
  input.filterOutput("\u001b]10;?\u0007");
  input.filterOutput("\u001b]11;?\u0007");
  input.filterOutput("\u001b]12;?\u0007");
  input.filterOutput("\u001b[c");
  input.filterOutput("\u001b[0c");
  input.filterOutput("\u001b[6n");
  expect(sink).toEqual([]);
});

test("readOnly keeps Kitty key encode and mouse encode on the same PTY sink", () => {
  const sink: string[] = [];
  const KITTY_FLAG_DISAMBIGUATE = 1 << 0;
  const input = createInputHandler({
    sendReply: (data) => {
      sink.push(data);
    },
    suppressQueryReplies: true,
    getCursorPosition: () => ({ row: 3, col: 7 }),
    getDefaultColors: () => DEFAULT_COLORS,
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
  expect(kittySeq).toBe("\u001b[97;5u");

  // Mouse encode uses the same sendReply sink as query replies would —
  // after rehydrate it must still emit SGR reports while queries stay muted.
  input.setMouseMode("auto");
  input.rehydrateMouseFromTrackingBits?.((1 << 1) | (1 << 5)); // 1000 + 1006
  expect(input.isMouseActive()).toBe(true);

  const wheel = {
    deltaY: 1,
    deltaMode: 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
  } as WheelEvent;
  expect(input.sendMouseEvent("wheel", wheel)).toBe(true);
  expect(sink.length).toBeGreaterThan(0);
  expect(sink[0]!.startsWith("\u001b[<")).toBe(true);

  // Queries still produce zero additional sink traffic.
  const before = sink.length;
  input.filterOutput("\u001b]10;?\u0007\u001b[c\u001b[6n");
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
        return "\u001b[?1;2c";
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

  runtime.sendInput("x", "program");
  expect(drainCalls).toBeGreaterThan(0);
  expect(sent).toEqual([]);
});
