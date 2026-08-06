import { expect, test } from "bun:test";
import { ResttyWasm } from "../src/wasm/runtime/restty-wasm";
import type { ResttyWasmExports, WasmAbi } from "../src/wasm/runtime/types";

type SnapshotImportCall = {
  handle: number;
  data: number[];
};

type SnapshotHarness = {
  wasm: ResttyWasm;
  imports: SnapshotImportCall[];
  renderUpdateCalls: number;
};

function createHarness(overrides: Partial<ResttyWasmExports> = {}): SnapshotHarness {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const imports: SnapshotImportCall[] = [];
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
    restty_snapshot_import: (handle, dataPtr, dataLen) => {
      imports.push({
        handle,
        data: Array.from(new Uint8Array(memory.buffer, dataPtr, dataLen)),
      });
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
    imports,
    get renderUpdateCalls() {
      return renderUpdateCalls;
    },
  };
}

test("loadBinarySnapshot forwards the opaque blob unchanged", () => {
  const harness = createHarness();
  const snapshot = new Uint8Array([1, 2, 3, 4, 5, 6]);

  // ResttyWasm.loadBinarySnapshot: null = success, string = failure.
  expect(harness.wasm.loadBinarySnapshot(7, snapshot)).toBeNull();
  expect(harness.imports).toEqual([
    {
      handle: 7,
      data: [1, 2, 3, 4, 5, 6],
    },
  ]);
  expect(harness.renderUpdateCalls).toBe(1);
});

test("loadBinarySnapshot returns an error string when snapshot import is unavailable", () => {
  const harness = createHarness({
    restty_snapshot_import: undefined,
  });
  const snapshot = new Uint8Array([1]);

  const err = harness.wasm.loadBinarySnapshot(1, snapshot);
  expect(err).not.toBeNull();
  expect(String(err)).toMatch(/not available/);
  expect(harness.imports).toEqual([]);
  expect(harness.renderUpdateCalls).toBe(0);
});
