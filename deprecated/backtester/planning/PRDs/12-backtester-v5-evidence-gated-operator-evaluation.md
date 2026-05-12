# Backtester V5 Evidence-Gated Operator Evaluation PRD

**Document Status:** Blocked Until W11 Evidence Passes  
**Owner:** Trading systems  
**Last Updated:** 2026-04-24  
**Depends On:** W11 Backtester V4 Buy Readiness And Control-Loop Hardening

## Purpose

W12 is the first post-hardening feature track. It must not start because the system merely has new ideas available. It starts only after W11 proves that final BUY semantics are reliable across real market sessions.

The goal is to add an operator evaluation layer that answers one question before expanding the system further:

> Did this signal deserve trust today, and what evidence or counterevidence supports that answer?

This layer should compare the collected readiness, calibration, lifecycle, and outcome data, then produce a compact evidence packet that a human or LLM can inspect before deciding whether W12 implementation should begin.

## Activation Rule

W12 is **not active work** until an LLM or operator reviews the W11 evidence bundle and explicitly records `v12_activation_decision: approved`.

A prompt like "compare the data and decide if we can start W12" should require the LLM to inspect the evidence bundle below. If evidence is insufficient, stale, or contradictory, the correct answer is `not_ready` with blocker reasons.

## Required Evidence Bundle

Before W12 can begin, collect at least:

- `buy_readiness_latest.json` history across live scans
- scanner artifacts containing `raw_action`, `final_action`, and `BUY_BLOCKED:*` reasons
- calibration readiness artifacts and settled accuracy reports
- desired-state, actual-state, reconciliation, release, and drift artifacts from the V4 control loop
- Mission Control Trading Ops snapshots showing current operator state
- daily notes on false blocks, missed blocks, stale artifacts, or confusing operator copy

## Minimum Start Criteria

W12 may start only when all of these are true:

| Criterion | Required Result |
| --- | --- |
| Market-data gate | No final BUY appears with stale, missing, degraded, or fallback-confused market data. |
| Scorecard gate | No final BUY appears without a fresh scorecard. |
| Authority gate | No final BUY appears without a non-empty authority artifact meeting the configured trust floor. |
| Lifecycle gate | No final BUY appears without current lifecycle/control-loop state. |
| Downgrade transparency | Raw BUY signals blocked by gates remain visible as final WATCH with explicit blocker reasons. |
| Calibration consistency | Operator messages and accuracy reports agree on settled-record availability. |
| Schedule freshness | V4 desired/actual/reconciliation artifacts refresh before market-session scans. |
| Operator clarity | Mission Control makes readiness, blockers, and provenance understandable without reading logs. |

Recommended evidence depth before approval:

- at least 10 complete market sessions after W11 ships, or
- at least 50 raw BUY opportunities, including blocked and allowed cases, whichever gives stronger coverage.

## Non-Goals

W12 does not add broker execution, automatic order placement, new strategy families, or capital-size escalation. Those remain separate decisions.

W12 also does not weaken W11 gates. If W12 needs richer analysis, it must consume the gated evidence rather than bypassing it.

## Product Requirements

### 1. Evidence Comparison Packet

The system should generate a compact packet for each candidate signal:

- raw strategy action
- final operator action
- gate status and blocker reasons
- calibration readiness
- lifecycle state
- recent settled outcome context
- counterarguments against trust
- missing or stale evidence warnings

### 2. LLM-Readable Start Assessment

The system should expose a deterministic assessment artifact that an LLM can compare:

```json
{
  "v12_activation_decision": "approved|not_ready",
  "confidence": "low|medium|high",
  "evidence_window": {
    "market_sessions": 0,
    "raw_buy_count": 0,
    "final_buy_count": 0,
    "blocked_buy_count": 0
  },
  "passed_criteria": [],
  "blockers": [],
  "recommended_next_step": "continue_shadow_observation|start_w12_docs|start_w12_implementation"
}
```

### 3. Human-Readable Operator Summary

Mission Control should eventually show why a signal earned or failed trust in plain operator language:

- what supports the signal
- what argues against it
- what changed since the prior scan
- what evidence is missing
- whether the recommendation is stable, improving, or deteriorating

### 4. No Silent Promotion

No component may promote W12 to active implementation based only on a passing test suite. Live or replayed evidence must be inspected and summarized.

## Success Metrics

- 100% of W12 activation decisions cite the evidence window used.
- 100% of `not_ready` decisions include concrete blockers.
- 0 W12 implementation tasks begin before W11 gates have passing evidence.
- Operator summaries distinguish evidence, counterevidence, and missing evidence.
- LLM review can reproduce the same activation decision from the saved artifact.

## Resolved Questions

**Should W12 start immediately after W11 is implemented?**  
No. W11 must run long enough to produce evidence across real scans.

**What should the LLM compare?**  
The LLM should compare readiness history, raw-vs-final action history, calibration artifacts, lifecycle/control-loop freshness, and operator snapshots.

**What if evidence is promising but thin?**  
Return `not_ready` and keep collecting. Thin evidence is not a failure; it just is not activation proof.

**Can W12 include future feature ideas?**  
Only after activation. Until then, this document is a gate, not a build plan.

## Exit Criteria For This Planning Doc

This document is complete when:

- W12 is listed in the planning index as blocked/future work.
- The activation rule is explicit.
- The evidence bundle is clear enough for an LLM to evaluate later.
- There are no open questions left inside the doc.
