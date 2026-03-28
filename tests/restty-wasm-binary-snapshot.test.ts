import { expect, test } from "bun:test";
import { ResttyWasm } from "../src/wasm/runtime/restty-wasm";
import type { ResttyWasmExports, WasmAbi } from "../src/wasm/runtime/types";

type SnapshotPageCall = {
  handle: number;
  screenKey: number;
  data: number[];
  dataLen: number;
  capCols: number;
  capRows: number;
  capStyles: number;
  capGraphemeBytes: number;
  capHyperlinkBytes: number;
  capStringBytes: number;
  usedCols: number;
  usedRows: number;
};

type SnapshotHarness = {
  wasm: ResttyWasm;
  pages: SnapshotPageCall[];
  stateImports: number[][];
  finalizeCalls: number;
  renderUpdateCalls: number;
};

function pushUint16(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function createSnapshot(bytesByScreen: Array<Array<{
  pageData: number[];
  usedCols: number;
  usedRows: number;
  capCols: number;
  capRows: number;
  capStyles: number;
  capGraphemeBytes: number;
  capHyperlinkBytes: number;
  capStringBytes: number;
}>>, activeScreenKey: number, stateBlob: number[]): Uint8Array {
  const bytes: number[] = [1, bytesByScreen.length, activeScreenKey];
  for (const screen of bytesByScreen) {
    pushUint32(bytes, screen.length);
    for (const page of screen) {
      pushUint32(bytes, page.pageData.length);
      pushUint16(bytes, page.usedCols);
      pushUint16(bytes, page.usedRows);
      pushUint16(bytes, page.capCols);
      pushUint16(bytes, page.capRows);
      pushUint16(bytes, page.capStyles);
      pushUint32(bytes, page.capGraphemeBytes);
      pushUint16(bytes, page.capHyperlinkBytes);
      pushUint32(bytes, page.capStringBytes);
      bytes.push(...page.pageData);
    }
  }
  pushUint32(bytes, stateBlob.length);
  bytes.push(...stateBlob);
  return new Uint8Array(bytes);
}

function createHarness(
  overrides: Partial<ResttyWasmExports> = {},
): SnapshotHarness {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const pages: SnapshotPageCall[] = [];
  const stateImports: number[][] = [];
  let finalizeCalls = 0;
  let renderUpdateCalls = 0;
  let nextPtr = 64;

  const exports: ResttyWasmExports = {
    memory,
    restty_create: () => 0,
    restty_destroy: () => undefined,
    restty_write: () => undefined,
    restty_resize: () => undefined,
    restty_render_update: () => {
      renderUpdateCalls += 1;
      return 0;
    },
    restty_alloc: (len: number) => {
      const ptr = nextPtr;
      nextPtr += Math.max(len, 1);
      return ptr;
    },
    restty_free: () => undefined,
    restty_snapshot_page_load: (
      handle,
      screenKey,
      dataPtr,
      dataLen,
      capCols,
      capRows,
      capStyles,
      capGraphemeBytes,
      capHyperlinkBytes,
      capStringBytes,
      usedCols,
      usedRows,
    ) => {
      pages.push({
        handle,
        screenKey,
        data: Array.from(new Uint8Array(memory.buffer, dataPtr, dataLen)),
        dataLen,
        capCols,
        capRows,
        capStyles,
        capGraphemeBytes,
        capHyperlinkBytes,
        capStringBytes,
        usedCols,
        usedRows,
      });
      return 0;
    },
    restty_snapshot_state_import: (_handle, dataPtr, dataLen) => {
      stateImports.push(Array.from(new Uint8Array(memory.buffer, dataPtr, dataLen)));
      return 0;
    },
    restty_snapshot_state_finalize: () => {
      finalizeCalls += 1;
      return 0;
    },
    ...overrides,
  };

  const wasm = Object.create(ResttyWasm.prototype) as ResttyWasm;
  Object.assign(wasm as unknown as Record<string, unknown>, {
    exports,
    abi: { kind: "cells" } satisfies WasmAbi,
    memory,
    renderViewCaches: new Map(),
  });

  return {
    wasm,
    pages,
    stateImports,
    get finalizeCalls() {
      return finalizeCalls;
    },
    get renderUpdateCalls() {
      return renderUpdateCalls;
    },
  };
}

test("loadBinarySnapshot parses pages and imports snapshot state", () => {
  const harness = createHarness();
  const snapshot = createSnapshot(
    [
      [
        {
          pageData: [1, 2, 3],
          usedCols: 10,
          usedRows: 11,
          capCols: 12,
          capRows: 13,
          capStyles: 14,
          capGraphemeBytes: 15,
          capHyperlinkBytes: 16,
          capStringBytes: 17,
        },
      ],
      [
        {
          pageData: [4, 5],
          usedCols: 20,
          usedRows: 21,
          capCols: 22,
          capRows: 23,
          capStyles: 24,
          capGraphemeBytes: 25,
          capHyperlinkBytes: 26,
          capStringBytes: 27,
        },
      ],
    ],
    1,
    [9, 8, 7, 6],
  );

  expect(harness.wasm.loadBinarySnapshot(7, snapshot)).toBe(true);
  expect(harness.pages).toEqual([
    {
      handle: 7,
      screenKey: 0,
      data: [1, 2, 3],
      dataLen: 3,
      capCols: 12,
      capRows: 13,
      capStyles: 14,
      capGraphemeBytes: 15,
      capHyperlinkBytes: 16,
      capStringBytes: 17,
      usedCols: 10,
      usedRows: 11,
    },
    {
      handle: 7,
      screenKey: 1,
      data: [4, 5],
      dataLen: 2,
      capCols: 22,
      capRows: 23,
      capStyles: 24,
      capGraphemeBytes: 25,
      capHyperlinkBytes: 26,
      capStringBytes: 27,
      usedCols: 20,
      usedRows: 21,
    },
  ]);
  expect(harness.stateImports).toEqual([[9, 8, 7, 6]]);
  expect(harness.finalizeCalls).toBe(1);
  expect(harness.renderUpdateCalls).toBe(1);
});

test("loadBinarySnapshot returns false when snapshot exports are unavailable", () => {
  const harness = createHarness({
    restty_snapshot_page_load: undefined,
  });
  const snapshot = createSnapshot(
    [
      [
        {
          pageData: [1],
          usedCols: 1,
          usedRows: 1,
          capCols: 1,
          capRows: 1,
          capStyles: 1,
          capGraphemeBytes: 1,
          capHyperlinkBytes: 1,
          capStringBytes: 1,
        },
      ],
    ],
    0,
    [1],
  );

  expect(harness.wasm.loadBinarySnapshot(1, snapshot)).toBe(false);
  expect(harness.pages).toEqual([]);
  expect(harness.stateImports).toEqual([]);
  expect(harness.finalizeCalls).toBe(0);
  expect(harness.renderUpdateCalls).toBe(0);
});
