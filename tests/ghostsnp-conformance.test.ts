import { beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInputHandler } from "../src/input";
import { loadResttyWasm, type ResttyWasm } from "../src/wasm/runtime/restty-wasm";
import {
  createRuntimeAppApi,
  type RuntimeAppApiSharedState,
} from "../src/runtime/create-runtime/runtime-app-api";

/**
 * A8: committed GHOSTSNP rich-matrix fixture under tests/fixtures/ghostsnp/.
 * Produced by scripts/ghostsnp-fixture-gen (Ghostty-pin encode, not freestanding WASM).
 *
 * Fixture encodes (see scripts/ghostsnp-fixture-gen/main.zig):
 * - 40 scrollback lines SCROLLBACK-LINE-NNN
 * - attrs line: BOLD (bold), UNDER (underline), RED (palette1=0xabcdef), GREEN (palette2)
 * - marker GHOSTSNP-RICH-MATRIX
 * - kitty keyboard flags = 1 (disambiguate)
 * - mouse 1000+1006
 * - final cursor CUP 8;5 → row=7 col=4 (0-based)
 */

const STYLE_BOLD = 0x1;
const STYLE_UNDERLINE = 0x100;
const ATTR_ROW = 8;
const CURSOR_ROW = 7;
const CURSOR_COL = 4;

let wasm: ResttyWasm;

beforeAll(async () => {
  wasm = await loadResttyWasm();
});

function loadRichMatrix(): Uint8Array {
  const path = join(process.cwd(), "tests/fixtures/ghostsnp/rich-matrix-v1.bin");
  const data = new Uint8Array(readFileSync(path));
  expect(data.byteLength).toBeGreaterThan(0);
  expect(String.fromCharCode(...data.subarray(0, 8))).toBe("GHOSTSNP");
  return data;
}

function viewportRows(handle: number): string[] {
  const state = wasm.getRenderState(handle);
  if (!state?.codepoints) throw new Error("missing render state");
  const rows: string[] = [];
  for (let row = 0; row < state.rows; row += 1) {
    let text = "";
    for (let col = 0; col < state.cols; col += 1) {
      const cp = state.codepoints[row * state.cols + col] ?? 0;
      text += cp === 0 ? " " : String.fromCodePoint(cp);
    }
    rows.push(text.trimEnd());
  }
  return rows;
}

function cellRgb(
  state: NonNullable<ReturnType<ResttyWasm["getRenderState"]>>,
  row: number,
  col: number,
): number {
  const i = row * state.cols + col;
  const bytes = state.fgBytes;
  return ((bytes[i * 4] ?? 0) << 16) | ((bytes[i * 4 + 1] ?? 0) << 8) | (bytes[i * 4 + 2] ?? 0);
}

function cellChar(
  state: NonNullable<ReturnType<ResttyWasm["getRenderState"]>>,
  row: number,
  col: number,
): string {
  const cp = state.codepoints[row * state.cols + col] ?? 0;
  return cp === 0 ? " " : String.fromCodePoint(cp);
}

function scrollbarTotal(handle: number): number {
  const fn = wasm.exports.restty_scrollbar_total;
  if (!fn) throw new Error("restty_scrollbar_total missing");
  return fn(handle) >>> 0;
}

