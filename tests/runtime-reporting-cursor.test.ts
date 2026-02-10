import { expect, test } from "bun:test";
import { createRuntimeReporting } from "../src/runtime/create-runtime/runtime-reporting";

function createReporting(options: {
  debugCursor?: { col: number; row: number };
  renderCursorBounds?: { cols: number; rows: number };
}) {
  const debugCursor = options.debugCursor;
  const renderCursorBounds = options.renderCursorBounds ?? { cols: 80, rows: 24 };
  return createRuntimeReporting({
    selectionState: { active: false, dragging: false, anchor: null, focus: null },
    getLastRenderState: () => renderCursorBounds as never,
    getWasmReady: () => false,
    getWasm: () => null,
    getWasmHandle: () => 1,
    getWasmExports: () =>
      debugCursor
        ? ({
            restty_debug_cursor_x: () => debugCursor.col,
            restty_debug_cursor_y: () => debugCursor.row,
          } as never)
        : null,
    callbacks: undefined,
    termSizeEl: null,
    cursorPosEl: null,
    dbgEl: null,
    setCursorForCpr: () => {},
  });
}

test("resolveCursorPosition keeps in-bounds render cursor even if debug differs", () => {
  const reporting = createReporting({ debugCursor: { col: 12, row: 7 } });

  const resolved = reporting.resolveCursorPosition({
    row: 2,
    col: 3,
    visible: 1,
    style: 0,
    blinking: 0,
    wideTail: 0,
    color: 0,
  });

  expect(resolved).toEqual({ col: 3, row: 2, wideTail: false });
});

test("resolveCursorPosition ignores out-of-bounds debug cursor", () => {
  const reporting = createReporting({ debugCursor: { col: 999, row: 999 } });

  const resolved = reporting.resolveCursorPosition({
    row: 5,
    col: 6,
    visible: 1,
    style: 0,
    blinking: 0,
    wideTail: 1,
    color: 0,
  });

  expect(resolved).toEqual({ col: 6, row: 5, wideTail: true });
});
