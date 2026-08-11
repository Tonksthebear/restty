# Plan: Make Restty the canonical Ghostty snapshot renderer

**Ticket:** `ticket_1786471489_344578`  
**Run:** `run_1786471510_664686`  
**Pipeline:** Botster Stack Delivery  
**Step:** Plan — revision 3 (after Plan Review `review_1786472992_550927`)  
**Date:** 2026-08-11

## Plan Review findings status

| Finding | Class | Status in this revision |
| --- | --- | --- |
| `finding_1786472992_361600` Mounted browser gate not executable | product | **Primary fix this revision** — single concrete dual-boundary proof; no invented Restty browser stack |
| `finding_1786472620_423368` Downstream/mounted proof missing | product | Closed via named Web smokes + Web dependency + artifact contract |
| `finding_1786472620_377432` Query-reply ownership | product | Closed — exact `readOnly` contract + named Restty unit proof files |
| `finding_1786472620_259529` Conformance deferrable | product | Closed — non-deferrable matrix + named fixture paths |
| `finding_1786472620_819364` Four checklists | process | Closed — authoritative checklist only; no new checklist this visit |
| `finding_1786472620_777409` Incomplete baseline | product | Closed — full residual table retained |

Review summary (review_1786472992): prior dependency, query ownership, conformance, baseline, and checklist findings were resolved; only the non-executable browser gate remained.

---

## Target repository and target_id

| Field | Value |
| --- | --- |
| **target_repository** | `restty` (`trybotster/restty`) |
| **target_id** | `tgt_9a348ca759594fdeaed2894c1f70a4c7` |
| **authoritative base** | `origin/main` @ `79f633189adc73b8cf5ed4f7c7be1be4a7da35bf` |
| **pipeline worktree** | this session worktree; **sync to origin/main before product edits** |

## Repository playbook / ownership charter

Human routing (`question_1786471976_515398`):

- No dedicated `restty-playbook` in routing map.
- **Do not** apply `botster-terminal-ghostty-playbook`.
- Temporary charter: [[restty is a client renderer not authoritative terminal infrastructure]].
- Load browser proof overlays: [[restty live harnesses use inserttext through mounted terminal focus]] + applicable web client proof notes + [[botster-web-playbook]] for consumer seams.

| Restty owns | Restty does not own |
| --- | --- |
| Client rendering, GHOSTSNP **import**, input **encoding**, renderer lifecycle, renderer unit/integration conformance | Terminal truth, PTY **query replies**, Hub policy, Ghostty backend package, live-Hub packaging |

**repository_playbook (gate field):** temporary via `restty is a client renderer not authoritative terminal infrastructure` (human Q 515398)

---

## Role / surface playbooks and atomic notes loaded

- [[planner-playbook]], [[botster-planner-playbook]]
- [[restty is a client renderer not authoritative terminal infrastructure]]
- [[restty live harnesses use inserttext through mounted terminal focus]]
- [[botster-web-playbook]]
- [[browser terminal input proof must exercise renderer callbacks]]
- [[restty component smokes may need runtime settle before synthetic input]]
- [[mounted browser terminal attach is idempotent by attachment identity]]
- [[browser-buffers-live-output-during-snapshot-assembly-prevents-duplicate-scrollback]]
- [[browser terminal forwards restty size changes after connect starts]]
- [[session-process-owns-vt-parser-hub-rpc-snapshots]]
- [[ghostty shadow terminal integration belongs outside botster core]]
- [[opaque terminal snapshot bytes do not prove renderable history]]
- [[coredaemon attached follows initial snapshots before live terminal output]]
- [[initial terminal snapshots must precede live output activation]]
- [[botster clients restore visible terminal state from readscreen before buffered live output]]
- [[shared conformance fixtures that contradict the core contract teach clients the wrong state machine]]
- [[pinned libghostty exposes synchronous exact mouse mode state]]
- [[restty is vendored into botster by manual build-and-copy workflow not a submodule]]
- [[vendored restty uses relative chunk imports so no Vite alias is needed]]
- [[empty font source lists are fatal in vendored restty]]
- [[restty-wasm-build-zig-zon-paths-resolve-from-the-wasm-directory]]
- [[plan agents must author vault context as wikilinks not home paths]]
- [[pipeline vault checklists must cite exact resolvable note titles]]
- [[vault example paths are not repository placement conventions]]

