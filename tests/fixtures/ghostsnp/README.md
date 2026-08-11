# GHOSTSNP conformance fixtures

Committed binary snapshots for Restty A8 (`tests/ghostsnp-conformance.test.ts`).

| File | Source | Purpose |
| --- | --- | --- |
| `rich-matrix-v1.bin` | Ghostty-pin encode via `scripts/ghostsnp-fixture-gen` | Scrollback, SGR attrs, palette, cursor, Kitty keyboard flags, mouse 1000/1006 |

## Regenerate

From the repository root (requires Zig `0.16.0`, initialized `reference/ghostty`, and the restty-owned lib_vt patch):

```bash
bun run scripts/apply-ghostty-patch.ts
cd scripts/ghostsnp-fixture-gen
zig build run -- ../../tests/fixtures/ghostsnp
```

Do **not** produce fixtures via freestanding WASM export (Restty is import-only).
Upstream smoke goldens under `reference/ghostty/src/terminal/snapshot/testdata/`
(e.g. `complete-v1.hex`) remain import smoke only; they are not full matrix fixtures.
