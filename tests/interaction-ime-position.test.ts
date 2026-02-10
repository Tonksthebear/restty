import { expect, test } from "bun:test";
import { createRuntimeInteraction } from "../src/runtime/create-runtime/interaction-runtime";

class FakeCanvas {
  style: Record<string, string> = {};
  parentElement: HTMLElement | null = null;
  width = 660;
  height = 360;

  getBoundingClientRect(): DOMRect {
    return {
      left: 100,
      top: 200,
      width: 330,
      height: 180,
    } as DOMRect;
  }

  setPointerCapture(): void {}
}

test("updateImePosition anchors IME input using rendered cell metrics", () => {
  const canvas = new FakeCanvas();
  const imeInput = { style: {} } as HTMLTextAreaElement;

  const interaction = createRuntimeInteraction({
    attachCanvasEvents: false,
    touchSelectionMode: "off",
    touchSelectionLongPressMs: 450,
    touchSelectionMoveThresholdPx: 10,
    showOverlayScrollbar: false,
    kittyOverlayDebugEnabled: false,
    imeInput,
    cleanupCanvasFns: [],
    getCanvas: () => canvas as unknown as HTMLCanvasElement,
    getCurrentDpr: () => 2,
    getGridState: () => ({ cols: 3, rows: 3, cellW: 200, cellH: 200 }),
    getLastRenderState: () => null,
    getWasmReady: () => false,
    getWasm: () => null,
    getWasmHandle: () => 0,
    getWasmExports: () => null,
    updateLinkHover: () => {},
    markNeedsRender: () => {},
  });

  interaction.updateImePosition({ row: 1, col: 2 }, 200, 200);

  expect(imeInput.style.transform).toBe("none");
  expect(imeInput.style.left).toBe("300px");
  expect(imeInput.style.top).toBe("300px");
});
