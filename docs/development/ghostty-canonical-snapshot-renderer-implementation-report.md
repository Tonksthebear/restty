# Implementation Report: Make Restty the canonical Ghostty snapshot renderer

**Ticket:** `ticket_1786471489_344578`
**Run:** `run_1786471510_664686`
**Step:** Implement (`botster_stack_implement`) — rework after Review `review_1786474466_626198`
**Date:** 2026-08-11
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
**Not applied as ownership charter:** [[botster-terminal-ghostty-playbook]].

**Playbooks/notes applied:**
- [[implementer-playbook]]
- [[botster-implementer-playbook]]
- [[restty is a client renderer not authoritative terminal infrastructure]]
- [[restty live harnesses use inserttext through mounted terminal focus]]
- [[session-process-owns-vt-parser-hub-rpc-snapshots]]
- [[ghostty shadow terminal integration belongs outside botster core]]
- [[restty is vendored into botster by manual build-and-copy workflow not a submodule]]
- [[opaque terminal snapshot bytes do not prove renderable history]]
- Approved plan rev 3: `docs/development/ghostty-canonical-snapshot-renderer-plan.md`

**Not loaded:** [[project-pipelines-playbook]], [[botster runtime teardown lenses]] (`teardown_class_applies: false`).

## Review findings addressed (this rework)

| Finding | Severity | Resolution |
| --- | --- | --- |
| `finding_1786474466_774176` consumer path unproved | high | Built this branch; vendored complete `dist/` into clean botster-web worktree; ran B1 (pass) and B2 (env fail, recorded). Evidence below. |
| `finding_1786474466_395766` A8 partial assertions | high | Exact bold/underline/RED/GREEN cells, exact cursor (7,4), required POST-RESIZE, public-API double import reconnect. |
| `finding_1786474466_491551` OSC RGB shape | medium | `[r,g,b]` tuples + exact OSC 10/11/12 reply bytes in positive control. |
| `finding_1786474466_624338` git diff --check | medium | Stripped trailing whitespace from plan/report; renumbered usage sections. |
| `finding_1786474466_240982` duplicate §10 | low | Plugin host=10, Shader stages=11, xterm=12. |

## Files changed (this ticket)

| Path | Change |
| --- | --- |
| `src/input/index.ts` | `suppressQueryReplies` splits query sink from mouse sink |
| `src/input/types.ts` | Document option |
| `src/runtime/create-runtime.ts` | Wire `suppressQueryReplies: options.readOnly === true` |
| `src/runtime/types.ts` | Document `readOnly` production contract |
| `tests/read-only-query-mute.test.ts` | A7 exact mute + input encode proofs |
| `tests/ghostsnp-conformance.test.ts` | A8 exact matrix proofs |
| `tests/fixtures/ghostsnp/rich-matrix-v1.bin` | Ghostty-pin encode fixture |
| `scripts/ghostsnp-fixture-gen/*` | Native encode tool |
| `docs/usage.md` | Botster mount contract + section numbers |
| `docs/development/*plan*.md` / `*report*.md` | Plan + this report |

## Ownership boundaries preserved

- Restty owns: GHOSTSNP **import**, render, input **encoding**, local conformance.
- Restty does **not** own: terminal truth, PTY query replies under `readOnly`, Hub policy, Ghostty backend package, botster-web product wiring of `readOnly`/`loadBinarySnapshot` (Web ticket).
- No Core/Hub/Web/TUI **source** committed. Web vendor was temporary proof-only in `/tmp` worktree.

## Cross-repo dependencies

| Item | Status |
| --- | --- |
| Web `ticket_1786471490_562794` | depends_on this Restty ticket; owns production `readOnly: true` + GHOSTSNP `loadBinarySnapshot` mount wiring after merge vendor |
| B1/B2 proof this visit | Temporary vendor of Restty `dist` into detached Web worktree (not committed to Web) |

## Deviations from plan

1. **Query mute is filter-only** via `suppressQueryReplies` (not full `sendReply` no-op) so mouse encode stays live.
2. **Implement ran B1/B2** (Review required) even though plan assigned live ownership to Web after merge; B2 failed on hub/session-type UI before Restty terminal assertions (recorded).

## Tests and downstream proof

### A1–A8 focused

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

Expected: **28 pass / 0 fail** (re-run on final commit).

### `git diff --check origin/main...HEAD`

Must be clean after this rework.

### Downstream consumer proof (this Restty commit)

| Field | Value |
| --- | --- |
| Restty commit | see tip of PR branch after this commit |
| Web worktree | detached `87f6b6d` (`/tmp/botster-web-restty-consumer-proof-*`) |
| Vendor | `cp -R dist/. → src/vendor/restty/` including `restty.js`, `internal.js`, all `chunk-*.js`, types |
| Hub binary | `/Users/jasonconigliari/Projects/botster-hub/target/release/botster-hub` |
| Session worker | `/Users/jasonconigliari/Projects/botster-hub/target/release/botster-session-worker` |

**B1** `npm run smoke:mounted-terminal-keyboard`:

```
mounted terminal keyboard and exit-order smoke passed
```

Exit **0**. Proves this Restty build mounts canvas, focuses Restty textarea, and drives keyboard through renderer callbacks (insertText path).

**B2** `BOTSTER_HUB_BIN=… BOTSTER_SESSION_WORKER_BIN=… npm run smoke:live-packaged-protocol`:

```
locator.waitFor: Timeout 30000ms exceeded.
waiting for getByTestId('session-type-form') to be visible
```

Hub event dump includes `core_initialized=false`. Failure occurs in hub/session-type UI before Restty terminal attach assertions. **Not a Restty A* regression.** Residual for Web/Hub environment or Web ticket wiring.

### Production entry points

| Behavior | Wired at |
| --- | --- |
| `readOnly` JS query mute | `src/runtime/create-runtime.ts` → `suppressQueryReplies: options.readOnly === true` |
| `readOnly` WASM drain mute | pre-existing `flushWasmOutputToPty` short-circuit |
| Snapshot API | public `loadBinarySnapshot` → `restty_snapshot_import` GHOSTSNP-only |
| Botster docs | `docs/usage.md` §9 |
| Botster Web mount still needs | `appOptions.readOnly: true` + GHOSTSNP `loadBinarySnapshot` (Web ticket) |

## Unverified behavior / residual risk

- B2 live-Hub terminal snapshot/scrollback/input path not green in this environment (`session-type-form` timeout; `core_initialized=false`).
- Web production mount still does not set `readOnly: true` or call `loadBinarySnapshot` on HEAD `resttyRenderer.ts` — owned by Web consumer ticket after this merge.
- Playground default remains `readOnly: false`.

## Missing vault guidance

1. Dedicated `restty-playbook` routing charter.
2. Atomic: Botster mounts set Restty `readOnly: true`.
3. Shared GHOSTSNP client conformance matrix Restty/Web/TUI.
