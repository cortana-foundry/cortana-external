# Technical Specification - Polymarket V2 Trade Loop

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Owner(s) | Backtester / Polymarket V2 |
| Epic | Polymarket V2 Trade Loop |

---

## Development Overview

This implementation adds a preview-first Polymarket trade loop with strict ownership boundaries.

After the change:

- `external-service` owns Polymarket data access and order-preview boundaries
- Mission Control presents a read-only dossier and preview surface
- backtester owns artifact creation, run linkage, and Telegram formatting
- the LLM explains the deterministic scorecard but does not decide whether a trade can submit

V1 intentionally excludes live submit. The server must always fail closed rather than widening scope to execute an order.

---

## Data Storage Changes

### Database Changes

None for v1. The first release stores artifacts on disk and uses existing runtime services for source data.

### File Layout Changes

#### [NEW or UPDATE] `var/polymarket/`

| Constraints | Column Name | Column Type | Notes |
|-------------|-------------|-------------|-------|
| required | `run_id` | directory | Top-level run family namespace. |
| required | `market_id` | directory | One Polymarket candidate per dossier/preview lineage. |
| required | `dossier.json` | file | Read-only evidence packet. |
| required | `scorecard.json` | file | Deterministic rules output plus LLM explanation. |
| required | `preview.json` | file | Server-owned order preview result. |
| required | `telegram-summary.md` | file | Deterministic Telegram text render. |
| required | `postmortem.json` | file | Placeholder for later settlement outcome records. |

Notes:

- The run family must remain separate from stock-market run artifacts.
- Artifacts must be linked by `run_id`, `market_id`, and `linked_run_id` when relevant.
- Artifact writes should be atomic enough to survive process restarts without duplicate lineage.

### Artifact Contract Shapes

#### `PolymarketRunManifest`

| Field | Type | Notes |
|-------|------|-------|
| `runId` | string | Stable identifier for the Polymarket run lineage. |
| `marketId` | string | Polymarket market id or canonical slug. |
| `contractSlug` | string | Human-facing slug. |
| `linkedEquityRunId` | string \| null | Optional stock/regime linkage. |
| `createdAt` | string | ISO-8601 timestamp. |
| `status` | string | `draft`, `previewed`, `submitted` later, `settled` later. |
| `artifactPaths` | object | Paths for dossier, scorecard, preview, and summary artifacts. |

#### `PolymarketDossier`

| Field | Type | Notes |
|-------|------|-------|
| `marketId` | string | Source market. |
| `title` | string | Contract title. |
| `slug` | string | Event slug. |
| `state` | string | Tradeable state. |
| `bid` | number \| null | Current best bid. |
| `ask` | number \| null | Current best ask. |
| `last` | number \| null | Last trade price. |
| `spread` | number \| null | Ask minus bid. |
| `volume` | number \| null | Recent liquidity context. |
| `openInterest` | number \| null | Exposure context. |
| `rosterContext` | object | Relevant board or roster facts. |
| `equityProxies` | string[] | Linked stock/ETF proxies. |
| `facts` | string[] | Supporting facts. |
| `risks` | string[] | Invalidation and caution items. |
| `freshness` | object | Age, source, and degrade state. |

#### `PolymarketScorecard`

| Field | Type | Notes |
|-------|------|-------|
| `score` | number | Deterministic rank or confidence score. |
| `tier` | string | `pass`, `watch`, `small_starter`, `sized_conviction`. |
| `factors` | object[] | Named deterministic factors and values. |
| `blockingReasons` | string[] | Reasons the trade should not advance. |
| `llmSummary` | string \| null | Human-language explanation only. |
| `llmStatus` | string | `ok`, `degraded`, `missing`. |

#### `PolymarketPreview`

| Field | Type | Notes |
|-------|------|-------|
| `previewId` | string | Preview lineage id. |
| `eligible` | boolean | False if guardrails fail. |
| `blockedReasons` | string[] | Explicit fail-closed reasons. |
| `side` | string | Proposed side. |
| `sizeUsd` | number | Requested notional. |
| `maxPrice` | number \| null | Optional price cap. |
| `estimatedCostUsd` | number \| null | Calculated preview cost. |
| `feesUsd` | number \| null | Estimated fees. |
| `createdAt` | string | ISO-8601 timestamp. |

---

## Infrastructure Changes (if any?)

### SNS Topic Changes

None.

### SQS Queue Changes

None.

### Cache Changes

No new distributed cache is required for v1.

If local in-memory caching is used for UI preview polish, it must remain ephemeral and must not be treated as the source of truth.

### S3 Changes

None.

### Secrets Changes

None beyond existing Polymarket credentials already used by `external-service`.

### Network/Security Changes

The boundary is intentional:

- browser clients do not talk directly to execution APIs
- Mission Control may call server-side read/preview routes only
- `external-service` owns provider auth, preview validation, and any future execution path
- backtester writes the artifacts and formats Telegram output from those artifacts

---

## Behavior Changes

- Mission Control can request a Polymarket dossier and a server-owned order preview.
- The system must always show deterministic guardrail failures instead of hiding them behind a generic error.
- The LLM may summarize the scorecard, but the scorecard is computed deterministically before any LLM call.
- Live submit does not exist in v1. Any request path that would submit must fail closed or be omitted.
- Artifact lineage must be rooted under `var/polymarket` and linked to the upstream stock/regime context when available.
- Telegram summaries must be rendered from the stored artifacts, not from live ad hoc state.

Failure behavior:

- if dossier data is stale, mark the dossier degraded and block preview when required fields are too old
- if the LLM fails, keep the deterministic scorecard and suppress only the explanatory text
- if preview validation fails, return `eligible=false` with explicit blocked reasons
- if upstream Polymarket data is down, preserve the last good dossier with freshness metadata and a degraded tone

