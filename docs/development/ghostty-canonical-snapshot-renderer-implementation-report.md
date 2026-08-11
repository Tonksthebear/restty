# Implementation Report: Make Restty the canonical Ghostty snapshot renderer

**Ticket:** `ticket_1786471489_344578`
**Run:** `run_1786471510_664686`
**Step:** Implement (`botster_stack_implement`) — rework after Review `review_1786475356_881646`
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
- Approved plan rev 3

**Not loaded:** [[project-pipelines-playbook]], [[botster runtime teardown lenses]] (`teardown_class_applies: false`).

## Review findings addressed (this rework)

| Finding | Severity | Resolution |
| --- | --- | --- |
| `finding_1786474466_774176` consumer path unproved | high | Vendored this Restty `dist` into clean botster-web worktree; B1 exit 0; B2 exit 0 with attach chronology snapshot→attached→terminal_output. Proof-only Web patch set `appOptions.readOnly: true` (permanent Web wiring remains Web ticket). |
| `finding_1786475356_757657` local absolute paths in report | medium | Path-neutral labels only; no host usernames or absolute filesystem paths. |
| `finding_1786475356_291414` generator untracked outputs | medium | `.gitignore` covers `scripts/ghostsnp-fixture-gen/{.zig-cache,zig-cache,zig-out,zig-pkg}/`. |

Prior findings from `review_1786474466` (A8 exactness, OSC tuples, diff --check, section numbers) remain resolved on branch.

## Files changed

Restty product + gates + docs as previously landed, plus this visit:

| Path | Change |
| --- | --- |
| `.gitignore` | Ignore fixture-gen Zig caches/packages |
| `docs/development/*report*.md` | Consumer proof + path-neutral evidence |

Product code (already on branch):

- `src/input/index.ts`, `src/input/types.ts` — `suppressQueryReplies`
- `src/runtime/create-runtime.ts`, `src/runtime/types.ts` — `readOnly` wiring/docs
- `tests/read-only-query-mute.test.ts`, `tests/ghostsnp-conformance.test.ts`
- `tests/fixtures/ghostsnp/*`, `scripts/ghostsnp-fixture-gen/*`
- `docs/usage.md` Botster mount contract

## Ownership boundaries preserved

- Restty owns GHOSTSNP import/render/input encode/local conformance.
- Temporary Web proof worktree only (not committed): vendor Restty `dist` + proof-only `readOnly: true` patch.
- Permanent Web mount wiring (`readOnly` + GHOSTSNP `loadBinarySnapshot` on HEAD) remains Web ticket `ticket_1786471490_562794`.

## Cross-repo dependencies

| Item | Status |
| --- | --- |
| Web `ticket_1786471490_562794` | depends_on this Restty ticket; owns durable production mount options after merge vendor |
| Hub / session-worker | Used only as B2 harness binaries (not Restty code) |

## Deviations from plan

1. `suppressQueryReplies` mutes OutputFilter only (mouse sink stays live).
2. Implement ran B1/B2 with temporary Web proof worktree (Review required live consumer proof beyond plan's post-merge Web ownership).
3. Proof-only Web `readOnly: true` patch for smokes; permanent Web change remains Web ticket.

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

**28 pass / 0 fail.**

### Hygiene

- `git diff --check origin/main...HEAD` → clean
- Generator ignore: `git check-ignore` hits `.zig-cache` and `zig-pkg`

### Downstream consumer proof

| Field | Value |
| --- | --- |
| Restty commit | tip of PR branch (this report's commit) |
| Restty artifact | `bun run build` → full `dist/` (`restty.js`, `internal.js`, all `chunk-*.js`, types) |
| Web checkout | detached `87f6b6d` clean worktree (temporary) |
| Vendor | complete `dist/` copy into `src/vendor/restty/` |
| Proof-only Web patch | `appOptions.readOnly: true` on production `ResttyTerminalRenderer` mount |
| Hub binary | release `botster-hub` rebuilt at hub `0ee42e9` (path-neutral label: hub-release) |
| Session worker | release `botster-session-worker` from core pin used by hub (path-neutral: session-worker-release) |

**B1** `npm run smoke:mounted-terminal-keyboard`

```
mounted terminal keyboard and exit-order smoke passed
```

Exit **0**. Mounts canvas, focuses Restty textarea, insertText through renderer callbacks, with `readOnly: true` on the production mount path.

**B2** `BOTSTER_HUB_BIN=<hub-release> BOTSTER_SESSION_WORKER_BIN=<session-worker-release> npm run smoke:live-packaged-protocol`

```
live packaged protocol harness passed (webrtc)
```

Exit **0**. Attach chronology (cycles 0–2):

```
["attach_state:attaching","snapshot","attach_state:attached","terminal_output"]
```

Hub identity: protocol_version=6, conformance_fixture_revision=33. Terminal snapshots present (base64 payloads); post-attach live output and read_screen assembly observed.

### Production entry points

| Behavior | Wired at |
| --- | --- |
| `readOnly` JS query mute | `create-runtime.ts` → `suppressQueryReplies: options.readOnly === true` |
| `readOnly` WASM drain mute | pre-existing `flushWasmOutputToPty` short-circuit |
| Snapshot API | public `loadBinarySnapshot` → GHOSTSNP-only import |
| Botster docs | `docs/usage.md` §9 |
| Live consumer with this Restty dist | B1+B2 above (temporary vendor + proof `readOnly`) |

## Unverified behavior / residual risk

- Permanent Web HEAD still lacks committed `readOnly: true` and GHOSTSNP `loadBinarySnapshot` wiring until Web ticket lands after Restty merge vendor.
- Live Hub snapshot bytes observed by B2 are base64 terminal snapshots; wire format cutover to exclusive GHOSTSNP from Core is Core/Hub/Web project work beyond Restty-local import proof.
- `test:ci` residual named fails (kitty graphics ×4, wasm search ×2, kitty query) and 2 definition errors remain pre-existing baseline.

## Missing vault guidance

1. Dedicated `restty-playbook` routing charter.
2. Atomic: Botster mounts set Restty `readOnly: true`.
3. Shared GHOSTSNP client conformance matrix Restty/Web/TUI.
4. Path-neutral Implement report guidance for binary provenance.
