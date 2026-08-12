import { expect, test } from "bun:test";
import {
  createRuntimeAppApi,
  type RuntimeAppApiSharedState,
} from "../src/runtime/create-runtime/runtime-app-api";

test("runtime app api exposes binary snapshot loading on the public Restty app", () => {
  const snapshotCalls: Array<{ handle: number; data: number[] }> = [];
  const createCalls: Array<{ cols: number; rows: number; maxScrollback: number }> = [];
  const destroyCalls: number[] = [];
  const pixelSizeCalls: Array<{ handle: number; width: number; height: number }> = [];
  const resizeCalls: Array<{ handle: number; cols: number; rows: number }> = [];
  const renderCalls: number[] = [];
  let clearSelectionCalls = 0;
  let searchResetCalls = 0;
  const hoverUpdates: Array<number | null> = [];

  const sharedState: RuntimeAppApiSharedState = {
    wasm: {
      destroy: (handle: number) => {
        destroyCalls.push(handle);
      },
      create: (cols: number, rows: number, maxScrollback: number) => {
        createCalls.push({ cols, rows, maxScrollback });
        return 17;
      },
      setPixelSize: (handle: number, width: number, height: number) => {
        pixelSizeCalls.push({ handle, width, height });
      },
      loadBinarySnapshot: (handle: number, data: Uint8Array) => {
        snapshotCalls.push({ handle, data: Array.from(data) });
        return null;
      },
      resize: (handle: number, cols: number, rows: number) => {
        resizeCalls.push({ handle, cols, rows });
      },
      renderUpdate: (handle: number) => {
        renderCalls.push(handle);
      },
    } as never,
    wasmExports: null,
    wasmHandle: 9,
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
      selectionState: { active: true, dragging: false },
      linkState: { hoverId: 42, hoverUri: "https://example.test" },
      imeState: { composing: false, preedit: "", selectionStart: 0, selectionEnd: 0 },
      clearSelection: () => {
        clearSelectionCalls += 1;
      },
      updateLinkHover: (value: number | null) => {
        hoverUpdates.push(value);
      },
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
    handleSearchWasmReset: () => {
      searchResetCalls += 1;
    },
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

  expect(app.loadBinarySnapshot(new Uint8Array([1, 2, 3]))).toBe(true);
  expect(createCalls).toEqual([{ cols: 80, rows: 24, maxScrollback: 10000000 }]);
  expect(pixelSizeCalls).toEqual([
    { handle: 17, width: 800, height: 480 },
    { handle: 17, width: 800, height: 480 },
  ]);
  expect(snapshotCalls).toEqual([{ handle: 17, data: [1, 2, 3] }]);
  expect(resizeCalls).toEqual([{ handle: 17, cols: 80, rows: 24 }]);
  expect(renderCalls).toEqual([17]);
  expect(destroyCalls).toEqual([9]);
  expect(clearSelectionCalls).toBe(1);
  expect(hoverUpdates).toEqual([null]);
  expect(searchResetCalls).toBe(1);
  expect(sharedState.wasmHandle).toBe(17);
  expect(sharedState.needsRender).toBe(true);
});

test("runtime app api recreates the wasm handle before loading a binary snapshot", () => {
  const snapshotCalls: Array<{ handle: number; data: number[] }> = [];
  const destroyCalls: number[] = [];
  const createCalls: Array<{ cols: number; rows: number; maxScrollback: number }> = [];
  const pixelSizeCalls: Array<{ handle: number; width: number; height: number }> = [];
  const resizeCalls: Array<{ handle: number; cols: number; rows: number }> = [];
  const renderCalls: number[] = [];
  let searchResetCalls = 0;

  const sharedState: RuntimeAppApiSharedState = {
    wasm: {
      destroy: (handle: number) => {
        destroyCalls.push(handle);
      },
      create: (cols: number, rows: number, maxScrollback: number) => {
        createCalls.push({ cols, rows, maxScrollback });
        return 27;
      },
      setPixelSize: (handle: number, width: number, height: number) => {
        pixelSizeCalls.push({ handle, width, height });
      },
      loadBinarySnapshot: (handle: number, data: Uint8Array) => {
        snapshotCalls.push({ handle, data: Array.from(data) });
        return null;
      },
      resize: (handle: number, cols: number, rows: number) => {
        resizeCalls.push({ handle, cols, rows });
      },
      renderUpdate: (handle: number) => {
        renderCalls.push(handle);
      },
    } as never,
    wasmExports: null,
    wasmHandle: 9,
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
    CURSOR_BLINK_MS: 600,
    RESIZE_ACTIVE_MS: 180,
    TARGET_RENDER_FPS: 60,
    BACKGROUND_RENDER_FPS: 15,
    KITTY_FLAG_REPORT_EVENTS: 1 << 1,
    resizeState: { lastAt: 0 },
    tickWebGPU: () => undefined,
    tickWebGL: () => undefined,
    updateGrid: () => undefined,
    gridState: { cols: 120, rows: 35 },
    getCanvas: () => ({ width: 960, height: 700 }) as HTMLCanvasElement,
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
    handleSearchWasmReset: () => {
      searchResetCalls += 1;
    },
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

  expect(app.loadBinarySnapshot(new Uint8Array([7, 8, 9]))).toBe(true);
  expect(createCalls).toEqual([{ cols: 120, rows: 35, maxScrollback: 10000000 }]);
  expect(pixelSizeCalls).toEqual([
    { handle: 27, width: 960, height: 700 },
    { handle: 27, width: 960, height: 700 },
  ]);
  expect(snapshotCalls).toEqual([{ handle: 27, data: [7, 8, 9] }]);
  expect(resizeCalls).toEqual([{ handle: 27, cols: 120, rows: 35 }]);
  expect(renderCalls).toEqual([27]);
  expect(destroyCalls).toEqual([9]);
  expect(sharedState.wasmHandle).toBe(27);
  expect(searchResetCalls).toBe(1);
});

test("runtime app api binary live path can suppress output using raw bytes", () => {
  const writeBytesCalls: Array<{ handle: number; data: number[] }> = [];
  const renderCalls: number[] = [];
  const hookPayloads: Array<{ source: string; text: string; bytes: number[] }> = [];

  const sharedState: RuntimeAppApiSharedState = {
    wasm: {
      setPixelSize: () => undefined,
      writeBytes: (handle: number, data: Uint8Array) => {
        writeBytesCalls.push({ handle, data: Array.from(data) });
      },
      drainOutput: () => "",
      renderUpdate: (handle: number) => {
        renderCalls.push(handle);
      },
    } as never,
    wasmExports: null,
    wasmHandle: 41,
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
    runBeforeRenderOutputBytesHook: (bytes, source) => {
      const copy = Array.from(bytes);
      hookPayloads.push({
        source,
        text: String.fromCharCode(...copy),
        bytes: copy,
      });
      return bytes[0] !== 0xff;
    },
    getSelectionText: () => "",
    initialPreferredRenderer: "auto",
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

  runtime.sendInputBytes(Uint8Array.from([0xff, 0x41]));
  runtime.sendInputBytes(Uint8Array.from([0x42]));

  expect(hookPayloads).toEqual([
    { source: "pty", text: "\xffA", bytes: [0xff, 0x41] },
    { source: "pty", text: "B", bytes: [0x42] },
  ]);
  expect(writeBytesCalls).toEqual([{ handle: 41, data: [0x42] }]);
  expect(renderCalls).toEqual([41]);
});
