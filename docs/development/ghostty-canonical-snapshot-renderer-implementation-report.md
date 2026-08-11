# Implementation Report: Make Restty the canonical Ghostty snapshot renderer

**Ticket:** `ticket_1786471489_344578`  
**Run:** `run_1786471510_664686`  
**Step:** Implement (`botster_stack_implement`)  
**Date:** 2026-08-11  
**Commit:** `68d8232823983857b581c6e80e98da5f8189431e`  
**PR:** https://github.com/trybotster/restty/pull/4  

## Target repository and target_id

| Field | Value |
| --- | --- |
| target_repository | `restty` (`trybotster/restty`) |
| target_id | `tgt_9a348ca759594fdeaed2894c1f70a4c7` |
| base | `origin/main` @ `79f633189adc73b8cf5ed4f7c7be1be4a7da35bf` |
| branch | `project-pipelines/ticket_1786471489_344578` |

## Repository playbook and other playbooks/notes applied

**repository_playbook:** temporary via [[restty is a client renderer not authoritative terminal infrastructure]] (human Q `question_1786471976_515398`).  
**Not applied as ownership charter:** [[botster-terminal-ghostty-playbook]] (excludes Restty browser rendering).

**Playbooks/notes applied:**
- [[implementer-playbook]]
- [[botster-implementer-playbook]]
- [[restty is a client renderer not authoritative terminal infrastructure]]
- [[restty live harnesses use inserttext through mounted terminal focus]] (downstream Web proof overlay only; no Restty browser stack)
- [[session-process-owns-vt-parser-hub-rpc-snapshots]]
- [[ghostty shadow terminal integration belongs outside botster core]]
- [[restty is vendored into botster by manual build-and-copy workflow not a submodule]]
- [[opaque terminal snapshot bytes do not prove renderable history]]
- Approved plan: `docs/development/ghostty-canonical-snapshot-renderer-plan.md` (rev 3)

**Not loaded:** [[project-pipelines-playbook]] (no package/plugin paths), [[botster runtime teardown lenses]] (`teardown_class_applies: false`).

## Files changed

| Path | Change |
| --- | --- |
| `src/input/index.ts` | Split query-reply sink from mouse/input sink when `suppressQueryReplies` |
| `src/input/types.ts` | Document `suppressQueryReplies` |
| `src/runtime/create-runtime.ts` | Wire `suppressQueryReplies: options.readOnly === true` |
| `src/runtime/types.ts` | Document Botster `readOnly` production contract |
| `tests/read-only-query-mute.test.ts` | A7: query mute + mouse/key still live + WASM drain mute |
| `tests/ghostsnp-conformance.test.ts` | A8: full matrix against committed fixture |
| `tests/fixtures/ghostsnp/rich-matrix-v1.bin` | Ghostty-pin encoded rich fixture |
| `tests/fixtures/ghostsnp/README.md` | Fixture provenance + regenerate instructions |
| `scripts/ghostsnp-fixture-gen/*` | Native encode tool (not freestanding WASM) |
| `docs/usage.md` | Botster mount contract §9 (`readOnly` + `loadBinarySnapshot`) |
| `docs/development/ghostty-canonical-snapshot-renderer-plan.md` | Approved plan (committed) |
| `.gitignore` / `.oxlintrc.json` | Ignore fixture-gen Zig package cache |

## Ownership boundaries preserved

- Restty owns: GHOSTSNP **import**, render, input **encoding**, renderer lifecycle, local conformance.
- Restty does **not** own: terminal truth, PTY query replies (muted under `readOnly`), Hub policy, Ghostty backend package, live-Hub packaging.
- No Core/Hub/Web/TUI code edited.

## Cross-repo dependencies / separately routed work

