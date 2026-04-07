# Implementation Plan - Trading Ops Live State And Operator Truth

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Owner(s) | TBD |
| Epic | BT-W7 Trading Ops Live State And Operator Truth |
| Tech Spec | [07-trading-ops-live-state-and-operator-truth.md](../TechSpecs/07-trading-ops-live-state-and-operator-truth.md) |
| PRD | [07-trading-ops-live-state-and-operator-truth.md](../PRDs/07-trading-ops-live-state-and-operator-truth.md) |

---

## Dependency Map

| Vertical | Dependencies | Can Start? |
|----------|-------------|------------|
| V1 — Trading-run DB contract | None | Start Now |
| V2 — `cortana` trading-run DB writer | V1 | Start after V1 |
| V3 — Mission Control DB-first Trading Ops loader | V1, V2 | Start after V1, V2 |
| V4 — Runtime truth and fallback semantics | V1 | Start after V1 |
| V5 — Compare mode, QA, and rollout hardening | V2, V3, V4 | Start after V2, V3, V4 |

---

## Recommended Execution Order

```text
Sprint 1: V1
Sprint 2: V2 + V4
Sprint 3: V3
Sprint 4: V5
```

---

## Sprint 1 — Contract First

### Vertical 1 — Trading-run DB Contract

**cortana-external: add the canonical DB schema that Mission Control will read and `cortana` will write**

*Dependencies: None*

#### Jira

- Sub-task 1: Add `mc_trading_runs` to `/Users/hd/Developer/cortana-external/apps/mission-control/prisma/schema.prisma` with typed decision, counts, delivery, and artifact-reference fields.
- Sub-task 2: Create the matching Prisma migration and any lightweight query helpers needed to fetch the latest trading run.
- Sub-task 3: Document the write contract, including required fields on create, complete, fail, and notify transitions.
- Sub-task 4: Update `/Users/hd/Developer/cortana-external/backtester/planning/README.md` so the workstream is discoverable and properly linked.

#### Testing

- Migration applies cleanly on a local Mission Control database.
- Latest-run query returns the correct row by `completed_at` / active-state precedence.
- Missing optional fields do not break reads for pending or failed runs.

---

## Sprint 2 — Writer And Truth Semantics

### Vertical 2 — `cortana` Trading-run DB Writer

**cortana: persist run lifecycle state directly into Mission Control Postgres**

*Dependencies: V1*

#### Jira

- Sub-task 1: Add a small run-state writer helper in `cortana` that can upsert `mc_trading_runs` by `run_id`.
- Sub-task 2: Update the compute pipeline to write `queued/running/success/failed` transitions, counts, and artifact paths as the run evolves.
- Sub-task 3: Update the notify pipeline to write `delivery_status`, `notified_at`, and latest notify failure summary.
- Sub-task 4: Add configuration handling for `MISSION_CONTROL_DATABASE_URL` and clear startup errors when it is missing.
- Sub-task 5: Preserve file artifact writes as the audit trail; the DB write path must not replace `summary.json`, `message.txt`, or `watchlist-full.json`.

#### Testing

- A successful compute writes one DB row with the same decision/counts as `summary.json`.
- A failed compute writes `status=failed` and a useful `last_error`.
- A successful notify updates the same row with `delivery_status=notified` and `notified_at`.
- File artifacts remain unchanged and complete even if DB writes fail.

---

### Vertical 4 — Runtime Truth And Fallback Semantics

**backtester + Mission Control: make live runtime state and missing-data language explicit**

*Dependencies: V1*

#### Jira

- Sub-task 1: Update `/Users/hd/Developer/cortana-external/backtester/operator_surfaces/runtime_health.py` to normalize missing readiness artifacts as `not_available` with an explanatory detail string.
- Sub-task 2: Update Mission Control Trading Ops loader state mapping so it distinguishes `stale`, `missing`, `error`, and `not available` instead of collapsing them into vague `unknown` or `degraded`.
- Sub-task 3: Ensure supporting-context cards can carry `stale` badge text without changing the underlying severity mapping for true live degradations.

#### Testing

- Missing pre-open canary artifact renders `Canary not available`.
- Live provider cooldown still renders as a real degradation.
- Supporting-context cards can render `stale` without breaking other badge variants.

