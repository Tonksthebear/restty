import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createPtyOutputBufferController } from "../src/runtime/pty-output-buffer";
import { createPtyInputRuntime } from "../src/runtime/create-runtime/pty-input-runtime";
import { loadResttyWasm, type ResttyWasm } from "../src/wasm/runtime/restty-wasm";
import {
  createRuntimeAppApi,
  type RuntimeAppApiSharedState,
} from "../src/runtime/create-runtime/runtime-app-api";
import type { PtyCallbacks } from "../src/pty";

type WasmCallLog = {
  createHandles: number[];
  destroyHandles: number[];
  loadHandles: number[];
  writeHandles: number[];
  renderHandles: number[];
  resizeHandles: number[];
  pixelHandles: number[];
};

type RuntimeHarness = {
  app: ReturnType<ReturnType<typeof createRuntimeAppApi>["createPublicApi"]>;
  callLog: WasmCallLog;
  deferTerminalResize: ReturnType<typeof createRuntimeAppApi>["deferTerminalResize"];
  getPtyCallbacks: () => PtyCallbacks | null;
  ptyResizeCalls: Array<{
    cols: number;
    rows: number;
    meta: { widthPx: number; heightPx: number; cellW: number; cellH: number };
  }>;
  ptyOutputBuffer: ReturnType<typeof createPtyOutputBufferController>;
  sharedState: RuntimeAppApiSharedState;
};

type GridSize = {
  cols: number;
  rows: number;
};

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(`${process.cwd()}/tests/fixtures/ghostsnp/${name}`));
}

function historyFrames(): Uint8Array[] {
  return [0, 1, 2, 3].map((index) =>
    fixture(`incremental-history-page-${index.toString().padStart(3, "0")}-v1.bin`),
  );
}

/** Decode annotated GHOSTSNP golden hex fixtures (ghostty snapshot fixture grammar). */
function parseGhosttyHexFixture(source: string): Uint8Array {
  const bytes: number[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (i + 1 >= source.length) {
      throw new Error("snapshot fixture ends with one hex digit");
    }
    bytes.push(Number.parseInt(source.slice(i, i + 2), 16));
    i += 2;
    if (i < source.length && !/\s/.test(source[i]!) && source[i] !== "#") {
      throw new Error("snapshot fixture hex bytes must be separated by whitespace");
    }
  }
  return new Uint8Array(bytes);
}

function loadUpstreamGoldenSnapshot(): Uint8Array {
  const path = `${process.cwd()}/reference/ghostty/src/terminal/snapshot/testdata/complete-v1.hex`;
  const snapshot = parseGhosttyHexFixture(readFileSync(path, "utf8"));
  expect(snapshot.byteLength).toBeGreaterThan(0);
  expect(String.fromCharCode(...snapshot.subarray(0, 8))).toBe("GHOSTSNP");
  return snapshot;
}

function viewportRows(wasm: ResttyWasm, handle: number): string[] {
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

function scrollbarTotal(wasm: ResttyWasm, handle: number): number {
  const total = wasm.exports.restty_scrollbar_total;
  if (!total) throw new Error("restty_scrollbar_total export is unavailable");
  return total(handle) >>> 0;
}

function instrumentWasm(wasm: ResttyWasm): WasmCallLog {
  const log: WasmCallLog = {
    createHandles: [],
    destroyHandles: [],
    loadHandles: [],
    writeHandles: [],
    renderHandles: [],
    resizeHandles: [],
    pixelHandles: [],
  };

  const create = wasm.create.bind(wasm);
  wasm.create = (cols, rows, maxScrollback) => {
    const handle = create(cols, rows, maxScrollback);
    log.createHandles.push(handle);
    return handle;
  };

  const destroy = wasm.destroy.bind(wasm);
  wasm.destroy = (handle) => {
    log.destroyHandles.push(handle);
    destroy(handle);
  };

  const loadBinarySnapshot = wasm.loadBinarySnapshot.bind(wasm);
  wasm.loadBinarySnapshot = (handle, data) => {
    log.loadHandles.push(handle);
    return loadBinarySnapshot(handle, data);
  };

  const write = wasm.write.bind(wasm);
  wasm.write = (handle, text) => {
    log.writeHandles.push(handle);
    write(handle, text);
  };

  const renderUpdate = wasm.renderUpdate.bind(wasm);
  wasm.renderUpdate = (handle) => {
    log.renderHandles.push(handle);
    renderUpdate(handle);
  };

  const resize = wasm.resize.bind(wasm);
  wasm.resize = (handle, cols, rows) => {
    log.resizeHandles.push(handle);
    resize(handle, cols, rows);
  };

  const setPixelSize = wasm.setPixelSize.bind(wasm);
  wasm.setPixelSize = (handle, widthPx, heightPx) => {
    log.pixelHandles.push(handle);
    setPixelSize(handle, widthPx, heightPx);
  };

  return log;
}

/** Primary proof vector: upstream GHOSTSNP complete-v1 (import-only cutover). */
function buildRichSnapshotSource(_wasm: ResttyWasm): Uint8Array {
  return loadUpstreamGoldenSnapshot();
}

function parseManifestGrid(path: string): GridSize {
  const raw = readFileSync(path, "utf8");
  const rows = Number(raw.match(/^rows=(\d+)$/m)?.[1] ?? "");
  const cols = Number(raw.match(/^cols=(\d+)$/m)?.[1] ?? "");
  if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows <= 0 || cols <= 0) {
    throw new Error(`invalid manifest grid in ${path}`);
  }
  return { cols, rows };
}

function formatHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function decodeLiveChunks(files: string[]): { chunks: string[]; firstHex: string } {
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let firstHex = "";

  for (const [index, file] of files.entries()) {
    const bytes = new Uint8Array(readFileSync(file));
    if (index === 0) firstHex = formatHex(bytes);
    const text = decoder.decode(bytes, { stream: true });
    if (text) chunks.push(text);
  }

  const tail = decoder.decode();
  if (tail) chunks.push(tail);

  return { chunks, firstHex };
}

function probeRawSnapshotImport(
  wasm: ResttyWasm,
  snapshot: Uint8Array,
  grid: GridSize,
): { importCode: number | undefined; renderCode: number | null } {
  const handle = wasm.create(grid.cols, grid.rows, 10_000_000);
  expect(handle).toBeGreaterThan(0);

  try {
    const ptr = wasm.exports.restty_alloc(snapshot.byteLength);
    expect(ptr).toBeGreaterThan(0);

    new Uint8Array(wasm.memory.buffer, ptr, snapshot.byteLength).set(snapshot);
    const importCode = wasm.exports.restty_snapshot_import?.(handle, ptr, snapshot.byteLength);
    const renderCode = importCode === 0 ? wasm.exports.restty_render_update(handle) : null;
    wasm.exports.restty_free(ptr, snapshot.byteLength);
    return { importCode, renderCode };
  } finally {
    wasm.destroy(handle);
  }
}