**Not loaded:** [[project-pipelines-playbook]], [[botster runtime teardown lenses]], [[botster-terminal-ghostty-playbook]] as ownership charter.

**teardown_class_applies:** false

---

## Context loaded

- Ticket: GHOSTSNP-only production snapshot input; preserve scrollback/attrs/colors/cursor/modes; input encode ≠ query replies; conformance matrix; no compat paths.
- Project cutover siblings: Core producer, Hub transport, **Web consumer** `ticket_1786471490_562794`, TUI peer.
- `origin/main` already has import-only GHOSTSNP + mode rehydrate; JS `sendReply` still live when not muted.
- Restty **has no** Playwright/happy-dom dependency and **no** browser test harness on main — do not invent one.
- botster-web **does** have production browser harnesses (Playwright) used as the live mounted gate.

---

## Executable proof boundary (single selection — no alternatives)

### Boundary A — Restty-local (this repository, this ticket Implement/Verify)

**Mechanism:** Bun unit/integration tests only (existing harness).  
**Forbidden:** adding Playwright, happy-dom, or a new Restty browser stack for this ticket.

| # | File | Command | Required assertions |
| --- | --- | --- | --- |
| A1 | `tests/restty-wasm-binary-snapshot.test.ts` | `bun test tests/restty-wasm-binary-snapshot.test.ts` | Opaque blob forwarded to `restty_snapshot_import`; missing export fails closed |
| A2 | `tests/restty-wasm-snapshot-live-output.test.ts` | `bun test tests/restty-wasm-snapshot-live-output.test.ts` | GHOSTSNP import; live write; resize; invalid magic rejected |
| A3 | `tests/runtime-app-api-binary-snapshot.test.ts` | `bun test tests/runtime-app-api-binary-snapshot.test.ts` | Public app exposes `loadBinarySnapshot`; handle recreate |
| A4 | `tests/runtime-app-api-binary-snapshot-integration.test.ts` | `bun test tests/runtime-app-api-binary-snapshot-integration.test.ts` | Public path post-snapshot write/render/resize on **new** handle; queued PTY flush post-import on new handle (attach ordering) |
| A5 | `tests/snapshot-import-mode-rehydrate.test.ts` | `bun test tests/snapshot-import-mode-rehydrate.test.ts` | Mouse rehydrate from bits; public `loadBinarySnapshot` rehydrates without post-import CSI to JS |
| A6 | `tests/mouse-rehydrate-tracking-bits.test.ts` | `bun test tests/mouse-rehydrate-tracking-bits.test.ts` | Tracking bit → SGR mouse encode |
| A7 | **`tests/read-only-query-mute.test.ts`** (new) | `bun test tests/read-only-query-mute.test.ts` | With `appOptions.readOnly: true`: OSC 10/11/12, DA, DSR stimuli produce **zero** PTY sink replies; Kitty key encode + mouse encode still emit input bytes on same sink |
| A8 | **`tests/ghostsnp-conformance.test.ts`** (new) | `bun test tests/ghostsnp-conformance.test.ts` | Full matrix (below) against committed rich fixtures under `tests/fixtures/ghostsnp/` |

**Aggregate Restty command (must be green):**

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

Baseline before A7/A8 (six files on `79f633189`): **19 pass / 0 fail**.

### Boundary B — Downstream live mounted browser (botster-web, after vendor)

**Not implemented in Restty.** Runs on Web target after this ticket’s `dist/` is vendored. Registered dependency: Web `ticket_1786471490_562794` **depends_on** this Restty ticket.

| # | Script | npm script | Prerequisites | Required assertions (existing harness behavior + GHOSTSNP cutover deltas) |
| --- | --- | --- | --- | --- |
| B1 | `botster-web/scripts/mounted-terminal-keyboard-smoke.mjs` (+ `mounted-terminal-keyboard-smoke.html`) | `npm run smoke:mounted-terminal-keyboard` | botster-web checkout; `npm install`; Playwright Chromium; Restty vendored from **this ticket’s merge commit** `dist/restty.js` + `chunk-*.js` into Web vendor path | Canvas `.terminal-view-container canvas` mounted; `pty_connected`; focus Restty textarea; `insertText` full line; exactly one harness input + echo render path (renderer callback path, not bridge-only) |
| B2 | `botster-web/scripts/live-packaged-protocol-harness.mjs` | `npm run smoke:live-packaged-protocol` | Same vendor; `BOTSTER_HUB_BIN`; `BOTSTER_SESSION_WORKER_BIN`; `npm run build` (script already builds) | Live-Hub package mode; Restty attach; terminal snapshot/scrollback then live output ordering; keyboard `insertText` → single `send_input`; resize/readback paths per harness |

