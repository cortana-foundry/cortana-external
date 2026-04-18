# Technical Specification - Mission Control Codex CLI Chat Surface

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Owner(s) | @cortana-hd |
| Epic | Mission Control Codex chat surface |

---

## Development Overview

Mission Control will become a browser client for Codex CLI by reading recent session metadata from `~/.codex/session_index.jsonl`, sending new turns through `codex exec --json` for new sessions and `codex exec resume --json` for existing sessions, and mirroring normalized session + event records into Mission Control storage so the UI is not dependent on raw `.codex` files for transcript rendering or search. The first release intentionally targets the stable CLI JSONL boundary rather than the experimental Codex app-server and explicitly excludes approval-heavy interactive terminal flows that cannot be represented cleanly in the web UI yet.

---

## Data Storage Changes

### Database Changes

Mission Control should add DB-backed session + event storage for normalized Codex transcripts. Raw files under `~/.codex` remain bootstrap inputs and recovery inputs, not the preferred long-term render source.

#### [NEW] public.mc_codex_sessions

| Constraints | Column Name | Column Type | Notes |
|-------------|-------------|-------------|-------|
| PK | id | text | Mission Control generated session row id or reuse Codex session id directly. |
| Unique, Not Null | codex_session_id | text | Codex thread/session id from `session_index.jsonl` and session JSONL metadata. |
| Nullable | thread_name | text | Human title from session index. |
| Nullable | cwd | text | Session working directory from `session_meta`. |
| Nullable | branch | text | Optional branch captured from Mission Control context or Git snapshot. |
| Nullable | source | text | `exec`, `resume`, or `imported`. |
| Nullable | cli_version | text | Codex CLI version from `session_meta`. |
| Nullable | model | text | Latest known model for the session. |
| Nullable | last_turn_id | text | Latest seen turn id. |
| Nullable | transcript_path | text | Raw `.codex` path last used for recovery/backfill. |
| Not Null, Default now() | created_at | timestamptz | Created timestamp. |
| Not Null | updated_at | timestamptz | Latest activity time. |
| Not Null, Default `'active'` | status | text | `active`, `completed`, `errored`, `imported`, etc. |
| Not Null, Default `'{}'::jsonb` | metadata | jsonb | Additional runtime facts and recovery state. |

#### [NEW] public.mc_codex_session_events

| Constraints | Column Name | Column Type | Notes |
|-------------|-------------|-------------|-------|
| PK | id | bigserial | Internal ordering key. |
| FK, Not Null | codex_session_id | text | References `mc_codex_sessions.codex_session_id`. |
| Not Null | event_index | integer | Monotonic order within one session ingest stream. |
| Not Null | event_type | text | Normalized event type such as `user_message`, `assistant_message`, `response_item`, `token_count`, `task_complete`. |
| Nullable | turn_id | text | Present when emitted in a Codex turn context. |
| Nullable | phase | text | Commentary/final/system when present. |
| Nullable | event_ts | timestamptz | Source timestamp from the JSONL record. |
| Not Null | payload | jsonb | Raw or lightly normalized event payload. |
| Not Null, Default now() | ingested_at | timestamptz | Mission Control ingest time. |

Recommended indexes:

- unique index on `(codex_session_id, event_index)`
- index on `updated_at desc` for session listing
- index on `(codex_session_id, event_ts, id)` for transcript replay

---

## Infrastructure Changes (if any?)

### SNS Topic Changes

None.

### SQS Queue Changes

None.

### Cache Changes

In-process cache is acceptable for the parsed session index and recent transcript fragments, but it must be treated as an optimization only. Mission Control should still recover from DB-backed mirrored events and raw `.codex` files.

### S3 Changes

None.

### Secrets Changes

None required beyond existing Codex CLI auth on the host machine. Mission Control should detect missing or expired Codex auth and surface it as an operator error.

### Network/Security Changes

- Mission Control must only expose this feature in the same operator security boundary as the local Codex CLI runtime.
- Server-side execution should never trust browser-provided filesystem paths.
- Session resume must validate that the requested session id exists in Mission Control records or in the local Codex session index before invoking the CLI.

---

## Behavior Changes

- `/sessions` evolves from a read-only OpenClaw analytics page into a session hub that can render Codex-backed session rows and open transcript detail.
- Operators can create a new Codex chat or resume an existing Codex session directly from Mission Control.
- When Mission Control resumes an existing Codex session, it targets the same Codex session id and local Codex state store rather than creating a Mission Control-only fork of the transcript.
- Assistant output streams into the browser while the Codex subprocess runs.
- Runtime failures are first-class UI states: CLI missing, auth missing, session id missing, transcript backfill failed, unsupported execution mode, subprocess non-zero exit.
- Transcript history persists in Mission Control and can be reloaded without re-running the Codex command.

Shared-session caveat:

- Mission Control should aim for session compatibility with other Codex clients that read the same local store, but the first release must not promise instantaneous UI reflection inside those clients because app-side caching/refresh behavior is outside Mission Control's control.

---

## Application/Script Changes

