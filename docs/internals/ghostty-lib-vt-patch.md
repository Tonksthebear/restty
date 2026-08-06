# Ghostty `lib_vt.zig` local patch

Restty pins **ghostty-org/ghostty** at:

`22d13172cde98a0a4dda05d3d6a3fcb0dd8ed018`

## Sole intentional patch

File: `reference/ghostty/src/lib_vt.zig`

Re-export the binary snapshot package on the public `ghostty-vt` Zig module:

```zig
pub const snapshot = terminal.snapshot;
```

This is the only source change relative to pristine upstream at the pin SHA.
No Ghostty PR is filed unless a human requests one.

## Why

Upstream keeps `terminal.snapshot` off the `lib_vt` public surface.
Restty's WASM core imports `ghostty-vt` and needs `decode` / `decodeExact` /
`Decoder` for cold-cutover GHOSTSNP import.

## Obsolete fork patches (removed)

The Tonksthebear wasm fork patches are no longer applied:

- `terminal/style.zig` BoldColor stub for `.lib`
- `terminal/mouse_shape.zig` build_config skip for `.lib`
- `quirks.zig` font import avoidance on wasm

Upstream lib-vt at this pin does not need them.

## Wire format

- Magic: `GHOSTSNP`
- Format label: `ghostty-terminal-snapshot-v1`
- Import-only in restty (no encode path)
- Fail closed on `InvalidMagic` / `UnsupportedVersion` / other decode errors

## Pin consequences (not patched without orchestrator approval)

Upstream `terminal/build_options.zig` **disables `kitty_graphics` on
`wasm32-freestanding`** (timestamp requirement). Restty therefore loses
Kitty graphics placements/responses under this pin until a second approved
local patch or upstream change. Primary Phase 2a proof is GHOSTSNP import.

`std.Io` freestanding: usable via `std.Io.failing` (same as upstream C
libghostty-vt wrappers). No improvised shim.
