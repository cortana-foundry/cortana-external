# Implementation Plan - Mission Control Codex CLI Chat Surface

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Owner(s) | @cortana-hd |
| Epic | Mission Control Codex chat surface |
| Tech Spec | [Mission Control Codex CLI Chat Surface Tech Spec](./techspec-codex-cli-chat-surface.md) |
| PRD | [Mission Control Codex CLI Chat Surface PRD](./prd-codex-cli-chat-surface.md) |

---

## Dependency Map

| Vertical | Dependencies | Can Start? |
|----------|-------------|------------|
| V1 — Codex runtime adapter | None | Start Now |
| V2 — Session discovery + persistence | V1 | Start after V1 |
| V3 — Session APIs + streaming | V1, V2 | Start after V1, V2 |
| V4 — Mission Control chat UI | V2, V3 | Start after V2, V3 |
| V5 — Recovery, docs, and operator validation | V2, V3, V4 | Start after V2, V3, V4 |

---

## Recommended Execution Order

```text
Week 1: V1 + V2
Week 2: V3
Week 3: V4
Week 4: V5
```

---

## Sprint 1 — Runtime Boundary And Session Model

### Vertical 1 — Codex runtime adapter

**apps/mission-control: create a safe server-side wrapper around Codex CLI subprocess execution**

*Dependencies: None*

#### Jira

- Sub-task 1: Add `apps/mission-control/lib/codex-cli.ts` with helpers for locating `codex`, checking auth, resolving approved workspace/profile inputs, spawning `codex exec --json`, and spawning `codex exec resume --json`.
- Sub-task 2: Normalize JSONL parsing into typed events and map subprocess stderr/exit codes into operator-safe errors.
- Sub-task 3: Add single-active-run guards so browser callers cannot launch overlapping turns against the same Codex session.
- Sub-task 4: Add tests covering happy-path JSONL parsing, malformed lines, subprocess non-zero exit, and missing binary/auth failure handling.

#### Testing

- JSONL event parsing returns ordered normalized events from real Codex output shapes.
- Missing `codex` binary or missing auth produces an explicit prerequisite failure.
- Unsupported browser-supplied execution context is rejected before any subprocess spawn.
- Non-zero subprocess exits surface an actionable error payload instead of silently returning an empty stream.

---

### Vertical 2 — Session discovery + persistence

**apps/mission-control: ingest local Codex session metadata and persist normalized session/event state**

*Dependencies: V1*

#### Jira

- Sub-task 1: Add a parser for `~/.codex/session_index.jsonl` in `apps/mission-control/lib/codex-session-index.ts`.
- Sub-task 2: Add transcript backfill/recovery support for `~/.codex/sessions/.../*.jsonl` in `apps/mission-control/lib/codex-transcripts.ts`.
- Sub-task 3: Add Prisma schema changes and storage helpers for `mc_codex_sessions` and `mc_codex_session_events`.
- Sub-task 4: Add source-native record identity tracking so mirrored events dedupe by stable record key rather than ingest order alone.
- Sub-task 5: Add idempotent sync logic in `apps/mission-control/lib/codex-session-store.ts` so index refresh and transcript backfill can run repeatedly without duplicating events.

#### Testing

- Session index parsing yields stable session ids, titles, and timestamps from real sample lines.
- Transcript backfill can reconstruct a session from raw `.codex` files after DB rows are removed.
- Re-running sync does not duplicate events for the same session when the same raw transcript records are replayed in a different ingest order.

---

## Sprint 2 — API And Streaming

### Vertical 3 — Session APIs + streaming

**apps/mission-control: expose browser-facing Codex session endpoints and live turn streaming**

*Dependencies: V1, V2*

#### Jira

- Sub-task 1: Add `GET /api/codex/sessions` and `GET /api/codex/sessions/[sessionId]`.
- Sub-task 2: Add `POST /api/codex/sessions` and `POST /api/codex/sessions/[sessionId]/messages`.
- Sub-task 3: Add `GET /api/codex/streams/[streamId]` using SSE for first-release streaming and stream lifecycle recovery.
- Sub-task 4: Emit a lifecycle event that reveals the durable Codex session id during new-session creation as soon as the CLI exposes it.
- Sub-task 5: Ensure active turn events are persisted while they stream so reconnects and page refreshes can recover.

#### Important Planning Notes

