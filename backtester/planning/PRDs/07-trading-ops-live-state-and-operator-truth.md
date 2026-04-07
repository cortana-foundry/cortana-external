# Product Requirements Document (PRD) - Trading Ops Live State And Operator Truth

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Primary Owner | TBD |
| Epic | BT-W7 Trading Ops Live State And Operator Truth |

---

## Problem / Opportunity

Mission Control Trading Ops is becoming the operator's primary window into the trading system, but the page still has to reconcile multiple kinds of truth:

- completed trading-run artifacts written by `cortana`
- live runtime and watchdog state produced by `cortana-external`
- older workflow/cache artifacts that are useful for debugging but bad as primary state

That mix creates two operator problems:

1. the page can feel stale or contradictory even when the underlying system is behaving correctly
2. when something is actually degraded, the page can fail to explain whether the degradation is current, historical, or just missing context

The opportunity is to make Trading Ops trustworthy as a live operator surface without throwing away the existing artifact model that already works well for auditability and replay.

---

## Insights

- The latest trading run and Telegram delivery status are already durable and trustworthy; the main gap is that Mission Control does not treat them as the canonical current-state source.
- Runtime health is genuinely live and should stay live; pushing every transient health fact through file artifacts or delayed DB mirrors would reduce truthfulness rather than improve it.
- Historical workflow/cache artifacts are still useful, but they should be supporting context, not the first thing the operator has to mentally correct.

Problems this workstream is not intending to solve:

- replacing file artifacts as the durable audit trail
- building a brand-new dashboard outside Mission Control
- storing every live runtime event in the database before the core current-state model is stable

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

This Development Overview must stay in sync with the matching Tech Spec.

---

## Success Metrics

- Trading Ops top-level cards derive from:
  - DB-backed latest trading run state
  - live runtime health
  - explicit fallback status when either source is unavailable
- The page never silently falls back from DB to file-based state without saying so.
- The operator can answer the following from one page without cross-checking shell output:
  - what was the latest trading run
  - did it notify Telegram
  - what was the decision/counts
  - is the live runtime healthy right now
  - is any older market/workflow data only supporting context
- Raw run ids stop being the primary human-facing identifier on Trading Ops.
- A full end-to-end compute + notify QA cycle can be run and validated against the same Trading Ops page state.

---

## Assumptions

- Mission Control will continue to use Postgres as its structured state store.
- `cortana` can be given a DB connection string for writing normalized trading-run state.
- Trading-run artifacts on disk remain the audit trail and source of replay/debugging.
- Runtime health should remain live-read from the service/runtime snapshot path rather than being fully DB-mediated.
- It is acceptable for Trading Ops to be hybrid as long as source ownership and fallback state are explicit.

---

## Out of Scope

- full database modeling of every backtester artifact family
- replacing the current runtime-health snapshot flow with a DB-only system
- broad UI redesign outside the Trading Ops surface
- historical backfill of every past run beyond what is needed for safe rollout and spot validation

---

## High Level Requirements

| Requirement | Description | Notes |
|-------------|-------------|-------|
| Canonical latest trading run state | Trading Ops must use a DB-backed, normalized trading-run record as the primary source for latest run status, counts, delivery state, and operator-readable timestamps. | No raw-id-first UI. |
| Live runtime current state | Trading Ops must continue to read runtime health from live service/runtime sources and render missing canary/runtime data explicitly. | Current health should not depend on a delayed mirror. |
| Supporting context separation | Historical workflow/cache artifacts must be clearly demoted to supporting context or fallback state. | No stale primary cards. |
| Explicit fallback/error semantics | The UI must distinguish `ok`, `degraded`, `stale`, `missing`, `error`, and `fallback` conditions without silent inference. | Trust comes from explicit provenance. |
| Cross-repo write/read contract | `cortana` and `cortana-external` must share a versioned contract for trading-run state so DB writes and UI reads cannot silently drift. | Same-machine pragmatism, explicit contract. |

---

## Detailed User Stories

### Glossary

| Term | Meaning |
|------|---------|
| Trading-run state | The normalized DB record that represents the current/latest trading run from compute through Telegram delivery. |
| Supporting context | Older workflow/cache artifacts that are still useful for debugging but not primary operator truth. |
| Live runtime health | Current market-data/provider/runtime state fetched from service/runtime-health sources. |
| Silent fallback | The UI using an older or secondary source without explicitly telling the operator. |

---

### Canonical Latest Trading Run State

| Status | User story | Notes |
|--------|------------|-------|
| Draft | As an operator, I want the latest run card to reflect the run that actually completed and notified so that I do not have to inspect artifact directories manually. | Includes completedAt and notifiedAt. |
| Draft | As an operator, I want human-readable run timestamps instead of raw run ids as the primary label so that I can read the page quickly under time pressure. | Raw ids remain available secondarily. |

---

### Live Runtime Current State

| Status | User story | Notes |
|--------|------------|-------|
| Draft | As an operator, I want the runtime card to tell me what is happening now, not what a prior run knew, so that current provider cooldowns or recoveries are obvious. | Must stay live-read. |
| Draft | As an operator, I want missing readiness artifacts to say `canary not available` instead of `unknown` so that I know the actual gap. | No vague status words. |

---

### Supporting Context Separation

| Status | User story | Notes |
|--------|------------|-------|
| Draft | As an operator, I want stale market/workflow artifacts clearly labeled as historical context so that I do not mistake them for live state. | `stale` is acceptable; `degraded` is misleading here. |
| Draft | As a maintainer, I want historical artifacts preserved but demoted in the UI so that we keep auditability without polluting the top-level operator read path. | Keep debug value, remove ambiguity. |

---

### Explicit Fallback And Error Semantics

| Status | User story | Notes |
|--------|------------|-------|
| Draft | As an operator, I want the page to say when it is using fallback data so that I know how much to trust what I am seeing. | No silent fallback. |
| Draft | As a maintainer, I want missing DB, missing files, missing canary artifacts, and live runtime failures to produce distinct states so that troubleshooting starts from the right source. | Required for trustworthy ops. |

---

## Appendix

### Additional Considerations

- The goal is not “DB for everything.” The goal is “canonical live run truth plus live runtime truth.”
- File artifacts remain necessary because they are the easiest way to preserve exact run evidence and replay/debugging context.
- The operator surface should optimize for truthful current state first, and exhaustive historical detail second.

### User Research

Recent operator feedback was consistent:

- Mission Control is the operator's eyes into the system.
- Raw run ids are noisy and hard to parse quickly.
- `unknown` is not acceptable when the system knows why data is missing.
- A stale support artifact should not wear the same badge as a live degradation.
- The page must line up with the Telegram message and the actual run artifact for the same execution.

### Open Questions

None blocking for this workstream. The main design questions are resolved in the Tech Spec:

- DB-only vs hybrid model: hybrid
- direct DB writes vs API ingestion for run state: direct DB writes for now
- generic run table vs dedicated trading-run table: dedicated trading-run table
- runtime health through DB vs live read: live read

### Collaboration Topics

- `cortana` must own the trading-run DB write path.
- `cortana-external` / Mission Control must own the DB schema, loader semantics, and fallback rendering rules.
- Any DB credential used by `cortana` must be provisioned and documented as a deliberate integration point, not an implicit local assumption.

### Technical Considerations

- The UI cannot be “1000% the system” if it silently mixes sources; it can be operationally trustworthy if every primary card has one owner and every fallback is explicit.
- Compare-only rollout is preferred first: DB path and file path should be cross-checked before the file path is fully demoted in the UI.
