# Ghostty `lib_vt.zig` local patch

Restty pins **trybotster/ghostty** at the pristine SHA:

`2a465b03e217d32350744944453e835816267da6`

The submodule **gitlink** records that SHA only. Pin includes trybotster SEGV fix commits; sole restty worktree patch remains
are required for clone/CI.

## Sole intentional patch (restty-owned)

File applied to the submodule worktree (never committed into ghostty-org):

- Patch: `patches/ghostty-lib-vt-snapshot-reexport.patch`
- Target: `reference/ghostty/src/lib_vt.zig`

```zig
pub const snapshot = terminal.snapshot;
```

(plus a short comment block above the re-export)

This is the only source change relative to pinned Ghostty at the pin SHA.
No Ghostty PR is filed unless a human requests one. The same one-liner is
what would be proposed upstream if a human later asks for a PR.

## Apply steps

1. Init/update submodule to the pin:
   ```bash
   # After .gitmodules URL retarget (e.g. Tonksthebear → ghostty-org), existing
   # checkouts may still have the old URL in .git/config until you sync:
   git submodule sync --recursive
   git submodule update --init reference/ghostty
   # gitlink must be 2a465b03e217d32350744944453e835816267da6
   ```

2. Apply the restty-owned patch (idempotent):
   ```bash
   bun run scripts/apply-ghostty-patch.ts
   ```

3. Build wasm (applies the patch automatically first):
   ```bash
   bun run build:wasm
   ```

`scripts/build-wasm.ts` calls `scripts/apply-ghostty-patch.ts` before
`zig build`. After apply, the submodule worktree is dirty by design; do not
commit that dirt into the submodule gitlink.

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

## Submodule packaging

- **Gitlink:** pristine `2a465b03e…` (fetchable from ghostty-org)
- **Patch:** restty-owned, applied at build time
- Fresh clone path: `submodule update --init` → `bun run build:wasm` (auto-apply)
