import { beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadResttyWasm } from "../src/wasm/runtime/restty-wasm";

let wasm: Awaited<ReturnType<typeof loadResttyWasm>>;

beforeAll(async () => {
  wasm = await loadResttyWasm();
});

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/ghostsnp", name)));
}

function historyFrames(): Uint8Array[] {
  return [0, 1, 2, 3].map((index) =>
    fixture(`incremental-history-page-${index.toString().padStart(3, "0")}-v1.bin`),
  );
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

function scrollbarTotal(handle: number): number {
  const total = wasm.exports.restty_scrollbar_total;
  if (!total) throw new Error("restty_scrollbar_total export is unavailable");
  return total(handle) >>> 0;
}

test("incremental GHOSTSNP paints at READY and prepends every PAGE before FINISH", () => {
  const handle = wasm.create(80, 24, 20_000_000);
  const reader = wasm.createSnapshotReader(handle);
  expect(reader).not.toBeNull();

  try {
    expect(reader!.ready(fixture("incremental-history-ready-v1.bin"))).toBeNull();
    expect(viewportRows(handle).join("\n")).toContain("READY-PAINT");

    let previousTotal = scrollbarTotal(handle);
    for (const page of historyFrames()) {
      expect(reader!.next(page)).toEqual({ status: "page" });
      const nextTotal = scrollbarTotal(handle);
      expect(nextTotal).toBeGreaterThan(previousTotal);
      previousTotal = nextTotal;
    }

    expect(reader!.next(fixture("incremental-history-finish-v1.bin"))).toEqual({
      status: "finish",
    });

    wasm.scrollViewport(handle, -10_000);
    wasm.renderUpdate(handle);
    expect(viewportRows(handle).join("\n")).toContain("HISTORY-LINE-0000");
  } finally {
    wasm.destroy(handle);
  }
});

test("incremental GHOSTSNP requires NO_VALUE for blank-history FINISH", () => {
  const handle = wasm.create(80, 24, 20_000_000);
  const reader = wasm.createSnapshotReader(handle);
  expect(reader).not.toBeNull();

  try {
    expect(reader!.ready(fixture("incremental-blank-ready-v1.bin"))).toBeNull();
    expect(viewportRows(handle).every((row) => row === "")).toBe(true);
    expect(reader!.next(fixture("incremental-blank-finish-v1.bin"))).toEqual({
      status: "finish",
    });
  } finally {
    wasm.destroy(handle);
  }
});

test("incremental GHOSTSNP applies only the latest queued resize after FINISH", () => {
  const handle = wasm.create(80, 24, 20_000_000);
  const reader = wasm.createSnapshotReader(handle);
  expect(reader).not.toBeNull();

  try {
    wasm.resize(handle, 100, 30);
    wasm.resize(handle, 110, 35);
    expect(reader!.ready(fixture("incremental-history-ready-v1.bin"))).toBeNull();
    wasm.resize(handle, 120, 40);
    expect(wasm.getRenderState(handle)).toMatchObject({ cols: 215, rows: 2 });

    for (const page of historyFrames()) {
      expect(reader!.next(page)).toEqual({ status: "page" });
      expect(wasm.getRenderState(handle)).toMatchObject({ cols: 215, rows: 2 });
    }
    expect(reader!.next(fixture("incremental-history-finish-v1.bin"))).toEqual({
      status: "finish",
    });
    expect(wasm.getRenderState(handle)).toMatchObject({ cols: 120, rows: 40 });
  } finally {
    wasm.destroy(handle);
  }
});

test("incremental GHOSTSNP keeps READY after a later history error", () => {
  const handle = wasm.create(80, 24, 20_000_000);
  const reader = wasm.createSnapshotReader(handle);
  expect(reader).not.toBeNull();

  try {
    expect(reader!.ready(fixture("incremental-history-ready-v1.bin"))).toBeNull();
    expect(reader!.next(historyFrames()[0]!)).toEqual({ status: "page" });
    const retainedTotal = scrollbarTotal(handle);
    wasm.resize(handle, 120, 40);

    const corruptPage = historyFrames()[1]!.slice();
    corruptPage[corruptPage.length - 1] ^= 0xff;
    const failure = reader!.next(corruptPage);
    expect(failure.status).toBe("error");

    expect(scrollbarTotal(handle)).toBeGreaterThanOrEqual(retainedTotal);
    expect(wasm.getRenderState(handle)).toMatchObject({ cols: 120, rows: 40 });
    const retainedRows = viewportRows(handle).join("\n");
    expect(retainedRows).toContain("HISTORY-LINE-0999");
    expect(retainedRows).toContain("READY-PAINT");
    wasm.write(handle, "LIVE-AFTER-DEGRADED-HISTORY");
    wasm.renderUpdate(handle);
    expect(viewportRows(handle).join("\n")).toContain("LIVE-AFTER-DEGRADED-HISTORY");
  } finally {
    wasm.destroy(handle);
  }
});
