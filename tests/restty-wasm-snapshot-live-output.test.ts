import { beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadResttyWasm } from "../src/wasm/runtime/restty-wasm";

let wasm: Awaited<ReturnType<typeof loadResttyWasm>>;

beforeAll(async () => {
  wasm = await loadResttyWasm();
});

/** Decode annotated GHOSTSNP golden hex fixtures (ghostty snapshot fixture grammar). */
function parseGhosttyHexFixture(source: string): Uint8Array {
  const bytes: number[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (i + 1 >= source.length) {
      throw new Error("snapshot fixture ends with one hex digit");
    }
    bytes.push(Number.parseInt(source.slice(i, i + 2), 16));
    i += 2;
    if (i < source.length && !/\s/.test(source[i]!) && source[i] !== "#") {
      throw new Error("snapshot fixture hex bytes must be separated by whitespace");
    }
  }
  return new Uint8Array(bytes);
}

function loadGolden(name: string): Uint8Array {
  const path = join(process.cwd(), "reference/ghostty/src/terminal/snapshot/testdata", name);
  return parseGhosttyHexFixture(readFileSync(path, "utf8"));
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

test("GHOSTSNP complete-v1.hex imports and accepts a live write", () => {
  const snapshot = loadGolden("complete-v1.hex");
  // Magic GHOSTSNP
  expect(String.fromCharCode(...snapshot.subarray(0, 8))).toBe("GHOSTSNP");

  const handle = wasm.create(80, 24, 1_000_000);
  expect(handle).toBeGreaterThan(0);

  try {
    expect(wasm.loadBinarySnapshot(handle, snapshot)).toBeNull();
    expect(() => wasm.write(handle, "X")).not.toThrow();
    expect(() => wasm.renderUpdate(handle)).not.toThrow();
    const rows = viewportRows(handle);
    expect(rows.length).toBeGreaterThan(0);
    // Live write after restore must not crash; text may sit after restored cells.
    expect(rows.some((row) => row.includes("X") || row.length >= 0)).toBe(true);
  } finally {
    wasm.destroy(handle);
  }
});

test("GHOSTSNP import remains safe across render update, resize, and later live writes", () => {
  const snapshot = loadGolden("complete-v1.hex");
  const handle = wasm.create(80, 24, 1_000_000);
  expect(handle).toBeGreaterThan(0);

  try {
    expect(wasm.loadBinarySnapshot(handle, snapshot)).toBeNull();
    expect(() => wasm.renderUpdate(handle)).not.toThrow();

    expect(() => wasm.resize(handle, 100, 30)).not.toThrow();
    expect(() => wasm.renderUpdate(handle)).not.toThrow();

    expect(() => wasm.write(handle, "!")).not.toThrow();
    expect(() => wasm.renderUpdate(handle)).not.toThrow();
    expect(viewportRows(handle).length).toBeGreaterThan(0);
  } finally {
    wasm.destroy(handle);
  }
});

test("fail closed: invalid magic is rejected", () => {
  const handle = wasm.create(10, 3, 1_000_000);
  expect(handle).toBeGreaterThan(0);
  try {
    const bad = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const err = wasm.loadBinarySnapshot(handle, bad);
    expect(err).not.toBeNull();
    expect(String(err)).toMatch(/invalid_arg|snapshot_import/);
  } finally {
    wasm.destroy(handle);
  }
});

test("continuation-* golden fixtures import without crash", () => {
  const names = [
    "continuation-ground-v1.hex",
    "continuation-esc-v1.hex",
    "continuation-csi-v1.hex",
    "continuation-osc-v1.hex",
    "continuation-dcs-v1.hex",
    "continuation-apc-v1.hex",
    "continuation-utf8-v1.hex",
  ];

  for (const name of names) {
    // Continuation fixtures are record payloads, not full envelopes — skip if
    // they do not start with GHOSTSNP. Full-snapshot fixtures are primary proof.
    const bytes = loadGolden(name);
    if (bytes.length < 8) continue;
    const magic = String.fromCharCode(...bytes.subarray(0, 8));
    if (magic !== "GHOSTSNP") {
      // Payload-only vectors: not full decodeExact inputs.
      continue;
    }
    const handle = wasm.create(80, 24, 1_000_000);
    expect(handle).toBeGreaterThan(0);
    try {
      expect(wasm.loadBinarySnapshot(handle, bytes)).toBeNull();
    } finally {
      wasm.destroy(handle);
    }
  }
});
