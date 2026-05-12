# Technical Specification - Trading Ops Live State And Operator Truth

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Owner(s) | TBD |
| Epic | BT-W7 Trading Ops Live State And Operator Truth |

---

## Development Overview

This workstream introduces a hybrid current-state model for Trading Ops:

- `cortana` writes normalized trading-run state directly into the Mission Control Postgres database when runs start, complete, fail, and notify
- Mission Control reads that DB-backed trading-run state as the canonical source for latest run facts, delivery state, and top-level operator posture
- live runtime health remains a direct read from the market-data service/runtime snapshot path so the page reflects what is happening now, not just what was last persisted
- local workflow/cache artifacts remain available as supporting context and fallback evidence, but they are no longer treated as primary truth for the operator's current-state cards

The result should be a page where:

- the operator can trust the top-level view without mentally reconciling stale artifacts
- completed run facts, delivery facts, and live runtime facts are clearly separated by ownership
- missing or degraded inputs are rendered explicitly, with provenance and fallback state visible instead of silently inferred

This Development Overview must stay in sync with the matching PRD.

---

## Data Storage Changes

### Database Changes

Mission Control should gain a dedicated trading-run table rather than overloading the existing generic `Run` model.

Reasoning:

- the existing `Run` table is oriented around agent/openclaw execution and generic payload/result blobs
- Trading Ops needs explicit domain fields for decision, counts, delivery state, and artifact references
- operator queries should not have to scrape JSON payload blobs to answer simple current-state questions

#### [NEW] public.mc_trading_runs

| Constraints | Column Name | Column Type | Notes |
|-------------|-------------|-------------|-------|
| PK | id | uuid | Internal DB id. |
| Unique, Not Null | run_id | text | Stable run id from `var/backtests/runs/<run_id>`. |
| Not Null | schema_version | integer | Start at `1`. |
| Not Null | strategy | text | `Trading market-session unified`, etc. |
| Not Null | status | text | `queued`, `running`, `success`, `failed`, `cancelled`. |
| Not Null | created_at | timestamptz | Mirrors artifact `createdAt`. |
| Nullable | started_at | timestamptz | Mirrors artifact `startedAt`. |
| Nullable | completed_at | timestamptz | Mirrors artifact `completedAt`. |
| Nullable | notified_at | timestamptz | Set when Telegram send succeeds. |
| Nullable | delivery_status | text | `pending`, `notified`, `failed`, `suppressed`. |
| Nullable | decision | text | `BUY`, `WATCH`, `NO_TRADE`, etc. |
| Nullable | confidence | numeric | Rounded from run metrics. |
| Nullable | risk | text | `LOW`, `MEDIUM`, `HIGH`, etc. |
| Nullable | correction_mode | boolean | Mirrors run metrics. |
| Nullable | buy_count | integer | |
| Nullable | watch_count | integer | |
| Nullable | no_buy_count | integer | |
| Nullable | symbols_scanned | integer | |
| Nullable | candidates_evaluated | integer | |
| Nullable | focus_ticker | text | Optional convenience field. |
| Nullable | focus_action | text | Optional convenience field. |
| Nullable | summary_path | text | Durable artifact path for audit/debugging. |
| Nullable | message_path | text | Durable notification payload path. |
| Nullable | watchlist_path | text | Durable watchlist path. |
| Nullable | metrics | jsonb | Full machine metrics for forward compatibility. |
| Nullable | last_error | text | Terminal failure or latest notify failure summary. |
| Nullable | source_host | text | Host that produced the run. |
| Not Null | inserted_at | timestamptz | DB write timestamp. |
| Not Null | updated_at | timestamptz | Updated on each state transition. |

Optional later extension, not required in the first slice:

#### [LATER] public.mc_trading_run_events

| Constraints | Column Name | Column Type | Notes |
|-------------|-------------|-------------|-------|
| PK | id | uuid | |
| Not Null | run_id | text | Foreign-key-like logical reference to `mc_trading_runs.run_id`. |
| Not Null | event_type | text | `created`, `completed`, `notify_attempt`, `notified`, `notify_failed`. |
| Not Null | occurred_at | timestamptz | |
| Nullable | payload | jsonb | For later auditing of retries and transitions. |

This table is deliberately deferred unless first-slice delivery status proves too coarse.

---

## Infrastructure Changes (if any?)

### SNS Topic Changes

No AWS SNS changes are required.

### SQS Queue Changes

No AWS SQS changes are required.