## Guardrails

These guardrails are enforced server-side and must fail closed.

| Guardrail | Initial Default | Notes |
|-----------|-----------------|-------|
| `live_submit_enabled` | `false` | v1 does not expose a live submit path. |
| `max_notional_usd` | `250` | Preview may calculate size, but the first release should stay small and reviewable. |
| `max_spread_pct` | `10` | Block obviously poor-liquidity candidates. |
| `min_liquidity_usd` | `10000` | Require enough depth for a meaningful preview. |
| `allowed_market_states` | `open` | Closed / suspended markets must not advance. |
| `max_dossier_age_minutes_market_hours` | `15` | Stale market facts should degrade fast during active hours. |
| `max_dossier_age_minutes_after_hours` | `60` | After-hours can stay readable longer, but not indefinitely. |
| `llm_can_authorize_trade` | `false` | The LLM may explain the scorecard only. |
| `preview_requires_linked_run` | `true` | Preview output should be traceable to a run lineage. |

## Failure Modes

- `external-service` Polymarket fetch failure:
  - dossier returns a degraded payload when partial facts exist
  - preview fails closed when required market facts are missing
- deterministic scorecard failure:
  - return the dossier and the blocking reason
  - do not synthesize a score from missing inputs
- LLM failure:
  - keep the scorecard and guardrail output
  - suppress only the explanation field
- artifact write failure:
  - do not claim the preview completed
  - surface a hard error and preserve any already-written upstream snapshots
- Telegram render failure:
  - preserve the artifact payload
  - mark the notification as failed rather than silently dropping it
- future live submit path accidentally exposed:
  - fail closed and block the route behind a separate approval doc / feature gate

---

## Application/Script Changes

This PR is doc-only. No application code is changed yet.

New files:

- `/Users/hd/Developer/cortana-external/backtester/docs/source/prd/prd-polymarket-v2-trade-loop.md`
  - Defines the v1 product scope and operator requirements.
- `/Users/hd/Developer/cortana-external/backtester/docs/source/techspec/techspec-polymarket-v2-trade-loop.md`
  - Defines the implementation contract, storage layout, boundaries, and tests.

Implementation targets for the future work:

- `external-service`
  - add Polymarket dossier and preview routes
  - keep all execution validation server-side
- `Mission Control`
  - present dossier and preview data only
  - do not own execution
- `backtester`
  - write Polymarket artifacts
  - render Telegram summaries
  - link Polymarket runs to existing regime context

LLM-agnostic implementation rule:

- the scorecard rules and guardrails must be deterministic code
- the LLM may only narrate the deterministic output
- submit permission must never be inferred from prompt wording

---

## API Changes

### [NEW or UPDATE] Polymarket dossier route

| Field | Value |
|-------|-------|
| **API** | `GET /polymarket/trade/dossier/:marketId` |
| **Description** | Returns a read-only dossier for one candidate contract. |
| **Additional Notes** | Server-side only; Mission Control should consume it from the backend, not the browser. |

| Field | Detail |
|-------|--------|
| **Authentication** | Existing internal service auth / same trust boundary as other Mission Control server calls. |
| **URL Params** | `marketId` |
| **Request** | None |
| **Success Response** | `PolymarketDossier` plus freshness and degrade metadata |
| **Error Responses** | `404` for unknown market, `503` for upstream data failure, degraded payload for partial data |

### [NEW or UPDATE] Polymarket order preview route

| Field | Value |
|-------|-------|
| **API** | `POST /polymarket/trade/preview` |
| **Description** | Validates a hypothetical order and returns a preview result without submitting it. |
| **Additional Notes** | This is the server-owned boundary. No live order entry in v1. |

| Field | Detail |
|-------|--------|
| **Authentication** | Same internal service auth as the dossier route. |
| **URL Params** | None |
| **Request** | `marketId`, `side`, `sizeUsd`, `maxPrice?`, `linkedRunId?`, `evidenceSnapshotId?` |
| **Success Response** | `PolymarketPreview` plus deterministic scorecard summary |
| **Error Responses** | `422` for guardrail blocks, `503` for upstream provider failure, `500` only for unexpected server failures |

No live submit API is defined for v1.

---

## Process Changes

- Operator flow becomes: dossier -> deterministic scorecard -> LLM explanation -> preview -> artifact write -> Telegram summary.
- The run lineage becomes a dedicated Polymarket family under `var/polymarket`.
- Future submit/cancel/close workflows are intentionally deferred until a separate approval doc exists.
- Mission Control stays presentation-only for this phase.

---

## Test Plan

Unit and integration coverage:

- `backtester` scorecard tests for deterministic tiering and factor calculation
- `backtester` Telegram formatter tests to verify artifact-driven message output
- `external-service` dossier/preview tests for guardrail enforcement and fail-closed behavior
- artifact lineage tests to ensure `var/polymarket` run ids and file names are stable
- LLM fallback tests to ensure deterministic scorecards still render when explanation generation fails

Manual or live validation:

- create a dossier for a live Polymarket candidate and inspect the stored artifact
- run a preview with a safe size and verify the preview record is written
- force a guardrail failure and verify the API returns an explicit blocked reason
- verify Telegram text is rendered from the stored artifact rather than live state

Success means:

- preview is possible without submit capability
- all outputs remain deterministic and traceable
- missing or stale upstream data degrades cleanly
- no code path can accidentally turn a v1 preview into a live order

---

## Risks / Open Questions

- exact numeric guardrail thresholds may need tuning after the first dry runs
- Polymarket market-to-equity proxy mappings may need curation as the roster evolves
- the next release will need a separate doc set for live submit, cancel, and close-position workflows
