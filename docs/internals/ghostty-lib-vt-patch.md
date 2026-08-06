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

## Pre-existing residual test failures (not regressions from this pin)

Base branch before the bump was already red on Kitty graphics and search
(`c7932be` measured ~154 pass / 13 fail). This bump is **160 pass / 9 fail** —
a strict subset of base failures; zero new failures introduced.

Upstream `terminal/build_options.zig` disables `kitty_graphics` on
`wasm32-freestanding` (timestamp requirement). That matches pre-existing
Kitty graphics test red on base — not a regression from Phase 2a. Re-enabling
would need a second approved local patch or an upstream change (sole-patch
rule holds for Phase 2a). Search ABI re-port is a follow-up, not a snapshot gate.

`std.Io` freestanding: usable via `std.Io.failing` (same as upstream C
libghostty-vt wrappers). No improvised shim.

## Submodule packaging (BLOCKED until orchestrator rules)

Local submodule tip `dff420f3` = pin + sole patch exists only as a local
object (not on ghostty-org). Fresh `git submodule update --init` cannot
fetch it. Recommended fix (awaiting orchestrator): pin gitlink to pristine
`22d13172…` and apply a restty-owned `.patch` at build time.