**Exact B2 command:**

```bash
cd /path/to/botster-web
# after vendor copy of Restty dist from Restty merge SHA:
BOTSTER_HUB_BIN=/path/to/botster-hub \
BOTSTER_SESSION_WORKER_BIN=/path/to/botster-session-worker \
npm run smoke:live-packaged-protocol
```

**Exact B1 command:**

```bash
cd /path/to/botster-web
npm run smoke:mounted-terminal-keyboard
```

**Web production mount path (consumer):**  
`botster-web/src/botster/resttyRenderer.ts` → `new Restty({ root, appOptions: { … } })` via `TerminalViewHost` / `DefaultTerminalViewBridge`.  
**Required option after this Restty contract lands:** `appOptions.readOnly: true` (Web ticket applies; Restty A7 proves the option works).  
**Required snapshot API:** `loadBinarySnapshot(Uint8Array)` with GHOSTSNP bytes from Hub/Core (Web ticket wires; Restty A4/A8 prove API).

**Consumed Restty artifact:** merge commit SHA of this Restty ticket → `bun run build` → copy `dist/restty.js` + all `dist/chunk-*.js` into Web vendor per [[restty is vendored into botster by manual build-and-copy workflow not a submodule]].

---

## Exact production contracts

### Snapshot
- Sole production install: `loadBinarySnapshot(data: Uint8Array): boolean`
- WASM: `restty_snapshot_import` → GHOSTSNP `ghostty-terminal-snapshot-v1` only
- Fail closed; no encode; no legacy page ABI; no dual formats

### Query replies (`readOnly`)
| Path | `appOptions.readOnly === true` | default / false |
| --- | --- | --- |
| WASM `flushWasmOutputToPty` | discard | may forward |
| JS `createInputHandler` `sendReply` | **no-op** (must not `ptyTransport.sendInput`) | may reply (playground sole-PTY) |
| User input encode | **still** `ptyTransport.sendInput` | same |

**Call path:**  
`new Restty({ appOptions: { readOnly: true } })` → `create-runtime.ts` → `createRuntimeAppApi({ readOnly })` → `createInputHandler({ sendReply: readOnly ? () => {} : d => ptyTransport.sendInput(d) })` + existing WASM drain short-circuit.

**Proof file:** `tests/read-only-query-mute.test.ts` (A7). Not “code exists.”

### Conformance matrix (non-deferrable)

Fixtures: `tests/fixtures/ghostsnp/*.bin` (or `.hex`) **committed**, produced via Ghostty-pin encode tooling (not freestanding WASM). `complete-v1.hex` alone is **import smoke only**, not full matrix.

| Case | Required |
| --- | --- |
| Scrollback beyond viewport | yes |
| Cell attributes | yes |
| Colors / palette | yes |
| Cursor | yes |
| Kitty keyboard flags → encode | yes |
| Mouse modes → SGR encode | yes |
| Resize post-import | yes |
| Reconnect second import | yes |
| Attach order: snapshot then live flush on new handle | yes (A4 + A8) |

If a required state cannot be encoded from Ghostty pin during Implement: **register Core dependency** on `ticket_1786471489_484901` immediately — do not skip the row.

---

## Scope / non-scope

**In:** sync worktree; GHOSTSNP-only surface; complete `readOnly` JS mute; A7+A8 tests + fixtures; docs for Botster mount contract; focused gates; residual-identical `test:ci`.

**Out:** inventing Restty Playwright/happy-dom; implementing Web harness changes beyond documenting required options (Web ticket); Core/Hub/TUI code; dual formats; fixing baseline kitty/search/test-definition residuals unless newly introduced.

---

## Ownership and dependencies

| Item | Value |
| --- | --- |
| Restty ticket | this run |
| Web consumer | `ticket_1786471490_562794` (`tgt_40abcf71ccf049f4ac0c99953a799869`) |
| Ordering | Web **depends_on** Restty (`dependency_1786471501_538276`) |
| Core | soft for wire format goldens; hard dependency only if fixture encode blocked |
| Live browser proof ownership | Web scripts B1/B2 after vendor; Restty supplies library + A* tests |

