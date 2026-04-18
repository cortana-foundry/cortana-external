# Product Requirements Document (PRD) - Mission Control Codex CLI Chat Surface

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Primary Owner | @cortana-hd |
| Epic | Mission Control Codex chat surface |

---

## Problem / Opportunity

Mission Control already exposes a read-only Sessions surface backed by OpenClaw session analytics, but it cannot act as an interactive chat client for the Codex CLI sessions the operator already uses locally.

Today the operator has to leave Mission Control, open a terminal, search the Codex resume picker, continue a session there, and mentally stitch together chat history, token usage, and repo context. That split increases friction for active work, makes session continuity harder to review in one place, and prevents Mission Control from becoming the operator control plane for local agent work.

The opportunity is to let Mission Control list Codex sessions, open a transcript, send a new message into an existing thread, and stream Codex output back into the browser without needing to attach to the Codex desktop app.

---

## Insights

- Mission Control already has a Sessions page and API route, so the product surface exists and can be evolved instead of inventing a new area of the app.
- Codex CLI exposes machine-readable session and turn behavior via `codex exec --json` and `codex exec resume --json`, which is a more stable integration boundary than scraping terminal UI or reverse-engineering the desktop app.
- Codex stores local session metadata under `~/.codex`, including `session_index.jsonl` and per-session JSONL transcripts, which provides a recovery path and bootstrap source for session discovery.

Not intended to solve in this workstream:

- direct attachment to the Codex desktop app's internal chat state
- bidirectional synchronization with the Codex macOS app sidebar
- generic multi-provider agent orchestration beyond Codex CLI

---

## Development Overview

Mission Control will become a browser client for Codex CLI by reading recent session metadata from `~/.codex/session_index.jsonl`, sending new turns through `codex exec --json` for new sessions and `codex exec resume --json` for existing sessions, and mirroring normalized session + event records into Mission Control storage so the UI is not dependent on raw `.codex` files for transcript rendering or search. The first release intentionally targets the stable CLI JSONL boundary rather than the experimental Codex app-server and explicitly excludes approval-heavy interactive terminal flows that cannot be represented cleanly in the web UI yet.

---

## Success Metrics

- Operators can start or continue a Codex session from Mission Control without opening the Codex terminal UI.
- Mission Control can render recent Codex sessions with thread name, updated time, cwd, and latest message state.
- A resumed session produces streamed assistant output in Mission Control with no manual refresh required.
- Transcript recovery succeeds when Mission Control restarts because normalized session data is mirrored in-app and can be backfilled from `.codex` files.
- Error states are explicit: missing CLI, missing auth, malformed session index, and unsupported approval mode failures surface as operator-readable errors instead of silent empty states.

---

## Assumptions

- `codex` CLI is installed on the same machine as Mission Control and available on `PATH`.
- Mission Control is operating as a local or tailnet-only operator tool with filesystem access to the operator home directory, including `~/.codex`.
- Codex CLI session ids and `session_index.jsonl` remain stable enough to use as a discovery source.
- The first release can treat raw `.codex` session files as a bootstrap/recovery source while Mission Control DB-backed records become the preferred transcript source.
- The first release does not need to support every Codex execution mode. It can require a dedicated backend-safe Codex profile/config that does not depend on invisible TTY approval prompts.

---

## Out of Scope

- Scraping or mutating the Codex desktop app's private storage.
- Full parity with the Codex terminal TUI, including alternate-screen layouts or the local resume picker itself.
- Multi-user shared Codex sessions across separate operator machines.
- Remote execution routing to a different host than the Mission Control server.
- Web-mediated tool approval workflows unless Codex exposes a machine-readable approval event model that Mission Control can safely consume.

---

## High Level Requirements