- Prefer SSE before WebSocket to keep the first release simpler and easier to debug with route handlers.
- Do not proxy raw subprocess stdout directly to the browser without validation; normalize and tag each event first.
- New-session flows should be stream-first. The browser should connect by `streamId` before a durable session id exists.
- Reject execution modes that rely on interactive approval prompts until a machine-readable approval path exists.

#### Testing

- List/detail APIs return DB-backed sessions and fall back cleanly when a backfill is required.
- Create/resume endpoints trigger Codex subprocess execution and stream normalized events.
- Browser reconnect by `streamId` can recover an active run before the durable `codexSessionId` is known or before the UI has switched routes.
- Stream completion writes final transcript state and usage telemetry.

---

## Sprint 3 — UI Surface

### Vertical 4 — Mission Control chat UI

**apps/mission-control: turn `/sessions` into a provider-aware session hub with Codex transcript and composer flows**

*Dependencies: V2, V3*

#### Jira

- Sub-task 1: Refactor `apps/mission-control/app/sessions/page.tsx` into a provider-aware layout that can show existing OpenClaw analytics and Codex sessions side by side or behind a toggle.
- Sub-task 2: Add a Codex session list with thread name, updated time, cwd, branch, and status.
- Sub-task 3: Add a transcript panel and composer for new/resumed Codex messages.
- Sub-task 4: Add UI states for streaming, reconnect, prerequisite errors, and transcript recovery in progress.
- Sub-task 5: Add client handling for the create-flow handoff from transient `streamId` to durable `codexSessionId`.

#### Testing

- Session list shows Codex rows from API data with stable ordering by update time.
- Selecting a session loads transcript history and latest usage state.
- Sending a new prompt shows pending state, streamed assistant messages, and final completion state without page reload.
- Starting a new thread can render streamed output immediately and then transition cleanly onto the discovered Codex session id without losing in-flight UI state.
- Resuming a pre-existing Codex session uses the same session id so the turn can be observed from another Codex client reading the same local store after refresh/reopen.

---

## Sprint 4 — Recovery, Docs, And Operator Validation

### Vertical 5 — Recovery, docs, and operator validation

**apps/mission-control: close the reliability gaps and document the operating model**

*Dependencies: V2, V3, V4*

#### Jira

- Sub-task 1: Add restart/recovery logic so Mission Control can rehydrate recent Codex transcripts from mirrored rows and `.codex` fallback files.
- Sub-task 2: Update Mission Control docs and README references for the new planning and runtime surface.
- Sub-task 3: Add a manual operator validation checklist for real Codex session create/resume/recovery behavior, including cross-client shared-session verification against the Codex app or another Codex client using the same local state store.
- Sub-task 4: Confirm log/error wording is operator-readable and points to the correct remediation path.

#### Testing

- Mission Control restart does not lose previously mirrored Codex transcripts.
- Broken `.codex` files fail visibly without corrupting stored transcript history.
- Operator docs point to the right prerequisite checks and runtime assumptions.

---

## Dependency Notes

### V1 before V2

Session persistence needs a stable normalized event model and stable source-record identity from the Codex subprocess before storage shape and dedupe rules can be finalized.

### V2 before V3

APIs should read and write through the same store that recovery uses; otherwise transcript detail and live streaming will diverge.

### V3 before V4

The UI should be built against the real session and streaming contracts, not mocked final shapes that drift from the backend.

### V4 before V5

Operator validation depends on the full browser flow existing end to end.

---

## Scope Boundaries

### In Scope (This Plan)

- Codex session discovery from local `.codex` state
- Codex session create/resume from Mission Control
- Live transcript streaming into the browser
- Mission Control DB-backed mirrored transcript storage
- Explicit operator errors for unsupported runtime states

### External Dependencies

- Local machine has a working Codex CLI install and auth state.
- Mission Control server process can read `~/.codex`.

### Integration Points

- Reads local Codex state from `~/.codex/session_index.jsonl` and `~/.codex/sessions/...`.
- Executes local `codex` CLI subprocesses from Mission Control route handlers or supporting server libraries.
- Reuses the existing `/sessions` Mission Control surface rather than adding a separate product area.

---

## Realistic Delivery Notes

- **Biggest risks:** approval-mode mismatch for browser-initiated runs, unsafe browser control over execution context, stream bootstrap complexity before session id discovery, and transcript duplication during recovery.
- **Assumptions:** Codex CLI JSONL output remains stable enough to normalize, local Mission Control deployment can access `~/.codex`, and the first release can exclude interactive approval-heavy flows without blocking the primary operator value.