function createRuntimeHarness(
  wasm: ResttyWasm,
  grid: GridSize = { cols: 181, rows: 59 },
): RuntimeHarness {
  const initialHandle = wasm.create(80, 24, 10_000_000);
  expect(initialHandle).toBeGreaterThan(0);

  const callLog = instrumentWasm(wasm);
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

  let connected = false;
  let ptyCallbacks: PtyCallbacks | null = null;
  const ptyResizeCalls: RuntimeHarness["ptyResizeCalls"] = [];
  let runtime: ReturnType<typeof createRuntimeAppApi> | null = null;

  const ptyTransport = {
    isConnected: () => connected,
    connect: ({ callbacks }: { callbacks: PtyCallbacks }) => {
      connected = true;
      ptyCallbacks = callbacks;
      callbacks.onConnect?.();
    },
    disconnect: () => {
      connected = false;
      ptyCallbacks?.onDisconnect?.();
    },
    sendInput: () => true,
    resize: (
      cols: number,
      rows: number,
      meta: RuntimeHarness["ptyResizeCalls"][number]["meta"],
    ) => {
      ptyResizeCalls.push({ cols, rows, meta });
      return true;
    },
  };

  const inputHandler = {
    encodeKeyEvent: () => "",
    encodeBeforeInput: () => "",
    mapKeyForPty: (text: string) => text,
    isSynchronizedOutput: () => false,
    setMouseMode: () => undefined,
    getMouseStatus: () => ({
      mode: "auto" as const,
      active: false,
      detail: "sgr" as const,
      enabled: false,
    }),
    filterOutput: (text: string) => text,
    isBracketedPaste: () => false,
    sequences: {
      enter: "\r",
      backspace: "\x7f",
      delete: "\x1b[3~",
      tab: "\t",
      shiftTab: "\x1b[Z",
      escape: "\x1b",
    },
  };

  const ptyOutputBuffer = createPtyOutputBufferController({
    idleMs: 10,
    maxMs: 40,
    onFlush: (output) => runtime?.sendInput(output, "pty"),
  });

  const ptyInputRuntime = createPtyInputRuntime({
    ptyTransport,
    ptyOutputBuffer,
    inputHandler,
    appendLog: () => undefined,
    getGridSize: () => ({ cols: grid.cols, rows: grid.rows }),
    getResizeMeta: () => ({
      widthPx: grid.cols * 10,
      heightPx: grid.rows * 20,
      cellW: 10,
      cellH: 20,
    }),
    getCursorForCpr: () => ({ row: 1, col: 1 }),
    sendInput: (text, source, options) => runtime?.sendInput(text, source, options),
    runBeforeInputHook: (text) => text,
    shouldClearSelection: () => false,
    clearSelection: () => undefined,
    syncOutputResetMs: 1000,
    syncOutputResetSeq: "\x1b[?2026l",
  });

  runtime = createRuntimeAppApi({
    session: {} as never,
    ptyTransport: ptyTransport as never,
    inputHandler: inputHandler as never,
    ptyInputRuntime,
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
    maxScrollbackBytes: 10_000_000,
    CURSOR_BLINK_MS: 600,
    RESIZE_ACTIVE_MS: 180,
    TARGET_RENDER_FPS: 60,
    BACKGROUND_RENDER_FPS: 15,
    KITTY_FLAG_REPORT_EVENTS: 1 << 1,
    resizeState: { lastAt: 0 },
    tickWebGPU: () => undefined,
    tickWebGL: () => undefined,
    updateGrid: () => undefined,
    gridState: { cols: grid.cols, rows: grid.rows },
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
    resize: (cols: number, rows: number) => {
      wasm.resize(sharedState.wasmHandle, cols, rows);
      wasm.renderUpdate(sharedState.wasmHandle);
    },
    focus: () => undefined,
    blur: () => undefined,
    updateSize: () => undefined,
    setShaderStages: () => undefined,
    getShaderStages: () => [],
  });

  return {
    app,
    callLog,
    deferTerminalResize: runtime.deferTerminalResize,
    getPtyCallbacks: () => ptyCallbacks,
    ptyResizeCalls,
    ptyOutputBuffer,
    sharedState,
  };
}

test("public incremental reader paints READY, prepends every PAGE, and finishes authentic history", async () => {
  const wasm = await loadResttyWasm();
  const harness = createRuntimeHarness(wasm);
  const initialHandle = harness.sharedState.wasmHandle;
  const reader = harness.app.createBinarySnapshotReader();
  expect(reader).not.toBeNull();

  expect(reader!.ready(fixture("incremental-history-ready-v1.bin"))).toEqual({ status: "ready" });
  const activeHandle = harness.sharedState.wasmHandle;
  expect(activeHandle).not.toBe(initialHandle);
  expect(viewportRows(wasm, activeHandle).join("\n")).toContain("READY-PAINT");
  expect(harness.callLog.pixelHandles.filter((handle) => handle === activeHandle).length).toBe(2);

  let previousTotal = scrollbarTotal(wasm, activeHandle);
  for (const page of historyFrames()) {
    expect(reader!.next(page)).toEqual({ status: "page" });
    const nextTotal = scrollbarTotal(wasm, activeHandle);
    expect(nextTotal).toBeGreaterThan(previousTotal);
    previousTotal = nextTotal;
  }

  expect(reader!.next(fixture("incremental-history-finish-v1.bin"))).toEqual({
    status: "finish",
  });
  expect(harness.callLog.pixelHandles.filter((handle) => handle === activeHandle).length).toBe(3);
  wasm.scrollViewport(activeHandle, -10_000);
  wasm.renderUpdate(activeHandle);
  expect(viewportRows(wasm, activeHandle).join("\n")).toContain("HISTORY-LINE-0000");

  wasm.destroy(activeHandle);
});

test("public incremental reader accepts authentic blank READY and FINISH", async () => {
  const wasm = await loadResttyWasm();
  const harness = createRuntimeHarness(wasm);
  const reader = harness.app.createBinarySnapshotReader();
  expect(reader).not.toBeNull();

  expect(reader!.ready(fixture("incremental-blank-ready-v1.bin"))).toEqual({ status: "ready" });
  expect(viewportRows(wasm, harness.sharedState.wasmHandle).every((row) => row === "")).toBe(true);
  expect(reader!.next(fixture("incremental-blank-finish-v1.bin"))).toEqual({
    status: "finish",
  });

  wasm.destroy(harness.sharedState.wasmHandle);
});

