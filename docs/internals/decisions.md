# Architecture Decisions

## Rendering Mode
- Default: grayscale atlas with hinting.
- Optional: LCD subpixel atlas (toggle).
- No SDF/MSDF path (removed; raster atlas only).

## Ligatures
- Enabled by default.
- Draw shaped glyphs across cell ranges and skip per-cell glyphs in that span.
- Cursor/selection rendered as overlays to avoid breaking ligatures.

## Fonts
- Bundle JetBrains Mono (OFL-1.1).
- Allow local fonts via queryLocalFonts (Chromium only, user gesture).

## WASM Strategy
- Custom Zig wrapper over ghostty-vt Zig API (not C ABI rewrite).
- Avoid relying on current C ABI for Terminal/RenderState.
- Pin trybotster/ghostty @ `eb72ec61304ea256be1d86ed8fa961c84e43ecbd`, Zig `0.16.0`.
- Sole local Ghostty patch: re-export `snapshot` from `src/lib_vt.zig`
  (see `docs/internals/ghostty-lib-vt-patch.md`). Obsolete wasm fork patches
  (style/mouse_shape/quirks) are dropped.
- Binary terminal snapshot: GHOSTSNP / `ghostty-terminal-snapshot-v1`,
  import-only (`decode`/`decodeExact`/`Decoder`), cold cutover, fail closed.
  Decode produces a new Terminal; restty replaces the handle-owned terminal
  and replays continuation. No encode/export path.
- Embed wasm binary into the JS bundle for browser use (no runtime fetch).

## Rendering Backend
- WebGPU primary; WebGL2 fallback.
- Keep shader and buffer layout compatible across backends.
