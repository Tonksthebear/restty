# Ghostty `lib_vt.zig` local patch

Restty pins **trybotster/ghostty** at the approved merge SHA:

`eb72ec61304ea256be1d86ed8fa961c84e43ecbd`

The submodule **gitlink** records that SHA only. The pin includes the trybotster
logging and page-pressure fixes. The Restty worktree patch remains required for
clone and CI builds.

## Sole intentional patch (restty-owned)

The build applies this file to the submodule worktree. The patch is not committed
into trybotster/ghostty.

- Patch: `patches/ghostty-lib-vt-snapshot-reexport.patch`
- Target: `reference/ghostty/src/lib_vt.zig`

```zig
pub const snapshot = terminal.snapshot;
```

(plus a short comment block above the re-export)

This is the only source change relative to the pinned Ghostty commit. Restty does
not publish this patch outside the trybotster organization.

## Apply steps

1. Init/update submodule to the pin:
   ```bash
   # Existing checkouts can retain an old URL in .git/config until this sync:
   git submodule sync --recursive
   git submodule update --init reference/ghostty
   # gitlink must be eb72ec61304ea256be1d86ed8fa961c84e43ecbd
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

The prior Wasm fork patches are no longer applied:

- `terminal/style.zig` BoldColor stub for `.lib`
- `terminal/mouse_shape.zig` build_config skip for `.lib`
- `quirks.zig` font import avoidance on wasm

Upstream lib-vt at this pin does not need them.

## Wire format

- Magic: `GHOSTSNP`
- Format label: `ghostty-terminal-snapshot-v1`
- Import-only in restty (no encode path)
- Fail closed on `InvalidMagic` / `UnsupportedVersion` / other decode errors

## Wasm API compatibility

The approved pin keeps the Zig module API that Restty uses. Restty does not call
Ghostty's removed typed Wasm allocation exports. Restty owns `restty_alloc` and
`restty_free`, and the generated Wasm exports those functions.

Freestanding `std.Io` uses `std.Io.failing`. This matches the Ghostty lib-vt
wrapper pattern.

## Submodule packaging

- **Gitlink:** approved `eb72ec613…` (fetchable from trybotster/ghostty)
- **Patch:** restty-owned, applied at build time
- Fresh clone path: `submodule update --init` → `bun run build:wasm` (auto-apply)
