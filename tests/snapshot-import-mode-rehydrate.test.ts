import { beforeAll, expect, test } from "bun:test";
import { createInputHandler } from "../src/input";
import { loadResttyWasm } from "../src/wasm/runtime/restty-wasm";
import {
  createRuntimeAppApi,
  type RuntimeAppApiSharedState,
} from "../src/runtime/create-runtime/runtime-app-api";

let wasm: Awaited<ReturnType<typeof loadResttyWasm>>;

beforeAll(async () => {
  wasm = await loadResttyWasm();
});

test("wasm mouse tracking bits reflect VT modes (source for rehydrate)", () => {
  const handle = wasm.create(40, 12, 100_000);
  expect(handle).toBeGreaterThan(0);
  try {
    expect(wasm.getMouseTrackingBits(handle)).toBe(0);
    wasm.write(handle, "\x1b[?1000;1006h");
    const bits = wasm.getMouseTrackingBits(handle);
    expect(bits & (1 << 1)).not.toBe(0); // 1000
    expect(bits & (1 << 5)).not.toBe(0); // 1006
    // Kitty flags are live from WASM (no JS shadow).
    expect(typeof wasm.getKittyKeyboardFlags(handle)).toBe("number");
  } finally {
    wasm.destroy(handle);
  }
});

test("post-import rehydrate activates mouse from Ghostty bits without CSI to JS", () => {
  const handle = wasm.create(40, 12, 100_000);
  expect(handle).toBeGreaterThan(0);
  try {
    wasm.write(handle, "\x1b[?1000;1006h");
    const bits = wasm.getMouseTrackingBits(handle);

    const replies: string[] = [];
    const input = createInputHandler({
      sendReply: (data) => {
        replies.push(data);
      },
      positionToCell: () => ({ row: 0, col: 0 }),
    });
    input.setMouseMode("auto");
    expect(input.isMouseActive()).toBe(false);

    // No filterOutput after this — rehydrate only.
    input.rehydrateMouseFromTrackingBits?.(bits);
    expect(input.isMouseActive()).toBe(true);

    const wheel = {
      deltaY: 40,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
    } as WheelEvent;
    expect(input.sendMouseEvent("wheel", wheel)).toBe(true);
    expect(replies.length).toBeGreaterThan(0);
    expect(replies[0]).toMatch(/^\x1b\[</);
  } finally {
    wasm.destroy(handle);
  }
});

test("public loadBinarySnapshot rehydrates mouse from the NEW handle bits", () => {
  const replies: string[] = [];
  const input = createInputHandler({
    sendReply: (data) => {
      replies.push(data);
    },
    positionToCell: () => ({ row: 0, col: 0 }),
  });
  input.setMouseMode("auto");
  expect(input.isMouseActive()).toBe(false);

  let nextId = 100;
  const handles = new Map<number, number>(); // app handle id -> real wasm handle
  const sharedState: RuntimeAppApiSharedState = {
    wasm: {
      destroy: (handle: number) => {
        const real = handles.get(handle);
        if (real) {
          wasm.destroy(real);
          handles.delete(handle);
        }
      },
      create: (cols: number, rows: number, maxScrollback: number) => {
        const real = wasm.create(cols, rows, maxScrollback);
        const id = nextId++;
        handles.set(id, real);
        return id;
      },
      setPixelSize: () => undefined,
      loadBinarySnapshot: (handle: number, _data: Uint8Array) => {
        const real = handles.get(handle);
        if (!real) return "missing handle";
        // Simulate a GHOSTSNP restore that includes mouse modes, without any
        // CSI reaching the JS output filter (no filterOutput after import).
        wasm.write(real, "\x1b[?1000;1006h");
        return null;
      },
      getMouseTrackingBits: (handle: number) => {
        const real = handles.get(handle);
        return real ? wasm.getMouseTrackingBits(real) : 0;
      },
      getKittyKeyboardFlags: (handle: number) => {
        const real = handles.get(handle);
        return real ? wasm.getKittyKeyboardFlags(real) : 0;
      },
    } as never,
    wasmExports: null,
    wasmHandle: (() => {
      const real = wasm.create(20, 8, 10_000);
      const id = nextId++;
      handles.set(id, real);
      return id;
    })(),
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
    inputHandler: input,
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

  const initial = sharedState.wasmHandle;
  expect(app.loadBinarySnapshot(new Uint8Array([1, 2, 3, 4]))).toBe(true);
  expect(sharedState.wasmHandle).not.toBe(initial);
  // Mouse active from rehydrate — never saw CSI via filterOutput.
  expect(input.isMouseActive()).toBe(true);

  const wheel = {
    deltaY: 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
  } as WheelEvent;
  expect(input.sendMouseEvent("wheel", wheel)).toBe(true);
  expect(replies.length).toBeGreaterThan(0);

  for (const real of handles.values()) wasm.destroy(real);
});
