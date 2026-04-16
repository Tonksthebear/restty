import { expect, test } from "bun:test";
import {
  createRuntimeAppApi,
  type RuntimeAppApiSharedState,
} from "../src/runtime/create-runtime/runtime-app-api";

test("runtime app api destroy releases renderer state and clears strong references", () => {
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

  try {
    const cleanupFns: Array<() => void> = [];
    const cleanupCanvasFns: Array<() => void> = [];
    const cleanupCalls: string[] = [];
    const destroyCalls: number[] = [];
    const webglTeardownCalls: string[] = [];
    const rendererDestroyCalls: unknown[] = [];
    const canvas = {
      width: 800,
      height: 480,
    } as HTMLCanvasElement;
    const activeState = {
      gl: {} as WebGL2RenderingContext,
    } as never;

    cleanupCanvasFns.push(() => {
      cleanupCalls.push("canvas");
    });
    cleanupFns.push(() => {
      cleanupCalls.push("runtime");
    });

    const sharedState: RuntimeAppApiSharedState = {
      wasm: {
        destroy: (handle: number) => {
          destroyCalls.push(handle);
        },
      } as never,
      wasmExports: {} as never,
      wasmHandle: 17,
      wasmReady: true,
      activeState,
      needsRender: true,
      lastRenderTime: 123,
      currentContextType: "webgl2",
      isFocused: true,
      lastKeydownSeq: "\x16",
      lastKeydownSeqAt: 456,
    };

    const runtime = createRuntimeAppApi({
      session: {} as never,
      ptyTransport: {
        isConnected: () => false,
        connect: () => undefined,
        disconnect: () => undefined,
        destroy: () => undefined,
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
        linkState: { hoverId: 0, hoverUri: "" },
        imeState: { composing: false, preedit: "", selectionStart: 0, selectionEnd: 0 },
        clearSelection: () => undefined,
        updateLinkHover: () => undefined,
      } as never,
      lifecycleThemeSizeRuntime: {
        cancelScheduledSizeUpdate: () => undefined,
        getActiveTheme: () => null,
      },
      cleanupFns,
      cleanupCanvasFns,
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
      getCanvas: () => canvas,
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
      clearWebGLShaderStages: (state) => {
        if (state) webglTeardownCalls.push("clear-webgl");
      },
      destroyWebGLStageTargets: (state) => {
        if (state) webglTeardownCalls.push("destroy-webgl-targets");
      },
      destroyActiveRenderer: (state) => {
        rendererDestroyCalls.push(state);
      },
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

    app.destroy();

    expect(destroyCalls).toEqual([17]);
    expect(cleanupCalls).toEqual(["canvas", "runtime"]);
    expect(cleanupCanvasFns).toHaveLength(0);
    expect(cleanupFns).toHaveLength(0);
    expect(webglTeardownCalls).toEqual(["clear-webgl", "destroy-webgl-targets"]);
    expect(rendererDestroyCalls).toEqual([activeState]);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(sharedState.wasm).toBeNull();
    expect(sharedState.wasmExports).toBeNull();
    expect(sharedState.wasmHandle).toBe(0);
    expect(sharedState.wasmReady).toBe(false);
    expect(sharedState.activeState).toBeNull();
    expect(sharedState.needsRender).toBe(false);
    expect(sharedState.lastRenderTime).toBe(0);
    expect(sharedState.currentContextType).toBeNull();
    expect(sharedState.isFocused).toBe(false);
    expect(sharedState.lastKeydownSeq).toBe("");
    expect(sharedState.lastKeydownSeqAt).toBe(0);
  } finally {
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});
