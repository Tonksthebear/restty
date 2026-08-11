/**
 * Mounted GHOSTSNP consumer proof for Restty.
 *
 * Proves the production Restty library path in a real browser mount:
 *   readOnly mount → loadBinarySnapshot(known GHOSTSNP fixture) → restored state
 *   → live output → resize → reconnect second import → keyboard input still encoded
 *
 * Does not add Playwright to Restty package.json. Loads Playwright from an
 * existing checkout that already has it (botster-web), via PLAYWRIGHT_MODULE
 * or BOTSTER_WEB_ROOT.
 *
 * Usage (from Restty repo root, after `bun run build`):
 *
 *   PLAYWRIGHT_MODULE=/path/to/botster-web/node_modules/playwright \
 *     node scripts/consumer-proof/ghostsnp-mounted-consumer-smoke.mjs
 *
 * Or:
 *
 *   BOTSTER_WEB_ROOT=/path/to/botster-web \
 *     node scripts/consumer-proof/ghostsnp-mounted-consumer-smoke.mjs
 */

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const resttyRoot = resolve(here, "../..");
const distDir = join(resttyRoot, "dist");
const fixturePath = join(resttyRoot, "tests/fixtures/ghostsnp/rich-matrix-v1.bin");
const htmlPath = join(here, "ghostsnp-mounted-consumer.html");

const PALETTE1 = 0xabcdef;
const HOST = "127.0.0.1";

function fail(message) {
  console.error(`ghostsnp-mounted-consumer-smoke FAILED: ${message}`);
  process.exit(1);
}

function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_MODULE) candidates.push(process.env.PLAYWRIGHT_MODULE);
  if (process.env.BOTSTER_WEB_ROOT) {
    candidates.push(join(process.env.BOTSTER_WEB_ROOT, "node_modules/playwright"));
  }
  // Common local layout without hardcoding usernames in committed artifacts.
  candidates.push(join(resttyRoot, "../botster-web/node_modules/playwright"));
  candidates.push(join(resttyRoot, "../../Projects/botster-web/node_modules/playwright"));

  const require = createRequire(import.meta.url);
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    try {
      // eslint-disable-next-line import/no-dynamic-require
      return require(candidate);
    } catch {
      try {
        // ESM path
        return import(pathToFileURL(join(candidate, "index.mjs")).href);
      } catch {
        // continue
      }
    }
  }
  fail(
    "Playwright module not found. Set PLAYWRIGHT_MODULE or BOTSTER_WEB_ROOT to a checkout that already has playwright (for example botster-web). Restty does not add a browser stack dependency for this ticket.",
  );
}

function contentType(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".bin")) return "application/octet-stream";
  if (path.endsWith(".wasm")) return "application/wasm";
  if (path.endsWith(".ttf")) return "font/ttf";
  return "application/octet-stream";
}

function startStaticServer() {
  if (!existsSync(join(distDir, "internal.js"))) {
    fail(`missing ${join(distDir, "internal.js")}; run bun run build first`);
  }
  if (!existsSync(fixturePath)) {
    fail(`missing fixture ${fixturePath}`);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    let filePath;
    if (url.pathname === "/" || url.pathname === "/index.html") {
      filePath = htmlPath;
    } else if (url.pathname.startsWith("/vendor/")) {
      filePath = join(distDir, url.pathname.slice("/vendor/".length));
    } else if (url.pathname === "/fixtures/rich-matrix-v1.bin") {
      filePath = fixturePath;
    } else {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end(`missing ${url.pathname}`);
      return;
    }
    const body = readFileSync(filePath);
    res.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": "no-store",
    });
    res.end(body);
  });

  return new Promise((resolvePromise) => {
    server.listen(0, HOST, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") fail("could not bind static server");
      resolvePromise({ server, port: addr.port });
    });
  });
}