---

## Affected surfaces / files

- `src/runtime/create-runtime.ts` — mute `sendReply` when `readOnly`
- `src/runtime/create-runtime/runtime-app-api.ts` — snapshot + drain
- `src/runtime/types.ts` — document `readOnly`
- `src/input/**` only if needed for mute/encode proofs
- `tests/read-only-query-mute.test.ts` (new)
- `tests/ghostsnp-conformance.test.ts` (new)
- `tests/fixtures/ghostsnp/*` (new)
- docs: this plan; `docs/usage.md` / internals for contract

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Stale worktree page ABI | Sync first |
| Soft-pass matrix without rich fixtures | A8 hard-requires fixtures |
| Web runs B1/B2 before vendor | Dependency + artifact SHA |
| Default `readOnly` breaks playground | Default false |
| Residual creep | Exact residual table |

---

## Acceptance checks / tests

### Restty (this ticket) — must pass

```bash
# worktree on origin/main + changes
bun run build:wasm   # if zig changed
bun run lint
bun run format:check
bun test \
  tests/restty-wasm-binary-snapshot.test.ts \
  tests/restty-wasm-snapshot-live-output.test.ts \
  tests/runtime-app-api-binary-snapshot.test.ts \
  tests/runtime-app-api-binary-snapshot-integration.test.ts \
  tests/snapshot-import-mode-rehydrate.test.ts \
  tests/mouse-rehydrate-tracking-bits.test.ts \
  tests/read-only-query-mute.test.ts \
  tests/ghostsnp-conformance.test.ts
bun run test:ci   # residual must match table below
```

### Full suite residual baseline (`origin/main` @ `79f633189`)

| Kind | Count | Exact |
| --- | --- | --- |
| pass | 170 | — |
| fail | 7 | kitty graphics transmit+display (rgb); kitty graphics transmit+display (png); rewritten APC accepted by kitty graphics parser; snacks-style file-medium + unicode placeholders; wasm search exposes total matches…; wasm search clear resets…; kitty graphics query returns OK |
| errors | 2 | `tests/hyperlink-resize.test.ts` — `test() expects a function`; `tests/max-scrollback.test.ts` — same |

Post-change residuals must match these **exact names** (or be fewer). No new fails/errors.

### Downstream live (Web ticket after vendor) — required project proof

```bash
# botster-web, Restty dist vendored from Restty merge SHA
npm run smoke:mounted-terminal-keyboard
BOTSTER_HUB_BIN=… BOTSTER_SESSION_WORKER_BIN=… npm run smoke:live-packaged-protocol
```

Web ticket must also set `readOnly: true` and GHOSTSNP `loadBinarySnapshot` on production mount before claiming full cutover.

---

## Implementation sequence

1. Sync pipeline worktree to `origin/main`
2. Wire `readOnly` JS `sendReply` mute; add A7
3. Commit rich GHOSTSNP fixtures; add A8 matrix
4. Docs: Botster mount contract (`readOnly` + `loadBinarySnapshot`)
5. Run Restty acceptance commands; record residual before/after
6. Merge Restty → Web vendors dist → Web runs B1/B2 under Web ticket

---

## Vault checklist hygiene

| ID | Role |
| --- | --- |
| `checklist_1786471789_128092` | **Authoritative** — reuse; update evidence only |
| `checklist_1786471803_348069`, `checklist_1786471832_562424`, `checklist_1786471840_312349` | Duplicates — **do not use / do not create more** |

This visit: **skip new checklist** (exists).

---

## Vault gaps

1. Dedicated `restty-playbook` routing charter  
2. Convention: Botster mounts set Restty `readOnly: true`  
3. Shared GHOSTSNP client conformance matrix Restty/Web/TUI  

---

## Gate evidence map

| Field | Value |
| --- | --- |
| target_repository | restty |
| target_id | tgt_9a348ca759594fdeaed2894c1f70a4c7 |
| plan_uri | docs/development/ghostty-canonical-snapshot-renderer-plan.md |
| primary_finding_fixed | finding_1786472992_361600 |
| proof_boundary | A = bun public API tests (named files); B = botster-web smoke:mounted-terminal-keyboard + smoke:live-packaged-protocol |
| checklist_id | checklist_1786471789_128092 |
| web_consumer_ticket | ticket_1786471490_562794 |
| teardown_class_applies | false |
