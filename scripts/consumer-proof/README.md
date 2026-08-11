# GHOSTSNP mounted consumer proof

Proves Restty's production browser mount path for the GHOSTSNP cutover:

1. Mount Restty with `appOptions.readOnly: true`
2. Call public `loadBinarySnapshot` with the committed rich-matrix GHOSTSNP fixture
3. Assert restored palette/state
4. Live write after import, resize, reconnect second import
5. Keyboard `insertText` still works under `readOnly`

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
