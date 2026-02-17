import { beforeAll, expect, test } from "bun:test";
import { loadResttyWasm } from "../src/wasm/runtime/restty-wasm";

let wasm: Awaited<ReturnType<typeof loadResttyWasm>>;

beforeAll(async () => {
  wasm = await loadResttyWasm();
});

test(
  "resize with hyperlinks in scrollback does not crash",
  { timeout: 120_000 },
  () => {
    const handle = wasm.create(80, 24, 10_000_000);
    expect(handle).toBeGreaterThan(0);

    for (let i = 0; i < 200; i++) {
      const uri = `https://example.com/item/${i}?session=test123`;
      wasm.write(handle, `\x1b]8;;${uri}\x1b\\Hyperlinked text line ${i}\x1b]8;;\x1b\\\r\n`);
    }

    wasm.resize(handle, 40, 24);
    wasm.resize(handle, 80, 24);
    wasm.resize(handle, 20, 24);
    wasm.resize(handle, 120, 24);

    wasm.destroy(handle);
  },
);

test("resize with hyperlinks and small scrollback", () => {
  const handle = wasm.create(40, 10, 500);
  expect(handle).toBeGreaterThan(0);

  for (let i = 0; i < 100; i++) {
    const uri = `https://example.com/path/${i}`;
    wasm.write(handle, `\x1b]8;;${uri}\x1b\\Link ${i}\x1b]8;;\x1b\\\r\n`);
  }

  wasm.resize(handle, 20, 10);
  wasm.resize(handle, 80, 10);
  wasm.resize(handle, 10, 10);
  wasm.resize(handle, 40, 10);

  wasm.destroy(handle);
});
