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
 */

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

function scrollbarTotal(handle: number): number {
  const fn = wasm.exports.restty_scrollbar_total;
  if (!fn) throw new Error("restty_scrollbar_total missing");
  return fn(handle) >>> 0;
}

test("GHOSTSNP rich-matrix imports scrollback beyond the viewport", () => {
  const snapshot = loadRichMatrix();
  const handle = wasm.create(40, 12, 2_000_000);
  expect(handle).toBeGreaterThan(0);
  try {
    expect(wasm.loadBinarySnapshot(handle, snapshot)).toBeNull();
    const total = scrollbarTotal(handle);
    // 40 history lines + viewport content → total extent exceeds 12 rows.
    expect(total).toBeGreaterThan(12);
    expect(total).toBeGreaterThanOrEqual(40);

    // Scroll into older history and prove restored markers.
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

    // Styled cells (bold/underline SGR) present in the active area.
    let styled = 0;
    for (const flag of state!.styleFlags ?? []) {
      if (flag) styled += 1;
    }
    expect(styled).toBeGreaterThan(0);

    // Distinctive palette entry written via OSC 4 before encode.
    expect(wasm.getPaletteColor(handle, 1)).toBe(0xabcdef);

    // Viewport marker and styled text survive import.
    const rows = viewportRows(handle);
    expect(rows.some((r) => r.includes("GHOSTSNP-RICH-MATRIX"))).toBe(true);
    expect(rows.some((r) => r.includes("BOLD") && r.includes("RED"))).toBe(true);

    // Cursor restored (visible, in-bounds).
    expect(state!.cursor.visible).toBe(1);
    expect(state!.cursor.row).toBeGreaterThanOrEqual(0);
    expect(state!.cursor.row).toBeLessThan(state!.rows);
    expect(state!.cursor.col).toBeGreaterThanOrEqual(0);
    expect(state!.cursor.col).toBeLessThan(state!.cols);
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
    expect(kittyFlags & 1).not.toBe(0); // disambiguate

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

    // Kitty key encode uses restored flags.
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
    expect(seq).toBe("\x1b[97;5u");

    // Mouse SGR encode after rehydrate from snapshot bits (no CSI to JS).
    input.setMouseMode("auto");
    input.rehydrateMouseFromTrackingBits?.(bits);
    expect(input.isMouseActive()).toBe(true);
    const wheel = {
      deltaY: 40,
      deltaMode: 0,
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

test("GHOSTSNP rich-matrix survives resize post-import", () => {
  const snapshot = loadRichMatrix();
  const handle = wasm.create(40, 12, 2_000_000);
  expect(handle).toBeGreaterThan(0);
  try {
    expect(wasm.loadBinarySnapshot(handle, snapshot)).toBeNull();
    expect(() => wasm.resize(handle, 50, 18)).not.toThrow();
    expect(() => wasm.renderUpdate(handle)).not.toThrow();
    expect(() => wasm.write(handle, "POST-RESIZE")).not.toThrow();
    expect(() => wasm.renderUpdate(handle)).not.toThrow();
    const rows = viewportRows(handle);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.includes("POST-RESIZE") || r.includes("GHOSTSNP-RICH-MATRIX"))).toBe(
      true,
    );
  } finally {
    wasm.destroy(handle);
  }
});

test("GHOSTSNP rich-matrix reconnect second import replaces state on a new handle path", () => {
  const snapshot = loadRichMatrix();
  const first = wasm.create(40, 12, 2_000_000);
  expect(first).toBeGreaterThan(0);
  try {
    expect(wasm.loadBinarySnapshot(first, snapshot)).toBeNull();
    wasm.write(first, "LIVE-AFTER-FIRST");
    wasm.renderUpdate(first);

    // Second import (reconnect): recreate + import again.
    const second = wasm.create(40, 12, 2_000_000);
    expect(second).toBeGreaterThan(0);
    try {
      expect(wasm.loadBinarySnapshot(second, snapshot)).toBeNull();
      const rows = viewportRows(second);
      expect(rows.some((r) => r.includes("GHOSTSNP-RICH-MATRIX"))).toBe(true);
      // Live write from first handle must not pollute the second import.
      expect(rows.some((r) => r.includes("LIVE-AFTER-FIRST"))).toBe(false);
      expect(wasm.getKittyKeyboardFlags(second) & 1).not.toBe(0);
      expect(scrollbarTotal(second)).toBeGreaterThan(12);
    } finally {
      wasm.destroy(second);
    }
  } finally {
    wasm.destroy(first);
  }
});

test("public loadBinarySnapshot attach order: snapshot then live write on new handle", () => {
  const snapshot = loadRichMatrix();
  const writeHandles: number[] = [];
  const loadHandles: number[] = [];
  const initialHandle = wasm.create(40, 12, 2_000_000);
  expect(initialHandle).toBeGreaterThan(0);

  const create = wasm.create.bind(wasm);
  const destroy = wasm.destroy.bind(wasm);
  const loadBinarySnapshot = wasm.loadBinarySnapshot.bind(wasm);
  const write = wasm.write.bind(wasm);
  const renderUpdate = wasm.renderUpdate.bind(wasm);
  const setPixelSize = wasm.setPixelSize.bind(wasm);
  const getMouseTrackingBits = wasm.getMouseTrackingBits.bind(wasm);
  const getKittyKeyboardFlags = wasm.getKittyKeyboardFlags.bind(wasm);

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
    gridState: { cols: 40, rows: 12 },
    getCanvas: () => ({ width: 400, height: 240 }) as HTMLCanvasElement,
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

  try {
    const beforeHandle = sharedState.wasmHandle;
    expect(app.loadBinarySnapshot(snapshot)).toBe(true);
    const afterHandle = sharedState.wasmHandle;
    expect(afterHandle).not.toBe(beforeHandle);
    expect(loadHandles).toEqual([afterHandle]);

    // Attach order: post-import live PTY write must target the NEW handle.
    writeHandles.length = 0;
    runtime.sendInput("AFTER-SNAPSHOT-LIVE", "pty");
    expect(writeHandles).toEqual([afterHandle]);
  } finally {
    if (sharedState.wasmHandle) {
      try {
        destroy(sharedState.wasmHandle);
      } catch {
        // ignore
      }
    }
    // Restore instrumented methods for subsequent tests in this file.
    wasm.create = create;
    wasm.destroy = destroy;
    wasm.loadBinarySnapshot = loadBinarySnapshot;
    wasm.write = write;
    wasm.renderUpdate = renderUpdate;
    wasm.setPixelSize = setPixelSize;
    wasm.getMouseTrackingBits = getMouseTrackingBits;
    wasm.getKittyKeyboardFlags = getKittyKeyboardFlags;
  }
});