function createPublicSnapshotApp(options: {
  initialHandle: number;
  writeHandles: number[];
  loadHandles: number[];
  grid?: { cols: number; rows: number };
  disconnectCalls?: number[];
}) {
  const {
    initialHandle,
    writeHandles,
    loadHandles,
    grid = { cols: 40, rows: 12 },
    disconnectCalls,
  } = options;

  const create = wasm.create.bind(wasm);
  const destroy = wasm.destroy.bind(wasm);
  const loadBinarySnapshot = wasm.loadBinarySnapshot.bind(wasm);
  const write = wasm.write.bind(wasm);
  const renderUpdate = wasm.renderUpdate.bind(wasm);
  const setPixelSize = wasm.setPixelSize.bind(wasm);
  const getMouseTrackingBits = wasm.getMouseTrackingBits.bind(wasm);
  const getKittyKeyboardFlags = wasm.getKittyKeyboardFlags.bind(wasm);
  const getRenderState = wasm.getRenderState.bind(wasm);

  wasm.create = (cols, rows, maxScrollback) => create(cols, rows, maxScrollback);
  wasm.destroy = (handle) => destroy(handle);
  wasm.loadBinarySnapshot = (handle, data) => {
    loadHandles.push(handle);
    return loadBinarySnapshot(handle, data);
  };
  wasm.write = (handle, text) => {
    writeHandles.push(handle);
    write(handle, text);
  };
  wasm.renderUpdate = (handle) => renderUpdate(handle);
  wasm.setPixelSize = (handle, w, h) => setPixelSize(handle, w, h);
  wasm.getMouseTrackingBits = (handle) => getMouseTrackingBits(handle);
  wasm.getKittyKeyboardFlags = (handle) => getKittyKeyboardFlags(handle);
  wasm.getRenderState = (handle) => getRenderState(handle);

  const sharedState: RuntimeAppApiSharedState = {
    wasm,
    wasmExports: wasm.exports,
    wasmHandle: initialHandle,
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
      isConnected: () => false,
      connect: () => undefined,
      disconnect: () => undefined,
      sendInput: () => undefined,
      resize: () => undefined,
    } as never,
    inputHandler: {
      encodeKeyEvent: () => "",
      isSynchronizedOutput: () => false,
      setMouseMode: () => undefined,
      getMouseStatus: () => "auto",
      rehydrateMouseFromTrackingBits: () => undefined,
    } as never,
    ptyInputRuntime: {
      setPtyStatus: () => undefined,
      updateMouseStatus: () => undefined,
      scheduleSyncOutputReset: () => undefined,
      cancelSyncOutputReset: () => undefined,
      connectPty: () => undefined,
      disconnectPty: () => {
        disconnectCalls?.push(1);
      },
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
    maxScrollbackBytes: 2_000_000,
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
    gridState: grid,
    getCanvas: () => ({ width: grid.cols * 10, height: grid.rows * 20 }) as HTMLCanvasElement,
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

  const app = runtime.createPublicApi({
    setFontSize: () => undefined,
    setFontHinting: () => undefined,
    setFontHintTarget: () => undefined,
    setFontSources: async () => undefined,
    resetTheme: () => undefined,
    setSearchQuery: () => undefined,
    clearSearch: () => undefined,
    searchNext: () => undefined,
    searchPrevious: () => undefined,
    getSearchState: () => ({
      query: "",
      active: false,
      pending: false,
      complete: false,
      total: 0,
      selectedIndex: null,
    }),
    dumpAtlasForCodepoint: () => undefined,
    resize: () => undefined,
    focus: () => undefined,
    blur: () => undefined,
    updateSize: () => undefined,
    setShaderStages: () => undefined,
    getShaderStages: () => [],
  });

  return {
    app,
    runtime,
    sharedState,
    restore: () => {
      wasm.create = create;
      wasm.destroy = destroy;
      wasm.loadBinarySnapshot = loadBinarySnapshot;
      wasm.write = write;
      wasm.renderUpdate = renderUpdate;
      wasm.setPixelSize = setPixelSize;
      wasm.getMouseTrackingBits = getMouseTrackingBits;
      wasm.getKittyKeyboardFlags = getKittyKeyboardFlags;
      wasm.getRenderState = getRenderState;
    },
  };
}

test("GHOSTSNP rich-matrix imports scrollback beyond the viewport", () => {
  const snapshot = loadRichMatrix();
  const handle = wasm.create(40, 12, 2_000_000);
  expect(handle).toBeGreaterThan(0);
  try {
    expect(wasm.loadBinarySnapshot(handle, snapshot)).toBeNull();
    const total = scrollbarTotal(handle);
    expect(total).toBeGreaterThan(12);
    expect(total).toBeGreaterThanOrEqual(40);

    wasm.scrollViewport(handle, -20);
    wasm.renderUpdate(handle);
    const rows = viewportRows(handle);
    expect(rows.some((r) => r.includes("SCROLLBACK-LINE-01"))).toBe(true);
  } finally {
    wasm.destroy(handle);
  }
});

test("GHOSTSNP rich-matrix preserves cell attributes, palette colors, and cursor", () => {
  const snapshot = loadRichMatrix();
  const handle = wasm.create(40, 12, 2_000_000);
  expect(handle).toBeGreaterThan(0);
  try {
    expect(wasm.loadBinarySnapshot(handle, snapshot)).toBeNull();
    const state = wasm.getRenderState(handle);
    expect(state).not.toBeNull();

    // Named BOLD cells carry bold style bit.
    for (let col = 0; col < 4; col += 1) {
      expect(cellChar(state!, ATTR_ROW, col)).toBe("BOLD"[col]!);
      expect(state!.styleFlags[ATTR_ROW * state!.cols + col] & STYLE_BOLD).not.toBe(0);
    }

    // Named UNDER cells carry underline style bit + ulStyle.
    const under = "UNDER";
    for (let i = 0; i < under.length; i += 1) {
      const col = 5 + i;
      expect(cellChar(state!, ATTR_ROW, col)).toBe(under[i]!);
      expect(state!.styleFlags[ATTR_ROW * state!.cols + col] & STYLE_UNDERLINE).not.toBe(0);
      expect(state!.ulStyle[ATTR_ROW * state!.cols + col]).toBe(1);
    }

    // RED uses palette index 1 (OSC 4;1;rgb:ab/cd/ef → 0xabcdef).
    expect(wasm.getPaletteColor(handle, 1)).toBe(0xabcdef);
    for (let i = 0; i < 3; i += 1) {
      const col = 11 + i;
      expect(cellChar(state!, ATTR_ROW, col)).toBe("RED"[i]!);
      expect(cellRgb(state!, ATTR_ROW, col)).toBe(0xabcdef);
    }

    // GREEN is non-default palette green (not white).
    for (let i = 0; i < 5; i += 1) {
      const col = 15 + i;
      expect(cellChar(state!, ATTR_ROW, col)).toBe("GREEN"[i]!);
      expect(cellRgb(state!, ATTR_ROW, col)).toBe(0xb5bd68);
    }

    const rows = viewportRows(handle);
    expect(rows.some((r) => r.includes("GHOSTSNP-RICH-MATRIX"))).toBe(true);

    // Exact encoded cursor: CUP 8;5 → (7,4) 0-based, visible.
    expect(state!.cursor).toMatchObject({
      row: CURSOR_ROW,
      col: CURSOR_COL,
      visible: 1,
    });
  } finally {
    wasm.destroy(handle);
  }
});

test("GHOSTSNP rich-matrix rehydrates Kitty keyboard flags and mouse modes for encode", () => {
  const snapshot = loadRichMatrix();
  const handle = wasm.create(40, 12, 2_000_000);
  expect(handle).toBeGreaterThan(0);
  try {
    expect(wasm.loadBinarySnapshot(handle, snapshot)).toBeNull();

    const kittyFlags = wasm.getKittyKeyboardFlags(handle);
    expect(kittyFlags).toBe(1);

    const bits = wasm.getMouseTrackingBits(handle);
    expect(bits & (1 << 1)).not.toBe(0); // 1000
    expect(bits & (1 << 5)).not.toBe(0); // 1006

    const replies: string[] = [];
    const input = createInputHandler({
      sendReply: (data) => {
        replies.push(data);
      },
      positionToCell: () => ({ row: 0, col: 0 }),
      getKittyKeyboardFlags: () => kittyFlags,
    });

    const seq = input.encodeKeyEvent({
      key: "a",
      code: "KeyA",
      type: "keydown",
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      repeat: false,
      getModifierState: () => false,
    } as unknown as KeyboardEvent);
    expect(seq).toBe("\u001b[97;5u");

    input.setMouseMode("auto");
    input.rehydrateMouseFromTrackingBits?.(bits);
    expect(input.isMouseActive()).toBe(true);
    const wheel = {
      deltaY: 1,
      deltaMode: 1,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
    } as WheelEvent;
    expect(input.sendMouseEvent("wheel", wheel)).toBe(true);
    expect(replies[0]!.startsWith("\u001b[<")).toBe(true);
  } finally {
    wasm.destroy(handle);
  }
});

test("GHOSTSNP rich-matrix survives resize post-import and shows POST-RESIZE", () => {
  const snapshot = loadRichMatrix();
  const handle = wasm.create(40, 12, 2_000_000);
  expect(handle).toBeGreaterThan(0);
  try {
    expect(wasm.loadBinarySnapshot(handle, snapshot)).toBeNull();
    expect(() => wasm.resize(handle, 50, 18)).not.toThrow();
    expect(() => wasm.renderUpdate(handle)).not.toThrow();
    // Move to a clear line then write marker so it is required, not optional.
    wasm.write(handle, "\r\nPOST-RESIZE\r\n");
    wasm.renderUpdate(handle);
    const rows = viewportRows(handle);
    expect(rows.some((r) => r.includes("POST-RESIZE"))).toBe(true);
  } finally {
    wasm.destroy(handle);
  }
});

test("public loadBinarySnapshot reconnect replaces handle and restores clean modes", () => {
  const snapshot = loadRichMatrix();
  const writeHandles: number[] = [];
  const loadHandles: number[] = [];
  const initialHandle = wasm.create(40, 12, 2_000_000);
  expect(initialHandle).toBeGreaterThan(0);

  const harness = createPublicSnapshotApp({ initialHandle, writeHandles, loadHandles });
  try {
    const { app, runtime, sharedState } = harness;

    // First public import.
    expect(app.loadBinarySnapshot(snapshot)).toBe(true);
    const firstHandle = sharedState.wasmHandle;
    expect(firstHandle).not.toBe(initialHandle);
    expect(loadHandles).toEqual([firstHandle]);
    expect(wasm.getKittyKeyboardFlags(firstHandle) & 1).not.toBe(0);
    expect(viewportRows(firstHandle).some((r) => r.includes("GHOSTSNP-RICH-MATRIX"))).toBe(true);

    // Pollute live state after first import.
    writeHandles.length = 0;
    runtime.sendInput("LIVE-AFTER-FIRST", "pty");
    expect(writeHandles).toEqual([firstHandle]);
    expect(viewportRows(firstHandle).some((r) => r.includes("LIVE-AFTER-FIRST"))).toBe(true);

    // Second public import (reconnect): new handle, clean snapshot state, no pollution.
    loadHandles.length = 0;
    expect(app.loadBinarySnapshot(snapshot)).toBe(true);
    const secondHandle = sharedState.wasmHandle;
    expect(secondHandle).not.toBe(firstHandle);
    expect(loadHandles).toEqual([secondHandle]);

    const rows = viewportRows(secondHandle);
    expect(rows.some((r) => r.includes("GHOSTSNP-RICH-MATRIX"))).toBe(true);
    expect(rows.some((r) => r.includes("LIVE-AFTER-FIRST"))).toBe(false);
    expect(wasm.getKittyKeyboardFlags(secondHandle)).toBe(1);
    expect(wasm.getMouseTrackingBits(secondHandle) & (1 << 1)).not.toBe(0);
    expect(scrollbarTotal(secondHandle)).toBeGreaterThan(12);

    const state = wasm.getRenderState(secondHandle)!;
    expect(state.cursor).toMatchObject({ row: CURSOR_ROW, col: CURSOR_COL, visible: 1 });

    // Later live output stays on the reconnect handle.
    writeHandles.length = 0;
    runtime.sendInput("AFTER-RECONNECT", "pty");
    expect(writeHandles).toEqual([secondHandle]);
  } finally {
    if (harness.sharedState.wasmHandle) {
      try {
        wasm.destroy(harness.sharedState.wasmHandle);
      } catch {
        // ignore
      }
    }
    harness.restore();
  }
});

test("public loadBinarySnapshot reapplies the browser grid after a GHOSTSNP handle swap", () => {
  const snapshot = loadRichMatrix();
  const resttyRenderCols = wasm.exports.restty_render_cols ?? wasm.exports.restty_cols;
  const resttyRenderRows = wasm.exports.restty_render_rows ?? wasm.exports.restty_rows;
  expect(resttyRenderCols).toBeFunction();
  expect(resttyRenderRows).toBeFunction();
  const snapshotHandle = wasm.create(40, 12, 2_000_000);
  expect(snapshotHandle).toBeGreaterThan(0);
  expect(wasm.loadBinarySnapshot(snapshotHandle, snapshot)).toBeNull();
  expect(resttyRenderCols!(snapshotHandle)).toBe(40);
  expect(resttyRenderRows!(snapshotHandle)).toBe(12);
  wasm.destroy(snapshotHandle);

  const browserGrid = { cols: 50, rows: 18 };
  const initialHandle = wasm.create(browserGrid.cols, browserGrid.rows, 2_000_000);
  expect(initialHandle).toBeGreaterThan(0);
  const writeHandles: number[] = [];
  const disconnectCalls: number[] = [];
  const harness = createPublicSnapshotApp({
    initialHandle,
    writeHandles,
    loadHandles: [],
    grid: browserGrid,
    disconnectCalls,
  });

  try {
    harness.app.disconnectPty();
    expect(disconnectCalls).toEqual([1]);
    expect(harness.app.loadBinarySnapshot(snapshot)).toBe(true);
    const activeHandle = harness.sharedState.wasmHandle;
    expect(activeHandle).not.toBe(initialHandle);
    expect(writeHandles).toEqual([]);
    expect(resttyRenderCols!(activeHandle)).toBe(browserGrid.cols);
    expect(resttyRenderRows!(activeHandle)).toBe(browserGrid.rows);
    expect(scrollbarTotal(activeHandle)).toBeGreaterThan(browserGrid.rows);

    wasm.scrollViewport(activeHandle, -10_000);
    wasm.renderUpdate(activeHandle);
    expect(viewportRows(activeHandle).some((row) => row.includes("SCROLLBACK-LINE-000"))).toBe(
      true,
    );
  } finally {
    if (harness.sharedState.wasmHandle) {
      wasm.destroy(harness.sharedState.wasmHandle);
    }
    harness.restore();
  }
});

test("public loadBinarySnapshot attach order: snapshot then live write on new handle", () => {
  const snapshot = loadRichMatrix();
  const writeHandles: number[] = [];
  const loadHandles: number[] = [];
  const initialHandle = wasm.create(40, 12, 2_000_000);
  expect(initialHandle).toBeGreaterThan(0);

  const harness = createPublicSnapshotApp({ initialHandle, writeHandles, loadHandles });
  try {
    const { app, runtime, sharedState } = harness;
    const beforeHandle = sharedState.wasmHandle;
    expect(app.loadBinarySnapshot(snapshot)).toBe(true);
    const afterHandle = sharedState.wasmHandle;
    expect(afterHandle).not.toBe(beforeHandle);
    expect(loadHandles).toEqual([afterHandle]);

    writeHandles.length = 0;
    runtime.sendInput("AFTER-SNAPSHOT-LIVE", "pty");
    expect(writeHandles).toEqual([afterHandle]);
  } finally {
    if (harness.sharedState.wasmHandle) {
      try {
        wasm.destroy(harness.sharedState.wasmHandle);
      } catch {
        // ignore
      }
    }
    harness.restore();
  }
});