test("public incremental reader releases only the latest WASM and PTY resize at FINISH", async () => {
  const wasm = await loadResttyWasm();
  const harness = createRuntimeHarness(wasm);
  harness.app.connectPty();
  harness.ptyResizeCalls.length = 0;
  const reader = harness.app.createBinarySnapshotReader();
  expect(reader).not.toBeNull();

  expect(
    harness.deferTerminalResize(120, 40, {
      widthPx: 1200,
      heightPx: 800,
      cellW: 10,
      cellH: 20,
    }),
  ).toBe(true);
  expect(reader!.ready(fixture("incremental-history-ready-v1.bin"))).toEqual({ status: "ready" });
  const activeHandle = harness.sharedState.wasmHandle;
  expect(
    harness.deferTerminalResize(130, 41, {
      widthPx: 1300,
      heightPx: 820,
      cellW: 10,
      cellH: 20,
    }),
  ).toBe(true);
  expect(harness.ptyResizeCalls).toEqual([]);
  expect(wasm.getRenderState(activeHandle)).toMatchObject({ cols: 215, rows: 2 });

  for (const page of historyFrames()) {
    expect(reader!.next(page)).toEqual({ status: "page" });
    expect(harness.ptyResizeCalls).toEqual([]);
    expect(wasm.getRenderState(activeHandle)).toMatchObject({ cols: 215, rows: 2 });
  }
  expect(reader!.next(fixture("incremental-history-finish-v1.bin"))).toEqual({
    status: "finish",
  });
  expect(wasm.getRenderState(activeHandle)).toMatchObject({ cols: 130, rows: 41 });
  expect(harness.ptyResizeCalls).toEqual([
    {
      cols: 130,
      rows: 41,
      meta: { widthPx: 1300, heightPx: 820, cellW: 10, cellH: 20 },
    },
  ]);

  wasm.destroy(activeHandle);
});

test("public incremental reader retains READY and applied history after a PAGE error", async () => {
  const wasm = await loadResttyWasm();
  const harness = createRuntimeHarness(wasm, { cols: 120, rows: 40 });
  const reader = harness.app.createBinarySnapshotReader();
  expect(reader).not.toBeNull();

  expect(reader!.ready(fixture("incremental-history-ready-v1.bin"))).toEqual({ status: "ready" });
  expect(reader!.next(historyFrames()[0]!)).toEqual({ status: "page" });
  const corruptPage = historyFrames()[1]!.slice();
  corruptPage[corruptPage.length - 1] ^= 0xff;
  expect(reader!.next(corruptPage).status).toBe("error");

  const activeHandle = harness.sharedState.wasmHandle;
  const retainedRows = viewportRows(wasm, activeHandle).join("\n");
  expect(retainedRows).toContain("HISTORY-LINE-0999");
  expect(retainedRows).toContain("READY-PAINT");
  expect(wasm.getRenderState(activeHandle)).toMatchObject({ cols: 120, rows: 40 });
  harness.app.sendInput("LIVE-AFTER-DEGRADED-HISTORY", "pty");
  wasm.renderUpdate(activeHandle);
  expect(viewportRows(wasm, activeHandle).join("\n")).toContain("LIVE-AFTER-DEGRADED-HISTORY");

  wasm.destroy(activeHandle);
});

test("public incremental reader cancel releases the resize barrier", async () => {
  const wasm = await loadResttyWasm();
  const harness = createRuntimeHarness(wasm);
  harness.app.connectPty();
  harness.ptyResizeCalls.length = 0;
  const reader = harness.app.createBinarySnapshotReader();
  expect(reader).not.toBeNull();

  expect(reader!.ready(fixture("incremental-history-ready-v1.bin"))).toEqual({ status: "ready" });
  expect(
    harness.deferTerminalResize(132, 42, {
      widthPx: 1320,
      heightPx: 840,
      cellW: 10,
      cellH: 20,
    }),
  ).toBe(true);
  reader!.cancel();

  expect(wasm.getRenderState(harness.sharedState.wasmHandle)).toMatchObject({
    cols: 132,
    rows: 42,
  });
  expect(harness.ptyResizeCalls).toEqual([
    {
      cols: 132,
      rows: 42,
      meta: { widthPx: 1320, heightPx: 840, cellW: 10, cellH: 20 },
    },
  ]);
  expect(
    harness.deferTerminalResize(140, 44, {
      widthPx: 1400,
      heightPx: 880,
      cellW: 10,
      cellH: 20,
    }),
  ).toBe(false);
  const nextReader = harness.app.createBinarySnapshotReader();
  expect(nextReader).not.toBeNull();
  nextReader!.cancel();

  wasm.destroy(harness.sharedState.wasmHandle);
});