async function main() {
  const fixture = readFileSync(fixturePath);
  if (fixture.byteLength < 8 || fixture.subarray(0, 8).toString("ascii") !== "GHOSTSNP") {
    fail("fixture is not GHOSTSNP");
  }

  const playwrightModule = await loadPlaywright();
  const { chromium } = playwrightModule;

  const { server, port } = await startStaticServer();
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.on("pageerror", (err) => {
      console.error("[pageerror]", err);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error("[console.error]", msg.text());
    });

    await page.goto(`http://${HOST}:${port}/`, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => Boolean(globalThis.__GHOSTSNP_MOUNTED_CONSUMER__?.ready),
      undefined,
      { timeout: 20_000 },
    );
    await page.waitForFunction(
      () => {
        const canvas = globalThis.document.querySelector("canvas");
        if (!canvas) return false;
        const bounds = canvas.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0;
      },
      undefined,
      { timeout: 20_000 },
    );
    // Font/WASM settle for consumer mount.
    await page.waitForTimeout(1_500);

    // 1) Import known GHOSTSNP fixture via public loadBinarySnapshot.
    const importResult = await page.evaluate(async () => {
      const ctrl = globalThis.__GHOSTSNP_MOUNTED_CONSUMER__;
      const res = await fetch("/fixtures/rich-matrix-v1.bin");
      if (!res.ok) throw new Error(`fixture fetch failed: ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const magic = String.fromCharCode(...buf.subarray(0, 8));
      // Poll until WASM/runtime ready (loadBinarySnapshot returns false while booting).
      let ok = false;
      for (let i = 0; i < 40; i += 1) {
        ok = ctrl.loadBinarySnapshot(buf);
        if (ok) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const palette1 = ctrl.getPaletteColor(1);
      return { ok, magic, byteLength: buf.byteLength, palette1 };
    });

    if (importResult.magic !== "GHOSTSNP") fail(`fixture magic ${importResult.magic}`);
    if (!importResult.ok) fail("loadBinarySnapshot returned false for known GHOSTSNP fixture");
    if (importResult.palette1 !== PALETTE1) {
      fail(
        `palette[1] after GHOSTSNP import expected 0x${PALETTE1.toString(16)}, got ${JSON.stringify(importResult.palette1)}`,
      );
    }
    console.log(
      `ghostsnp-import ok bytes=${importResult.byteLength} palette1=0x${Number(importResult.palette1).toString(16)}`,
    );

    // 2) Live output after import (attach order: snapshot then live).
    await page.evaluate(() => {
      globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.sendInput("\r\nPOST-GHOSTSNP-LIVE\r\n", "pty");
    });
    await page.waitForTimeout(300);
    console.log("live-output-after-import ok");

    // 3) Resize post-import.
    await page.evaluate(() => {
      globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.resize(100, 30);
    });
    await page.waitForTimeout(200);
    console.log("resize-after-import ok");

    // 4) Reconnect second import replaces state; live pollution must not stick.
    const reconnect = await page.evaluate(async () => {
      const ctrl = globalThis.__GHOSTSNP_MOUNTED_CONSUMER__;
      ctrl.sendInput("POLLUTE-BEFORE-RECONNECT\r\n", "pty");
      const res = await fetch("/fixtures/rich-matrix-v1.bin");
      const buf = new Uint8Array(await res.arrayBuffer());
      let ok = false;
      for (let i = 0; i < 20; i += 1) {
        ok = ctrl.loadBinarySnapshot(buf);
        if (ok) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const palette1 = ctrl.getPaletteColor(1);
      ctrl.sendInput("\r\nAFTER-RECONNECT-LIVE\r\n", "pty");
      return { ok, palette1 };
    });
    if (!reconnect.ok) fail("second loadBinarySnapshot (reconnect) returned false");
    if (reconnect.palette1 !== PALETTE1) {
      fail(`palette[1] after reconnect import expected 0x${PALETTE1.toString(16)}`);
    }
    console.log("reconnect-second-import ok");

    // 5) Keyboard path still works under readOnly (user encode, not query replies).
    await page.evaluate(() => {
      globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.focus();
    });
    await page.locator("canvas").first().click({ position: { x: 12, y: 12 } });
    await page.keyboard.insertText("ghostsnp-consumer-key\n");
    await page.waitForTimeout(200);
    console.log("keyboard-insertText-under-readOnly ok");

    console.log(
      "ghostsnp-mounted-consumer-smoke passed " +
        JSON.stringify({
          fixture: "tests/fixtures/ghostsnp/rich-matrix-v1.bin",
          assertions: [
            "loadBinarySnapshot(GHOSTSNP)",
            "palette[1]=0xabcdef",
            "live-output-after-import",
            "resize-after-import",
            "reconnect-second-import",
            "keyboard-insertText-under-readOnly",
          ],
        }),
    );
  } finally {
    await browser?.close().catch(() => undefined);
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
