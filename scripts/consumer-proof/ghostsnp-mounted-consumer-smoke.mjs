/**
 * Mounted GHOSTSNP consumer proof for Restty.
 *
 * Proves the production Restty library path in a real browser mount with an
 * observable PTY transport:
 *   readOnly mount → loadBinarySnapshot(GHOSTSNP) → restored state
 *   → live PTY output changes known state
 *   → resize reaches transport with exact dimensions
 *   → second import clears live pollution
 *   → keyboard insertText reaches PTY sink
 *   → query replies stay muted on the sink
 *
 * Does not add Playwright to Restty package.json. Loads Playwright from an
 * existing checkout that already has it (botster-web), via PLAYWRIGHT_MODULE
 * or BOTSTER_WEB_ROOT.
 *
 * Usage (from Restty repo root, after `bun run build`):
 *
 *   PLAYWRIGHT_MODULE=/path/to/botster-web/node_modules/playwright \
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
const POLLUTED_PALETTE1 = 0xfedcba;
const LIVE_PALETTE3 = 0x112233;
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
  candidates.push(join(resttyRoot, "../botster-web/node_modules/playwright"));
  candidates.push(join(resttyRoot, "../../Projects/botster-web/node_modules/playwright"));

  const require = createRequire(import.meta.url);
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    try {
      return require(candidate);
    } catch {
      try {
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

async function importFixture(page) {
  return page.evaluate(async () => {
    const ctrl = globalThis.__GHOSTSNP_MOUNTED_CONSUMER__;
    const res = await fetch("/fixtures/rich-matrix-v1.bin");
    if (!res.ok) throw new Error(`fixture fetch failed: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const magic = String.fromCharCode(...buf.subarray(0, 8));
    let ok = false;
    for (let i = 0; i < 40; i += 1) {
      ok = ctrl.loadBinarySnapshot(buf);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    return {
      ok,
      magic,
      byteLength: buf.byteLength,
      palette1: ctrl.getPaletteColor(1),
    };
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
  const pageErrors = [];
  const consoleErrors = [];
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.on("pageerror", (err) => {
      pageErrors.push(String(err?.message ?? err));
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
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

    const connected = await page.evaluate(
      () => globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.getTransportLog().connected,
    );
    if (!connected) fail("observable PTY transport is not connected after mount");

    // Clear connect-time autoResize traffic before explicit assertions.
    await page.evaluate(() => globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.clearTransportLog());

    // 1) Import known GHOSTSNP fixture via public loadBinarySnapshot.
    const importResult = await importFixture(page);
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

    // 2) Live host→terminal output after import must change known WASM state.
    //    OSC 4;3 sets palette index 3 to a distinctive RGB.
    const live = await page.evaluate(async () => {
      const ctrl = globalThis.__GHOSTSNP_MOUNTED_CONSUMER__;
      const before = ctrl.getPaletteColor(3);
      ctrl.sendPtyOutput("\u001b]4;3;rgb:11/22/33\u0007");
      // Allow WASM write + palette apply.
      await new Promise((r) => setTimeout(r, 100));
      const after = ctrl.getPaletteColor(3);
      return { before, after };
    });
    if (live.after !== LIVE_PALETTE3) {
      fail(
        `live PTY output did not change palette[3]: before=${JSON.stringify(live.before)} after=${JSON.stringify(live.after)} expected=0x${LIVE_PALETTE3.toString(16)}`,
      );
    }
    console.log(`live-output-after-import ok palette3=0x${LIVE_PALETTE3.toString(16)}`);

    // 3) Resize post-import must reach the observable PTY transport.
    await page.evaluate(() => globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.clearTransportLog());
    await page.evaluate(() => {
      globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.resize(100, 30);
    });
    await page.waitForTimeout(100);
    const resizeLog = await page.evaluate(
      () => globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.getTransportLog().resizes,
    );
    const hit = resizeLog.find((r) => r.cols === 100 && r.rows === 30);
    if (!hit) {
      fail(`resize(100,30) not observed on PTY transport: ${JSON.stringify(resizeLog)}`);
    }
    console.log("resize-after-import ok transport={cols:100,rows:30}");

    // 4) Reconnect: pollute palette[1], second import must restore fixture value.
    const reconnect = await page.evaluate(async () => {
      const ctrl = globalThis.__GHOSTSNP_MOUNTED_CONSUMER__;
      // Pollute after first import (distinct from fixture 0xabcdef).
      ctrl.sendPtyOutput("\u001b]4;1;rgb:fe/dc/ba\u0007");
      await new Promise((r) => setTimeout(r, 100));
      const polluted = ctrl.getPaletteColor(1);
      const res = await fetch("/fixtures/rich-matrix-v1.bin");
      const buf = new Uint8Array(await res.arrayBuffer());
      let ok = false;
      for (let i = 0; i < 20; i += 1) {
        ok = ctrl.loadBinarySnapshot(buf);
        if (ok) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const restored = ctrl.getPaletteColor(1);
      // Live path still works on the new handle after reconnect.
      ctrl.sendPtyOutput("\u001b]4;3;rgb:11/22/33\u0007");
      await new Promise((r) => setTimeout(r, 100));
      const palette3After = ctrl.getPaletteColor(3);
      return { ok, polluted, restored, palette3After };
    });
    if (reconnect.polluted !== POLLUTED_PALETTE1) {
      fail(
        `pollution setup failed: palette[1]=${JSON.stringify(reconnect.polluted)} expected=0x${POLLUTED_PALETTE1.toString(16)}`,
      );
    }
    if (!reconnect.ok) fail("second loadBinarySnapshot (reconnect) returned false");
    if (reconnect.restored !== PALETTE1) {
      fail(
        `second import did not clear pollution: palette[1]=${JSON.stringify(reconnect.restored)} expected=0x${PALETTE1.toString(16)}`,
      );
    }
    if (reconnect.palette3After !== LIVE_PALETTE3) {
      fail("live output on post-reconnect handle did not apply");
    }
    console.log("reconnect-second-import ok pollution-cleared palette1 restored");

    // 5) Keyboard path under readOnly must emit to the PTY sink.
    await page.evaluate(() => globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.clearTransportLog());
    await page.evaluate(() => {
      globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.focus();
    });
    await page.locator("canvas").first().click({ position: { x: 12, y: 12 } });
    const probe = "ghostsnp-consumer-key";
    await page.keyboard.insertText(`${probe}\n`);
    await page.waitForTimeout(300);
    const inputs = await page.evaluate(
      () => globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.getTransportLog().inputs,
    );
    const joined = inputs.join("");
    if (!joined.includes(probe)) {
      fail(`keyboard insertText did not reach PTY sink; inputs=${JSON.stringify(inputs)}`);
    }
    console.log("keyboard-insertText-under-readOnly ok pty-sink-observed");

    // 6) Query replies stay muted: host OSC/DA/DSR must not produce sink traffic.
    await page.evaluate(() => globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.clearTransportLog());
    await page.evaluate(() => {
      const ctrl = globalThis.__GHOSTSNP_MOUNTED_CONSUMER__;
      // Host stream containing queries (OutputFilter would answer when not readOnly).
      ctrl.injectHostStream("\u001b]10;?\u0007\u001b[c\u001b[6n");
    });
    await page.waitForTimeout(100);
    const afterQueries = await page.evaluate(
      () => globalThis.__GHOSTSNP_MOUNTED_CONSUMER__.getTransportLog().inputs,
    );
    if (afterQueries.length !== 0) {
      fail(`readOnly query mute failed; sink received ${JSON.stringify(afterQueries)}`);
    }
    console.log("readOnly-query-mute ok zero-pty-sink-replies");

    if (pageErrors.length) {
      fail(`browser page errors: ${JSON.stringify(pageErrors)}`);
    }
    // Font CDN noise is not a product failure; only fail on Restty/runtime console errors.
    const productConsoleErrors = consoleErrors.filter(
      (line) =>
        !/cdn\.jsdelivr|Failed to load resource|net::ERR|font/i.test(line) &&
        !/Download the React DevTools/i.test(line),
    );
    if (productConsoleErrors.length) {
      fail(`browser console errors: ${JSON.stringify(productConsoleErrors)}`);
    }

    console.log(
      "ghostsnp-mounted-consumer-smoke passed " +
        JSON.stringify({
          fixture: "tests/fixtures/ghostsnp/rich-matrix-v1.bin",
          assertions: [
            "loadBinarySnapshot(GHOSTSNP)",
            "palette[1]=0xabcdef",
            "live-pty-output-changes-palette[3]",
            "resize(100,30)-observed-on-pty-transport",
            "reconnect-clears-palette-pollution",
            "keyboard-insertText-reaches-pty-sink",
            "readOnly-query-mute-zero-sink-replies",
            "no-browser-page-errors",
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