### Cache Changes

- Market brief and local workflow caches remain valid as supporting context only.
- Mission Control must stop using them as the primary source for latest current-state cards once DB-backed trading-run state is available.
- Any UI fallback to cached/file artifacts must be explicit in the card message/badge.

### S3 Changes

No S3 changes are required.

### Secrets Changes

- `cortana` needs a DB write credential for the Mission Control Postgres instance.
- Recommended secret name/environment variable in `cortana`: `MISSION_CONTROL_DATABASE_URL`
- Mission Control continues using its existing `DATABASE_URL`.

### Network/Security Changes

- No new network topology is required if both repos continue running on the same Mac mini.
- Direct DB writes from `cortana` should use least-privilege credentials limited to the relevant trading-run tables if feasible.

---

## Behavior Changes

### Operator-facing changes

- `Latest trading run` becomes the canonical current-state card sourced from DB-backed run state.
- Primary labels become human-readable timestamps such as `Apr 7, 12:10 PM`, with raw `run_id` demoted to secondary metadata.
- Delivery state is first-class and shown from DB-backed `notified_at` / `delivery_status`.
- `Market brief` and `Latest workflow` become supporting-context cards when they are older than the latest trading run.
- Supporting-context cards use `stale` rather than `degraded` as their badge text when the underlying issue is age/provenance, not current failure.
- `Pre-open gate` must render:
  - `Pass`
  - `Warn`
  - `Fail`
  - `Canary not available`
  - `Not reported`
  instead of generic `unknown`.

### Truthfulness rules

- No silent fallback from DB-backed run state to file artifacts.
- No silent reuse of stale workflow/cache artifacts in top-level current-state cards.
- Every primary card must identify its owning source:
  - latest trading run -> DB
  - runtime health -> live runtime snapshot/service
  - supporting context -> file artifacts

---

## Tradeoffs And Alternatives

### Direct DB writes vs Mission Control ingestion API

Chosen: direct DB writes from `cortana` into Mission Control Postgres.

Why:

- same-machine deployment means DB is already local and available
- fewer moving parts than introducing a new internal ingestion API
- writes can still succeed even if the Mission Control web server is down

Tradeoff:

- stronger cross-repo schema coupling
- `cortana` must understand the write contract explicitly

Mitigation:

- keep the DB contract narrow and versioned
- store full artifact paths so file artifacts remain the audit source if DB meaning ever drifts

### DB-only vs hybrid operator model

Chosen: hybrid.

Why:

- completed run state belongs well in DB
- live runtime health is more truthful when read directly from the live service/runtime snapshot
- historical artifacts are better preserved on disk

Tradeoff:

- the page still composes multiple sources

Mitigation:

- assign one source owner per primary card
- make fallback/provenance explicit in messages and badges

### Reuse generic `Run` table vs dedicated `mc_trading_runs`

Chosen: dedicated `mc_trading_runs`.

Why:

- domain-specific queries remain simple and typed
- avoids mixing agent/openclaw run semantics with trading semantics
- reduces UI scraping of generic `payload` / `result` blobs

Tradeoff:

- more schema surface area

Mitigation:

- keep the initial table small and focused on current-state needs

### Persist runtime health to DB vs read live

Chosen: read live.

Why:

- runtime health is most valuable when it reflects the actual current service state
- DB mirroring would introduce lag and yet another reconciliation problem

Tradeoff:

- live reads can fail independently of run-state reads

Mitigation:

- explicit `Runtime unavailable` state
- no silent substitution of stale runtime state

---

## Application/Script Changes

### `cortana`

- Add a small trading-run state writer module, for example:
  - `tools/trading/trading-run-state.ts`
  - or `lib/trading/run-state.ts`
- Update the compute path to write/transition DB state at:
  - run creation
  - run completion
  - run failure
- Update the notify path to write:
  - `delivery_status`
  - `notified_at`
  - latest notify failure summary when relevant
- Reuse existing artifact parsing rather than inventing a second metrics source.

Likely touch points:

- `/Users/hd/Developer/cortana/tools/trading/run-backtest-compute.sh`
- `/Users/hd/Developer/cortana/tools/trading/run-backtest-notify.sh`
- `/Users/hd/Developer/cortana/tools/trading/trading-cron-alert.ts`
- any helper used to write `summary.json` and `message.txt`

### `cortana-external` / Mission Control

