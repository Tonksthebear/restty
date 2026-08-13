import { expect, test } from "bun:test";
import { createFontEntry } from "../src/fonts";
import { createFontRuntimeGridHelpers } from "../src/runtime/create-runtime/font-runtime-grid-helpers";

test("grid resize defers both WASM and PTY resize through the snapshot barrier", () => {
  const font = {
    scaleForSize: () => 1,
    glyphIdForChar: () => 1,
    advanceWidth: () => 10,
    ascender: 15,
    descender: -5,
    unitsPerEm: 20,
  } as never;
  const fontEntry = createFontEntry(font, "test");
  const gridState = {
    cols: 0,
    rows: 0,
    cellW: 0,
    cellH: 0,
    fontSizePx: 0,
    scale: 1,
    lineHeight: 0,
    baselineOffset: 0,
    yPad: 0,
  };
  const canvas = { width: 800, height: 480 };
  const deferred: Array<{ cols: number; rows: number }> = [];
  const wasmResizes: Array<{ cols: number; rows: number }> = [];
  const ptyResizes: Array<{ cols: number; rows: number }> = [];
  let barrierActive = true;

  const helpers = createFontRuntimeGridHelpers({
    fontState: {
      font,
      fonts: [fontEntry],
      fontSizePx: 0,
      sizeMode: "height",
      fontPickCache: new Map(),
    },
    fontConfig: { sizePx: 20 },
    gridState,
    gridEl: null,
    cellEl: null,
    getCanvas: () => canvas as HTMLCanvasElement,
    getCurrentDpr: () => 1,
    getActiveState: () => null,
    getWasmReady: () => true,
    getWasm: () =>
      ({
        resize: (_handle: number, cols: number, rows: number) => {
          wasmResizes.push({ cols, rows });
        },
        renderUpdate: () => undefined,
        setPixelSize: () => undefined,
      }) as never,
    getWasmHandle: () => 1,
    deferTerminalResize: (cols, rows) => {
      if (!barrierActive) return false;
      deferred.push({ cols, rows });
      return true;
    },
    ptyTransport: {
      isConnected: () => true,
      resize: (cols: number, rows: number) => {
        ptyResizes.push({ cols, rows });
        return true;
      },
    } as never,
    setNeedsRender: () => undefined,
    shapeClusterWithFont: () => ({ advance: 10 }),
  });

  helpers.updateGrid();
  expect(deferred).toEqual([{ cols: 80, rows: 24 }]);
  expect(wasmResizes).toEqual([]);
  expect(ptyResizes).toEqual([]);

  barrierActive = false;
  canvas.width = 900;
  helpers.updateGrid();
  expect(wasmResizes).toEqual([{ cols: 90, rows: 24 }]);
  expect(ptyResizes).toEqual([{ cols: 90, rows: 24 }]);
});
