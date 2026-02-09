# Playground and Testing

Hosted demo: `https://restty.pages.dev/`

## Quick Start (Bun)
1. Start local playground stack:
   - `bun run playground`
   - Starts PTY websocket server (`ws://localhost:8787/pty`) and playground dev server (`http://localhost:5173`).
2. Open the URL shown in the console.

Run components separately when needed:

- `bun run pty`

Static-file-only option:

- `bun run build:assets`
- `bun run playground:static`

WebContainer mode note:

- In-browser WebContainer mode seeds `/demo.js`, `/test.js`, and related demo scripts automatically.

Cloudflare Pages static deploy:

1. Run `bun run build:assets`
2. Deploy `playground/public/` as the output directory.
3. Keep `playground/public/_headers` so COOP/COEP headers are applied (required for WebContainer mode).

## Build the WASM module
From `wasm/`:
- `zig build`
- `cp zig-out/bin/restty.wasm ../playground/public/restty.wasm`

This installs `restty.wasm` into `playground/public/` so the playground can load it.

Requires Zig 0.15.2+ (matches Ghostty's minimum).

If you need to refresh the embedded library wasm blob (`src/wasm/embedded.ts`):

- `bun run playground/scripts/embed-wasm.ts`

## Fetch default font
From repo root:
- `bun run playground/fetch-fonts.ts`

This downloads:

- `JetBrainsMono-Regular.ttf`
- `SymbolsNerdFontMono-Regular.ttf`
- `OpenMoji-black-glyf.ttf`

## What It Tests
- WebGPU availability and device initialization.
- WebGL2 fallback (if WebGPU is unavailable).
- Resize/DPR handling.
- Animation loop stability.
- Text shaping + rasterized atlas rendering (foreground/background/selection/cursor).

## Notes
- WebGPU requires a modern Chromium/Firefox build with WebGPU enabled.
- WebGL2 is the fallback path for older browsers.
- This harness is used as the fastest integration loop for WASM + renderer + input.

## Next Integration Steps
- Validate the new render ABI buffers against production WASM output.
- Improve underline styles (dotted/dashed/curly) and wide-glyph handling.
- Add a font selector plus explicit "Use local fonts" affordance.