test("public runtime path keeps post-snapshot writes, renders, and resize on the new wasm handle", async () => {
  const wasm = await loadResttyWasm();
  const snapshot = buildRichSnapshotSource(wasm);
  const harness = createRuntimeHarness(wasm);
  const initialHandle = harness.sharedState.wasmHandle;
  const { app, callLog, sharedState } = harness;

  expect(app.loadBinarySnapshot(snapshot)).toBe(true);
  const activeHandle = sharedState.wasmHandle;
  expect(activeHandle).not.toBe(initialHandle);
  expect(callLog.loadHandles).toEqual([activeHandle]);
  expect(callLog.destroyHandles[0]).toBe(initialHandle);

  expect(() => app.sendInput("after", "pty")).not.toThrow();
  expect(() => wasm.renderUpdate(sharedState.wasmHandle)).not.toThrow();
  expect(() => app.resize(200, 60)).not.toThrow();
  expect(() => app.sendInput("!\r\n", "pty")).not.toThrow();
  expect(() => wasm.renderUpdate(sharedState.wasmHandle)).not.toThrow();

  expect(callLog.writeHandles.every((handle) => handle === activeHandle)).toBe(true);
  expect(callLog.renderHandles.every((handle) => handle === activeHandle)).toBe(true);
  expect(callLog.resizeHandles.every((handle) => handle === activeHandle)).toBe(true);
  expect(callLog.pixelHandles.every((handle) => handle === activeHandle)).toBe(true);

  const rows = viewportRows(wasm, sharedState.wasmHandle);
  expect(rows.length).toBeGreaterThan(0);

  wasm.destroy(sharedState.wasmHandle);
});

test("queued PTY onData flush after snapshot stays bound to the new wasm handle", async () => {
  const wasm = await loadResttyWasm();
  const snapshot = buildRichSnapshotSource(wasm);
  const harness = createRuntimeHarness(wasm);
  const initialHandle = harness.sharedState.wasmHandle;
  const { app, callLog, ptyOutputBuffer, sharedState } = harness;

  app.connectPty();
  expect(harness.getPtyCallbacks()).not.toBeNull();

  expect(app.loadBinarySnapshot(snapshot)).toBe(true);
  const activeHandle = sharedState.wasmHandle;
  expect(activeHandle).not.toBe(initialHandle);
  expect(callLog.loadHandles).toEqual([activeHandle]);
  expect(callLog.destroyHandles[0]).toBe(initialHandle);

  harness.getPtyCallbacks()?.onData?.("after");
  ptyOutputBuffer.flush();
  expect(() => wasm.renderUpdate(sharedState.wasmHandle)).not.toThrow();

  expect(() => app.resize(200, 60)).not.toThrow();

  harness.getPtyCallbacks()?.onData?.("!\r\n");
  ptyOutputBuffer.flush();
  expect(() => wasm.renderUpdate(sharedState.wasmHandle)).not.toThrow();

  expect(callLog.writeHandles.every((handle) => handle === activeHandle)).toBe(true);
  expect(callLog.renderHandles.every((handle) => handle === activeHandle)).toBe(true);
  expect(callLog.resizeHandles.every((handle) => handle === activeHandle)).toBe(true);
  expect(callLog.pixelHandles.every((handle) => handle === activeHandle)).toBe(true);

  const rows = viewportRows(wasm, sharedState.wasmHandle);
  expect(rows.length).toBeGreaterThan(0);

  wasm.destroy(sharedState.wasmHandle);
});