---

## Sprint 3 — Consumer Reframe

### Vertical 3 — Mission Control DB-first Trading Ops Loader

**cortana-external: make Trading Ops read DB-backed latest-run state first and demote stale artifacts**

*Dependencies: V1, V2*

#### Jira

- Sub-task 1: Add DB-backed latest trading run queries to `/Users/hd/Developer/cortana-external/apps/mission-control/lib/trading-ops.ts`.
- Sub-task 2: Reframe top-level cards in `/Users/hd/Developer/cortana-external/apps/mission-control/components/trading-ops-dashboard.tsx` so latest run + delivery + live runtime are the primary operator facts.
- Sub-task 3: Move workflow/cache-derived fields into supporting-context or details sections when they are older than the latest DB-backed run.
- Sub-task 4: Make file-artifact fallback explicit in card copy and/or badge text when DB-backed run state is unavailable.
- Sub-task 5: Keep raw run ids accessible as secondary metadata for debugging.

#### Important Planning Notes

- The page should not silently switch sources.
- Primary cards should each have one owner:
  - latest run -> DB
  - runtime health -> live runtime source
  - historical workflow/cache -> supporting context

#### Testing

- When DB-backed run state exists, the latest run card matches the DB record even if local workflow/cache artifacts are older.
- When DB is unavailable, the UI says it is using file fallback.
- Human-readable timestamps remain the primary label while raw ids stay inspectable.

---

## Sprint 4 — Compare Mode, QA, And Rollout

### Vertical 5 — Compare Mode, QA, And Rollout Hardening

**cortana + cortana-external: validate the new source-of-truth split before fully trusting it**

*Dependencies: V2, V3, V4*

#### Jira

- Sub-task 1: Add compare-mode logging or assertions that the DB-backed latest run and file artifacts agree on decision/counts/timestamps during rollout.
- Sub-task 2: Add end-to-end tests or scripted checks that run compute + notify and then validate Mission Control against the same run.
- Sub-task 3: Document operator QA steps for:
  - fresh compute
  - Telegram receipt
  - Trading Ops screenshot validation
  - fallback-state validation when DB or canary artifacts are missing
- Sub-task 4: Decide whether historical backfill is needed for a minimal useful lookback window; if not, document that only new runs are guaranteed DB-backed.

#### Testing

- Full live run + notify cycle still succeeds under provider cooldown/degraded-safe conditions.
- Trading Ops shows the same latest run that Telegram just delivered.
- Compare-mode mismatches are observable before fallback paths are trusted.

---

## Dependency Notes

### V1 before V2 and V3

The DB schema and write contract must exist before either `cortana` can write state or Mission Control can consume it.

### V2 before V3

Mission Control cannot truthfully switch to DB-first latest-run cards until `cortana` is writing those rows reliably.

### V4 before V5

QA and rollout need the final state semantics in place, especially for missing canary artifacts and stale supporting-context cards.

---

## Scope Boundaries

### In Scope (This Plan)

- DB-backed latest trading run state
- direct DB writes from `cortana`
- DB-first Mission Control Trading Ops latest-run reads
- live runtime-health retention as a separate source
- explicit stale/fallback/missing semantics
- compare-mode rollout and end-to-end QA

### External Dependencies

- local Mission Control Postgres remains available and writable from `cortana`
- existing trading artifact writer in `cortana` remains the durable audit source
- existing runtime-health service/snapshot path remains available for live reads

### Integration Points

- `/Users/hd/Developer/cortana/tools/trading/*`
- `/Users/hd/Developer/cortana/var/backtests/runs/*`
- `/Users/hd/Developer/cortana-external/apps/mission-control/prisma/schema.prisma`
- `/Users/hd/Developer/cortana-external/apps/mission-control/lib/trading-ops.ts`
- `/Users/hd/Developer/cortana-external/backtester/operator_surfaces/runtime_health.py`

---

## Realistic Delivery Notes

- **Biggest risks:** cross-repo schema drift; DB writer failures creating split-brain between DB and file artifacts; ambiguous fallback behavior if compare mode is skipped.
- **Assumptions:** same-machine deployment continues; Postgres is the right store for current-state run metadata; runtime health stays live-read; historical backfill is optional for first useful release.

