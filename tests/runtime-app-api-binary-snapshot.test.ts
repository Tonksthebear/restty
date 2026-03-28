import { expect, test } from "bun:test";
import {
  createRuntimeAppApi,
  type RuntimeAppApiSharedState,
} from "../src/runtime/create-runtime/runtime-app-api";

test("runtime app api exposes binary snapshot loading on the public Restty app", () => {
  const snapshotCalls: Array<{ handle: number; data: number[] }> = [];
  let clearSelectionCalls = 0;
  let searchResetCalls = 0;
  const hoverUpdates: Array<number | null> = [];

  const sharedState: RuntimeAppApiSharedState = {
    wasm: {
      loadBinarySnapshot: (handle: number, data: Uint8Array) => {
        snapshotCalls.push({ handle, data: Array.from(data) });
        return true;
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
  expect(snapshotCalls).toEqual([{ handle: 9, data: [1, 2, 3] }]);
  expect(clearSelectionCalls).toBe(1);
  expect(hoverUpdates).toEqual([null]);
  expect(searchResetCalls).toBe(1);
  expect(sharedState.needsRender).toBe(true);
});