| Item | Status |
| --- | --- |
| Web consumer `ticket_1786471490_562794` | depends_on this ticket (`dependency_1786471501_538276`); owns B1/B2 after vendor of this merge `dist/` |
| B1 `smoke:mounted-terminal-keyboard` | Not run here (Web ownership) |
| B2 `smoke:live-packaged-protocol` | Not run here (Web ownership) |
| Core fixture goldens | Not required; Restty host encode tool produced `rich-matrix-v1.bin` from Ghostty pin |

## Deviations from plan

1. **Query mute is filter-only, not full `sendReply` no-op.**  
   Plan diagram suggested `sendReply: readOnly ? () => {} : …`. Mouse reports also use `sendReply`, so a full no-op would break A7’s “mouse encode still emits” requirement. Implemented `suppressQueryReplies` so OutputFilter is muted while MouseController keeps the live PTY sink. Production entry: `create-runtime.ts` sets `suppressQueryReplies: options.readOnly === true`.

No scope expansion beyond that refinement.

## Tests and downstream proof run

### A1–A8 focused (must be green) — **28 pass / 0 fail**

```bash
bun test \
  tests/restty-wasm-binary-snapshot.test.ts \
  tests/restty-wasm-snapshot-live-output.test.ts \
  tests/runtime-app-api-binary-snapshot.test.ts \
  tests/runtime-app-api-binary-snapshot-integration.test.ts \
  tests/snapshot-import-mode-rehydrate.test.ts \
  tests/mouse-rehydrate-tracking-bits.test.ts \
  tests/read-only-query-mute.test.ts \
  tests/ghostsnp-conformance.test.ts
```

### `bun run test:ci` residual

| Kind | Plan baseline (`79f633189`) | After change |
| --- | --- | --- |
| pass | 170 | 179 (+9 new A7/A8 tests) |
| named fails | 7 kitty/search residuals | same 7 names |
| file errors | 2 (`hyperlink-resize`, `max-scrollback` `test() expects a function`) | same 2 |

Named fail residuals (unchanged):
- kitty graphics transmit+display (rgb)
- kitty graphics transmit+display (png)
- rewritten APC is accepted by kitty graphics parser
- snacks-style file-medium + unicode placeholders produce virtual placements
- wasm search exposes total matches and selected viewport spans
- wasm search clear resets status and viewport highlights
- kitty graphics query returns OK

Note: bun summary sometimes reports `9 fail` including the 2 definition errors as fails; exact residual **names** match the plan table.

### Lint / format

- Changed source/test files: **0 lint errors**
- Pre-existing repo lint: 5 errors (control-regex in older tests, unused `clamp`, this-alias) — present on base; not introduced by this ticket
- `bun run format:check`: pass on src

### Downstream live (Web) — **not run**

Owned by Web ticket after vendoring this commit’s `dist/`.

## Production entry point proof

| Behavior | Wired at |
| --- | --- |
| `readOnly` JS query mute | `src/runtime/create-runtime.ts` → `createInputHandler({ suppressQueryReplies: options.readOnly === true })` |
| `readOnly` WASM drain mute | pre-existing `createRuntimeAppApi` `flushWasmOutputToPty` short-circuit |
| Snapshot API | pre-existing public `loadBinarySnapshot` → `restty_snapshot_import` GHOSTSNP only |
| Botster docs | `docs/usage.md` §9 |

## Unverified behavior / residual risk

- Live mounted browser path (B1/B2) not executed in this Restty worktree.
- Web must set `appOptions.readOnly: true` and call `loadBinarySnapshot` with GHOSTSNP bytes after vendor.
- Fixture generator depends on patched `reference/ghostty` at build time; committed `.bin` is the durable artifact.
- Playground default remains `readOnly: false` (sole-PTY query replies still live by design).

## Missing vault guidance discovered

1. Dedicated `restty-playbook` routing charter still missing (human-approved temporary charter used).
2. Convention note: Botster mounts should set Restty `readOnly: true` (documented in usage; not yet a vault atomic).
3. Shared GHOSTSNP client conformance matrix across Restty/Web/TUI still absent as vault note.