- Add `apps/mission-control/lib/codex-cli.ts` for safe subprocess spawning around `codex exec --json` and `codex exec resume --json`.
- Add `apps/mission-control/lib/codex-session-index.ts` to parse `~/.codex/session_index.jsonl`.
- Add `apps/mission-control/lib/codex-transcripts.ts` to normalize `~/.codex/sessions/.../*.jsonl` records for recovery/backfill.
- Add `apps/mission-control/lib/codex-session-store.ts` to read/write Mission Control DB-backed session and event records.
- Update `/sessions` UI and/or supporting components to show provider-aware session list, transcript pane, composer, and streaming state.

Recommended implementation notes:

- Use `spawn` rather than `execFile` for live JSONL streaming.
- Keep raw CLI event payloads in storage for debugging, but also derive a normalized message model for rendering.
- Treat token/rate-limit events as separate telemetry items rather than inline transcript messages.

---

## API Changes

### [NEW] Codex Session List

| Field | Value |
|-------|-------|
| **API** | `GET /api/codex/sessions` |
| **Description** | Lists recent Codex sessions using Mission Control mirrored records with `.codex` index fallback. |
| **Additional Notes** | Supports provider-specific filtering and bootstrap sync from `~/.codex/session_index.jsonl`. |

| Field | Detail |
|-------|--------|
| **Authentication** | Existing Mission Control auth boundary |
| **URL Params** | Optional `limit`, `source=codex`, `sync=true` |
| **Request** | None |
| **Success Response** | `200 { sessions: [{ codexSessionId, threadName, cwd, branch, updatedAt, model, status, lastMessagePreview }] }` |
| **Error Responses** | `500` parse/runtime failure |

### [NEW] Codex Session Detail

| Field | Value |
|-------|-------|
| **API** | `GET /api/codex/sessions/[sessionId]` |
| **Description** | Returns transcript events and session metadata for one Codex session. |
| **Additional Notes** | Reads mirrored records first and can backfill from raw session JSONL if missing. |

| Field | Detail |
|-------|--------|
| **Authentication** | Existing Mission Control auth boundary |
| **URL Params** | `sessionId` |
| **Request** | None |
| **Success Response** | `200 { session, events }` |
| **Error Responses** | `404` session not found, `500` recovery/parse failure |

### [NEW] Codex Session Create

| Field | Value |
|-------|-------|
| **API** | `POST /api/codex/sessions` |
| **Description** | Starts a new Codex session and begins streaming JSONL events. |
| **Additional Notes** | Uses `codex exec --json`. |

| Field | Detail |
|-------|--------|
| **Authentication** | Existing Mission Control auth boundary |
| **URL Params** | None |
| **Request** | `{ prompt, cwd?, model?, profile?, images? }` |
| **Success Response** | `202 { streamId, provisionalSessionId? }` or SSE upgrade |
| **Error Responses** | `400` invalid request, `412` missing Codex prerequisites, `500` subprocess failure |

### [NEW] Codex Session Message

| Field | Value |
|-------|-------|
| **API** | `POST /api/codex/sessions/[sessionId]/messages` |
| **Description** | Resumes a Codex session by id and sends a new user message. |
| **Additional Notes** | Uses `codex exec resume <sessionId> --json`. |

| Field | Detail |
|-------|--------|
| **Authentication** | Existing Mission Control auth boundary |
| **URL Params** | `sessionId` |
| **Request** | `{ prompt, model?, profile?, images? }` |
| **Success Response** | `202 { streamId }` or SSE upgrade |
| **Error Responses** | `404` unknown session, `412` unsupported runtime mode, `500` subprocess failure |

Additional contract note:

- Resume requests must use the exact Codex session id discovered from the shared local session index so Mission Control continues the same underlying session rather than writing a parallel transcript.

### [NEW] Codex Session Stream

| Field | Value |
|-------|-------|
| **API** | `GET /api/codex/sessions/[sessionId]/stream` |
| **Description** | Streams normalized turn events to the browser while a Codex subprocess is active. |
| **Additional Notes** | SSE is preferred for the first release. |

| Field | Detail |
|-------|--------|
| **Authentication** | Existing Mission Control auth boundary |
| **URL Params** | `sessionId` |
| **Request** | None |
| **Success Response** | `200 text/event-stream` |
| **Error Responses** | `404` stream/session missing, `410` stream completed, `500` stream setup failure |

---

## Process Changes

- Add a Mission Control-specific planning/doc pattern for product planning artifacts under `apps/mission-control/docs/source/planning/`.
- Add operator documentation for Codex CLI prerequisites and the expected local host environment.
- Keep raw transcript backfill tooling idempotent so a restart does not duplicate events.

---

## Orchestration Changes

- No Kubernetes or cloud orchestration changes are required.
- Mission Control becomes the local orchestrator for Codex CLI subprocesses and their SSE/WebSocket fan-out to the browser.

---

## Test Plan

- Unit tests for session index parsing, transcript event normalization, and subprocess JSONL parsing.
- API route tests for list/detail/create/resume/stream happy paths and failure paths.
- UI tests for session list rendering, transcript rendering, composer submit, pending state, and explicit error banners.
- Manual local validation against a real Codex install to confirm session creation, resume, and transcript recovery after Mission Control restart.
- Manual compatibility validation against another Codex client on the same machine to confirm that a Mission Control-resumed session is visible there after the client refreshes or reopens the transcript.

Special regression areas:

- malformed or partial `session_index.jsonl`
- session detail recovery when mirrored DB rows are missing
- duplicate event ingest on reconnect/backfill
- CLI non-zero exits and auth failures
- streaming completion and browser reconnect behavior