if (
  process.env.RESTTY_EXTERNAL_SNAPSHOT &&
  !process.env.RESTTY_EXTERNAL_MANIFEST &&
  !process.env.RESTTY_EXTERNAL_LIVE_CHUNKS
) {
  test("external Botster snapshot survives public runtime load, queued PTY flush, and resize", async () => {
    const wasm = await loadResttyWasm();
    const snapshot = new Uint8Array(readFileSync(process.env.RESTTY_EXTERNAL_SNAPSHOT));
    expect(snapshot.byteLength).toBeGreaterThan(0);

    const harness = createRuntimeHarness(wasm);
    const initialHandle = harness.sharedState.wasmHandle;
    const { app, callLog, ptyOutputBuffer, sharedState } = harness;

    app.connectPty();
    expect(harness.getPtyCallbacks()).not.toBeNull();
    expect(app.loadBinarySnapshot(snapshot)).toBe(true);

    const activeHandle = sharedState.wasmHandle;
    expect(activeHandle).not.toBe(initialHandle);
    expect(callLog.loadHandles).toEqual([activeHandle]);
    expect(callLog.destroyHandles[0]).toBe(initialHandle);

    harness.getPtyCallbacks()?.onData?.("after");
    ptyOutputBuffer.flush();
    expect(() => wasm.renderUpdate(sharedState.wasmHandle)).not.toThrow();

    expect(() => app.resize(200, 60)).not.toThrow();

    harness.getPtyCallbacks()?.onData?.("!\r\n");
    ptyOutputBuffer.flush();
    expect(() => wasm.renderUpdate(sharedState.wasmHandle)).not.toThrow();

    expect(callLog.writeHandles.every((handle) => handle === activeHandle)).toBe(true);
    expect(callLog.renderHandles.every((handle) => handle === activeHandle)).toBe(true);
    expect(callLog.resizeHandles.every((handle) => handle === activeHandle)).toBe(true);
    expect(callLog.pixelHandles.every((handle) => handle === activeHandle)).toBe(true);

    const rows = viewportRows(wasm, sharedState.wasmHandle);
    expect(rows.length).toBeGreaterThan(0);

    wasm.destroy(sharedState.wasmHandle);
  });
}

if (
  process.env.RESTTY_EXTERNAL_MANIFEST &&
  process.env.RESTTY_EXTERNAL_SNAPSHOT &&
  process.env.RESTTY_EXTERNAL_LIVE_CHUNKS
) {
  test("exact Botster production snapshot and live chunks replay through the public runtime path", async () => {
    const wasm = await loadResttyWasm();
    const manifestPath = process.env.RESTTY_EXTERNAL_MANIFEST;
    const snapshotPath = process.env.RESTTY_EXTERNAL_SNAPSHOT;
    const liveChunkPaths = process.env.RESTTY_EXTERNAL_LIVE_CHUNKS.split(",").filter(Boolean);
    const grid = parseManifestGrid(manifestPath);
    const snapshot = new Uint8Array(readFileSync(snapshotPath));
    const { chunks: decodedChunks, firstHex } = decodeLiveChunks(liveChunkPaths);
    const rawProbe = probeRawSnapshotImport(wasm, snapshot, grid);

    const harness = createRuntimeHarness(wasm, grid);
    const initialHandle = harness.sharedState.wasmHandle;
    const { app, callLog, ptyOutputBuffer, sharedState } = harness;

    app.connectPty();
    expect(harness.getPtyCallbacks()).not.toBeNull();

    const loaded = app.loadBinarySnapshot(snapshot);
    if (!loaded) {
      throw new Error(
        `loadBinarySnapshot failed importCode=${rawProbe.importCode} renderCode=${rawProbe.renderCode} importHandle=${callLog.loadHandles[0] ?? "none"} firstLiveHex=${firstHex}`,
      );
    }

    const activeHandle = sharedState.wasmHandle;
    expect(activeHandle).not.toBe(initialHandle);
    expect(callLog.loadHandles).toEqual([activeHandle]);
    expect(callLog.destroyHandles[0]).toBe(initialHandle);

    for (const chunk of decodedChunks) {
      harness.getPtyCallbacks()?.onData?.(chunk);
      ptyOutputBuffer.flush();
    }

    expect(() => wasm.renderUpdate(sharedState.wasmHandle)).not.toThrow();
    expect(callLog.writeHandles.every((handle) => handle === activeHandle)).toBe(true);
    expect(callLog.renderHandles.every((handle) => handle === activeHandle)).toBe(true);
    expect(callLog.pixelHandles.every((handle) => handle === activeHandle)).toBe(true);

    wasm.destroy(sharedState.wasmHandle);
  });
}
