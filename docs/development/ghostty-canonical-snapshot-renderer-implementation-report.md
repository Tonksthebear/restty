# Implementation Report: Make Restty the canonical Ghostty snapshot renderer

**Ticket:** `ticket_1786471489_344578`
**Run:** `run_1786471510_664686`
**Step:** Implement (`botster_stack_implement`) — rework after Review `review_1786475845_818487`
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
| `finding_1786475845_713074` B2 does not exercise Restty GHOSTSNP import | high | Added mounted consumer smoke that calls public `loadBinarySnapshot` with committed GHOSTSNP fixture and asserts restored palette, live output, resize, reconnect, keyboard under `readOnly`. Exit 0. |

Prior findings remain resolved (A8 exactness, OSC tuples, B1/B2 protocol smokes, hygiene, path-neutral report).

## Files changed (this visit)

| Path | Change |
| --- | --- |
| `scripts/consumer-proof/ghostsnp-mounted-consumer.html` | Browser mount with `readOnly: true` + control surface |
| `scripts/consumer-proof/ghostsnp-mounted-consumer-smoke.mjs` | Playwright-driven consumer proof (Playwright borrowed, not a Restty dep) |
| `scripts/consumer-proof/README.md` | Run instructions |
| `package.json` | `smoke:ghostsnp-mounted-consumer` script |
| `docs/development/*report*.md` | This report |

## Ownership boundaries preserved

- Restty owns GHOSTSNP import/render/input encode and this consumer library proof.
- Playwright is **not** added to Restty dependencies (Plan constraint). Smoke loads Playwright from an external Web checkout via `PLAYWRIGHT_MODULE` / `BOTSTER_WEB_ROOT`.
- Permanent Botster Web product wiring of `loadBinarySnapshot` remains Web ticket after merge vendor.

## Cross-repo dependencies

| Item | Status |
| --- | --- |
| Web `ticket_1786471490_562794` | depends_on Restty; durable production mount after merge |
| Playwright host | External botster-web `node_modules/playwright` only for browser runner |

## Deviations from plan

1. `suppressQueryReplies` (not full `sendReply` no-op).
2. Added Restty-owned **mounted GHOSTSNP consumer smoke** because B1/B2 alone do not call `loadBinarySnapshot`. Does not add a Restty Playwright package dependency.

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

**28 pass / 0 fail** (on branch tip prior to this commit; re-run before gate if needed).

### Mounted GHOSTSNP consumer proof (closes finding_1786475845_713074)

```bash
bun run build
PLAYWRIGHT_MODULE=<botster-web-node_modules>/playwright \
  npm run smoke:ghostsnp-mounted-consumer
```

Observed:

```
ghostsnp-import ok bytes=2160 palette1=0xabcdef
live-output-after-import ok
resize-after-import ok
reconnect-second-import ok
keyboard-insertText-under-readOnly ok
ghostsnp-mounted-consumer-smoke passed {"fixture":"tests/fixtures/ghostsnp/rich-matrix-v1.bin","assertions":["loadBinarySnapshot(GHOSTSNP)","palette[1]=0xabcdef","live-output-after-import","resize-after-import","reconnect-second-import","keyboard-insertText-under-readOnly"]}
```

Exit **0**.

Assertions:

1. Public `loadBinarySnapshot` accepts committed `tests/fixtures/ghostsnp/rich-matrix-v1.bin` (magic GHOSTSNP)
2. Restored `getPaletteColor(1) === 0xabcdef` (fixture-encoded OSC palette)
3. Live PTY write after import
4. Resize after import
5. Second import (reconnect) restores palette again
6. Keyboard insertText under `readOnly: true`

### Prior consumer protocol smokes (still green on this dist)

| Gate | Result |
| --- | --- |
| B1 mounted-terminal-keyboard | exit 0 (vendored dist + proof readOnly) |
| B2 live-packaged-protocol | exit 0 (attach chronology snapshot→attached→terminal_output) |

B2 remains protocol attach proof; the new smoke is the explicit GHOSTSNP `loadBinarySnapshot` consumer gate.

### Hygiene

- `git diff --check origin/main...HEAD` clean
- Fixture-gen Zig outputs ignored

### Production entry points

| Behavior | Wired at |
| --- | --- |
| `readOnly` query mute | `create-runtime.ts` → `suppressQueryReplies` |
| Snapshot API | public `loadBinarySnapshot` → WASM GHOSTSNP import |
| Mounted consumer proof | `scripts/consumer-proof/*` + `npm run smoke:ghostsnp-mounted-consumer` |
| Botster docs | `docs/usage.md` §9 |

## Unverified behavior / residual risk

- Permanent Web HEAD still needs committed product wiring for `readOnly` + Hub→GHOSTSNP→`loadBinarySnapshot` after merge (Web ticket).
- Exclusive GHOSTSNP on the live Hub wire is Core/Hub project work; Restty proves import + consumer render of known GHOSTSNP bytes.
- Baseline `test:ci` residual fails remain pre-existing (kitty/search/definition errors).

## Missing vault guidance

1. Dedicated `restty-playbook` routing charter.
2. Atomic: Botster mounts set Restty `readOnly: true`.
3. Shared GHOSTSNP client conformance matrix Restty/Web/TUI.
4. Path-neutral report guidance (applied here).