| Requirement | Description | Notes |
|-------------|-------------|-------|
| [Session discovery and detail](#session-discovery-and-detail) | Mission Control lists recent Codex sessions and can open a transcript view for a specific session. | Session discovery should not depend on scraping terminal text output. |
| [Interactive session messaging](#interactive-session-messaging) | Mission Control can create a Codex session or resume one by id and send a new user message. | Uses Codex CLI as the execution runtime. |
| [Streaming, persistence, and recovery](#streaming-persistence-and-recovery) | Mission Control streams turn output live and mirrors normalized records for recovery and search. | Raw `.codex` files remain a fallback source, not the only source. |
| [Operator-safe failure handling](#operator-safe-failure-handling) | Mission Control surfaces clear errors for missing prerequisites and unsupported runtime modes. | Approval-heavy flows stay out of the first release boundary. |

---

## Detailed User Stories

### Glossary

| Term | Meaning |
|------|---------|
| Codex session | A persisted Codex CLI thread identified by a session/thread id in `~/.codex`. |
| Session index | The `~/.codex/session_index.jsonl` file containing recent thread metadata such as id, thread name, and update time. |
| Session transcript | The per-session JSONL file under `~/.codex/sessions/...` that records session metadata and emitted events. |
| Mirror store | Mission Control DB-backed normalized session and event records created from streamed Codex CLI output. |

---

### Session discovery and detail

| Status | User story | Notes |
|--------|------------|-------|
| Proposed | As an operator I want to see my recent Codex sessions inside Mission Control so that I can resume work from the browser instead of the terminal picker. | Session rows should include at minimum thread name, updated time, cwd, and session id. |
| Proposed | As an operator I want to open a specific Codex session and read its latest transcript so that I can reorient without switching tools. | Mission Control should prefer mirrored events and fall back to `.codex` session files when needed. |

---

### Interactive session messaging

| Status | User story | Notes |
|--------|------------|-------|
| Proposed | As an operator I want to send a new prompt into an existing Codex session from Mission Control so that I can continue the same thread from the web UI. | Backed by `codex exec resume <session_id> --json <prompt>`. |
| Proposed | As an operator I want to start a brand-new Codex session from Mission Control so that new work can stay in the same operational UI. | Backed by `codex exec --json <prompt>`. |

---

### Streaming, persistence, and recovery

| Status | User story | Notes |
|--------|------------|-------|
| Proposed | As an operator I want to see Codex response items stream into the browser as the turn executes so that Mission Control feels live rather than batch-only. | Stream SSE or WebSocket events sourced from subprocess JSONL. |
| Proposed | As an operator I want Mission Control to preserve the transcript of Codex work so that session context survives app restarts and can be searched later. | Mirror session/event rows into Mission Control storage. |

---

### Operator-safe failure handling

| Status | User story | Notes |
|--------|------------|-------|
| Proposed | As an operator I want clear prerequisite errors when Codex CLI, auth, or session files are unavailable so that I know what to fix. | Empty lists should not hide real runtime failures. |
| Proposed | As an operator I want unsupported approval modes to fail explicitly instead of hanging the UI so that browser-initiated turns stay predictable. | First release should reject unsupported runtime modes up front. |

---

## Appendix

### Additional Considerations

- Mission Control already exposes `/sessions`; evolving that surface is lower-friction than inventing a new top-level navigation item.
- Codex session JSONL files include `session_meta`, `turn_context`, `response_item`, `event_msg`, and `task_complete` records, which are sufficient to build a transcript-oriented UI without reverse-engineering the desktop app.

### Open Questions And Recommended Answers

1. Should Mission Control integrate with the Codex desktop app directly?
   Recommended answer: No. Use Codex CLI as the supported runtime boundary and treat the desktop app as a separate client.

2. Should raw `.codex` files be the only source of truth for transcript rendering?
   Recommended answer: No. Read `.codex` for discovery and recovery, but persist normalized session and event rows in Mission Control as the preferred source.

3. Should the first release use `codex app-server`?
   Recommended answer: No. Start with `codex exec --json` and `codex exec resume --json` because they are concrete and testable now. Revisit app-server only after the browser client proves out.

4. How should approvals work in a browser-initiated run?
   Recommended answer: Keep approval-heavy flows out of the first release boundary. Require a backend-safe Codex execution profile and fail fast when the requested runtime mode would rely on an invisible TTY approval prompt.

5. Should Mission Control replace the existing OpenClaw Sessions page?
   Recommended answer: No. Reframe `/sessions` as a session hub with provider-aware tabs or filters so OpenClaw analytics and Codex chat can coexist.

### Technical Considerations

- Session discovery should parse `~/.codex/session_index.jsonl` rather than trying to automate the Codex resume picker.
- Transcript rendering should normalize the JSONL event stream into user/assistant/system/tool events that the UI can render consistently.
- Long-running turns should use streaming transport from the server to the browser; request/response polling alone will feel broken for active agent work.
