# GHOSTSNP mounted consumer proof

Proves Restty's production browser mount path for the GHOSTSNP cutover with an
**observable PTY transport** (not sleep-and-print):

1. Mount Restty with `appOptions.readOnly: true` and a recording `ptyTransport`
2. Call public `loadBinarySnapshot` with the committed rich-matrix GHOSTSNP fixture
3. Assert restored `getPaletteColor(1) === 0xabcdef`
4. Live PTY output after import changes known state (`palette[3]`)
5. Explicit `resize(100, 30)` is observed on the PTY transport
6. Second import clears live palette pollution
7. Keyboard `insertText` reaches the PTY sink
8. Host OSC/DA/DSR queries produce zero PTY sink replies under `readOnly`
9. Browser page errors fail the smoke

## Why this is not a Restty Playwright dependency

The Plan forbids adding a Restty browser test stack (Playwright/happy-dom). This
smoke reuses Playwright from an existing Botster Web checkout via
`PLAYWRIGHT_MODULE` or `BOTSTER_WEB_ROOT`.

## Run

```bash
# Restty repo root
bun run build

PLAYWRIGHT_MODULE=/path/to/botster-web/node_modules/playwright \
  node scripts/consumer-proof/ghostsnp-mounted-consumer-smoke.mjs
```

Expected final line:

```
ghostsnp-mounted-consumer-smoke passed {...}
```