- Add Prisma model + migration for `mc_trading_runs`
- Add a loader path that queries latest trading run from DB first
- Preserve file-artifact fallback for compare mode and degraded DB availability
- Remove stale workflow/cache data from primary top-level operator facts
- Make supporting-context cards explicit and secondary
- Standardize runtime-health language for missing canary state

Likely touch points:

- `/Users/hd/Developer/cortana-external/apps/mission-control/prisma/schema.prisma`
- `/Users/hd/Developer/cortana-external/apps/mission-control/lib/trading-ops.ts`
- `/Users/hd/Developer/cortana-external/apps/mission-control/components/trading-ops-dashboard.tsx`
- `/Users/hd/Developer/cortana-external/apps/mission-control/components/trading-ops/shared.tsx`
- `/Users/hd/Developer/cortana-external/backtester/operator_surfaces/runtime_health.py`

---

## API Changes

### [NEW] Internal DB contract - `mc_trading_runs`

| Field | Value |
|-------|-------|
| **API** | Postgres table contract |
| **Description** | Canonical latest-run state for Mission Control Trading Ops. |
| **Additional Notes** | Written by `cortana`, read by Mission Control. File artifacts remain audit/fallback evidence. |

| Field | Detail |
|-------|--------|
| **Authentication** | Internal DB credential only |
| **URL Params** | N/A |
| **Request** | N/A |
| **Success Response** | Mission Control reads the latest completed or active trading-run record with typed decision/delivery fields. |
| **Error Responses** | Missing table, schema mismatch, connection failure, or stale/no rows found. |

### [UPDATE] Internal runtime-health snapshot contract

| Field | Value |
|-------|-------|
| **API** | Runtime-health file/CLI contract |
| **Description** | Adds explicit `not_available` semantics and detail text for missing pre-open canary artifacts. |
| **Additional Notes** | Keeps current runtime health live while making missing-readiness cases operator-readable. |

| Field | Detail |
|-------|--------|
| **Authentication** | Internal only |
| **URL Params** | N/A |
| **Request** | N/A |
| **Success Response** | Current runtime payload with normalized pre-open gate status and detail text. |
| **Error Responses** | Runtime-service unreachable, malformed snapshot, or missing readiness artifact. |

---

## Process Changes

- `cortana` and `cortana-external` must treat the `mc_trading_runs` schema as a versioned contract.
- Rollout should begin in compare mode:
  - Mission Control reads DB and file paths side-by-side during validation
  - UI remains explicit when using fallback file artifacts
- Post-merge QA for Trading Ops must include:
  - live compute
  - live notify / Telegram
  - page refresh against the same run
  - screenshot or manual verification against `summary.json`

---

## Orchestration Changes

- Mission Control no longer infers current run truth by scanning file directories first.
- `cortana` becomes the writer of normalized latest-run state.
- Mission Control remains a read-only consumer of that run state.
- Runtime health stays in the existing service/snapshot lane.
- Supporting-context artifact reads remain available for debug views and controlled fallback.

---

## Resolved Design Questions

- Should Trading Ops go DB-only? No. Latest run state should be DB-backed, runtime health should stay live, and file artifacts should remain audit/debug evidence.
- Should Mission Control connect straight to DB? Yes, for trading-run state. That is the cleanest current-system fit.
- Should runtime health also move into DB? No, not for the first slice.
- Should the existing generic `Run` table be reused? No. Dedicated trading-run state is clearer and less brittle.
- Should stale workflow/cache artifacts remain on the page? Yes, but only as supporting context.

---

## Test Plan

Unit tests:

- Prisma/query helpers for latest trading run selection
- trading-run state writer transition tests in `cortana`
- runtime-health normalization tests for `not_available`
- UI state mapping tests for `ok`, `degraded`, `stale`, `missing`, `error`, and explicit fallback

Integration tests:

- compute writes a `running` then `success` DB row for the same `run_id`
- notify updates `delivery_status` and `notified_at` for the same row
- Mission Control prefers DB-backed run state over file scans when DB data is present
- Mission Control falls back explicitly when DB data is unavailable

Replay / regression tests:

- same run shown in DB and on disk stays consistent on decision/counts/timestamps
- runtime health with missing canary artifact renders `Canary not available`
- stale workflow/cache artifacts cannot overwrite the DB-backed latest run card

Manual validation:

- run a full compute + notify cycle and verify:
  - Telegram message received
  - latest run card matches `summary.json`
  - delivery timestamp matches `notifiedAt`
  - runtime card reflects current service state
  - supporting-context cards are visibly secondary
