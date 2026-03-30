import { beforeAll, expect, test } from "bun:test";
import { loadResttyWasm } from "../src/wasm/runtime/restty-wasm";

let wasm: Awaited<ReturnType<typeof loadResttyWasm>>;

beforeAll(async () => {
  wasm = await loadResttyWasm();
});

function exportBinarySnapshot(handle: number): Uint8Array {
  const exportSnapshot = wasm.exports.restty_snapshot_export;
  const getSnapshotPtr = wasm.exports.restty_snapshot_ptr;
  const getSnapshotLen = wasm.exports.restty_snapshot_len;
  if (!exportSnapshot || !getSnapshotPtr || !getSnapshotLen) {
    throw new Error("snapshot export helpers are unavailable");
  }

  expect(exportSnapshot(handle)).toBe(0);
  const len = getSnapshotLen(handle);
  const ptr = getSnapshotPtr(handle);
  expect(len).toBeGreaterThan(0);
  expect(ptr).toBeGreaterThan(0);

  return new Uint8Array(new Uint8Array(wasm.memory.buffer, ptr, len));
}

function viewportRows(handle: number): string[] {
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

test("snapshot import accepts a live write immediately after restore", () => {
  const source = wasm.create(10, 3, 1_000_000);
  const target = wasm.create(10, 3, 1_000_000);
  expect(source).toBeGreaterThan(0);
  expect(target).toBeGreaterThan(0);

  try {
    wasm.write(source, "base");
    wasm.renderUpdate(source);

    const snapshot = exportBinarySnapshot(source);
    expect(wasm.loadBinarySnapshot(target, snapshot)).toBe(true);

    expect(() => wasm.write(target, "X")).not.toThrow();
    expect(() => wasm.renderUpdate(target)).not.toThrow();
    expect(viewportRows(target)[0]).toBe("baseX");
  } finally {
    wasm.destroy(target);
    wasm.destroy(source);
  }
});

test("snapshot import remains safe across render update, resize, and later live writes", () => {
  const source = wasm.create(8, 2, 1_000_000);
  const target = wasm.create(8, 2, 1_000_000);
  expect(source).toBeGreaterThan(0);
  expect(target).toBeGreaterThan(0);

  try {
    wasm.write(source, "hello");
    wasm.renderUpdate(source);

    const snapshot = exportBinarySnapshot(source);
    expect(wasm.loadBinarySnapshot(target, snapshot)).toBe(true);

    expect(() => wasm.renderUpdate(target)).not.toThrow();
    expect(viewportRows(target)[0]).toBe("hello");

    expect(() => wasm.resize(target, 12, 3)).not.toThrow();
    expect(() => wasm.renderUpdate(target)).not.toThrow();

    expect(() => wasm.write(target, "!")).not.toThrow();
    expect(() => wasm.renderUpdate(target)).not.toThrow();
    expect(viewportRows(target)[0]).toBe("hello!");
  } finally {
    wasm.destroy(target);
    wasm.destroy(source);
  }
});
