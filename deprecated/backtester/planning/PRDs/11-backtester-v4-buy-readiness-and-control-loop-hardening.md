# Product Requirements Document (PRD) - Backtester V4 Buy Readiness And Control-Loop Hardening

**Document Status:** In Progress

## Team

| Role | Assignee |
|------|----------|
| Primary Owner | @hameldesai |
| Epic | BT-V4 Buy Readiness And Control-Loop Hardening |

---

## Problem / Opportunity

Backtester V4 has the right control-loop architecture, but advisory `BUY` output still needs a harder reliability boundary before the operator can treat it as a high-trust market signal. The current system can run scans, write artifacts, settle prediction records, and render Mission Control, but recent live inspection showed three trust gaps:

- a raw strategy can emit a `BUY` without proving that market data, scorecard, authority, and lifecycle state are all current
- alert copy can say calibration has no settled records while prediction accuracy artifacts contain settled records
- desired-state, actual-state, drift, and reconciliation artifacts can exist in code but become stale or missing at runtime if the lifecycle loop is not scheduled

The opportunity is to make `BUY` mean something stricter: not just "the scanner liked this setup," but "the setup passed current evidence, governance, market-data, and control-loop gates." This work does not need to prevent future automation from placing trades. It needs to make the advisory signal itself bulletproof enough that the operator can trust the label.

---

## Insights

- Reliability here is semantic, not only operational. A cron can succeed and still produce a low-trust `BUY` if evidence artifacts are stale or missing.
- Raw signal preservation matters. The system should keep raw `BUY` candidates for learning and review, then downgrade the final operator action when readiness gates fail.
- One readiness contract should own the answer. Scanners, Mission Control, and lifecycle jobs should not each invent their own definition of whether a `BUY` is allowed.

Problems this initiative is not intending to solve:

- broker execution or order placement safety
- proving a strategy has positive edge from scratch
- replacing V2/V3/V4 architecture
- building new strategy families
- changing the operator's final authority over trades

---

## Development Overview

Backtester V4 buy-readiness hardening adds a single readiness contract between raw strategy output and final operator-facing action. The system will evaluate market-data freshness, scorecard freshness, strategy authority, and lifecycle/control-loop freshness before allowing any final `BUY` label. If a raw strategy emits `BUY` but a hard gate fails, the final operator action is downgraded to `WATCH` with explicit `BUY_BLOCKED` reasons while the raw signal remains available for later learning.

The same work will make calibration display read from one source of truth and schedule the V4 lifecycle/control-loop refresh so desired-state, actual-state, drift, and reconciliation artifacts stay current before market-session scans.

This Development Overview must stay in sync with the matching Tech Spec.

---

## Success Metrics

Primary success metrics:

- `100%` of final operator-facing `BUY` outputs include a passing buy-readiness artifact.
- `0` final `BUY` outputs occur when market data, scorecard, authority, or lifecycle state is stale, missing, or degraded beyond policy.
- `100%` of raw `BUY` candidates blocked by readiness gates remain visible as raw signals with explicit downgrade reasons.
- Calibration text in alert messages and Mission Control matches the same prediction/calibration source artifact.
- V4 desired-state, actual-state, drift, and reconciliation artifacts are refreshed before the first market-session scan on every scheduled trading day.

Supporting success signals:

- Mission Control can show why a `BUY` was allowed or blocked without parsing prose logs.
- The daily cron digest can distinguish control-loop freshness failure from scanner failure.
- Tests cover both allowed and blocked `BUY` paths.

---

## Assumptions

- The operator is not asking this workstream to prevent broker execution.
- Advisory labels still matter because they shape operator trust and later training/evaluation artifacts.
- `WATCH` is the correct final downgrade for a raw `BUY` that fails a readiness gate, unless the raw setup itself is invalid.
- The first implementation should use artifact-first contracts and can add database persistence later.
- Existing V2/V3/V4 modules remain the substrate: opportunity score, authority tiers, risk budget, desired/actual state, drift monitor, and reconciliation.

---

## Out of Scope

- direct broker order placement
- new live-trading authority modes
- new strategy families
- major Mission Control redesign
- changing the 1-5 day signal horizon
- requiring positive 20-day evidence before any advisory signal can be recorded

---

## High Level Requirements

| Requirement | Description | Notes |
|-------------|-------------|-------|
| [Hard buy-readiness gate](#hard-buy-readiness-gate) | Final `BUY` must require current market data, current scorecard, non-empty authority, and current lifecycle/control-loop state. | Raw `BUY` can still be preserved. |
| [Transparent downgrade behavior](#transparent-downgrade-behavior) | Raw `BUY` candidates that fail gates become final `WATCH` with explicit blocker reasons. | Keeps learning data without overstating trust. |
| [Single calibration truth](#single-calibration-truth) | Alert copy, scorecards, and Mission Control must read settled-sample and calibration state from one contract. | Fixes mismatched "no settled records" messaging. |
| [Scheduled V4 control loop](#scheduled-v4-control-loop) | Desired-state, actual-state, drift, intervention, and reconciliation artifacts must be refreshed before scans. | Makes V4 live-current, not only implemented. |
| [Operator-visible readiness](#operator-visible-readiness) | Mission Control and artifacts must expose allowed/blocked state, blockers, source freshness, and timestamps. | No hidden gates. |

---

## Detailed User Stories

### Glossary

| Term | Meaning |
|------|---------|
| Raw action | The action emitted by a strategy before readiness gates are applied. |
| Final action | The operator-facing action after readiness gates are applied. |
| Buy readiness | The machine-readable decision that says whether a raw `BUY` may remain a final `BUY`. |
| Hard blocker | A missing/stale/degraded condition that must downgrade a raw `BUY`. |
| Calibration truth | The canonical settled-sample and confidence-readiness summary used by all messages and UI. |

---

### Hard Buy-Readiness Gate

| Status | User story | Notes |
|--------|------------|-------|
| Draft | As an operator, I want final `BUY` to require fresh market data so that stale history or degraded provider state cannot create false conviction. | Includes service readiness and quote/history freshness. |
| Draft | As an operator, I want final `BUY` to require a fresh scorecard so that stale strategy evidence cannot masquerade as current edge. | Scorecard age and health are hard inputs. |
| Draft | As a governance layer, I want final `BUY` to require a non-empty authority artifact for the strategy family so that unregistered or unevaluated families cannot receive high-trust labels. | Minimum tier is configurable; initial default is `limited_trust`. |
| Draft | As a control loop, I want final `BUY` to require current lifecycle artifacts so that desired/actual/reconciliation state participates in advisory trust. | Missing V4 artifacts block final `BUY`. |

---

### Transparent Downgrade Behavior

| Status | User story | Notes |
|--------|------------|-------|
| Draft | As a researcher, I want raw `BUY` candidates preserved when gates fail so that later analysis can distinguish signal quality from system-readiness quality. | Do not delete learning data. |
| Draft | As an operator, I want blocked `BUY` candidates downgraded to `WATCH` with exact `BUY_BLOCKED` reasons so that I can decide whether to inspect manually. | No vague "degraded" prose. |

---

### Single Calibration Truth

| Status | User story | Notes |
|--------|------------|-------|
| Draft | As an operator, I want alert calibration text to match prediction accuracy artifacts so that I do not see "no settled records" when settled records exist. | Current mismatch must be fixed. |
| Draft | As a maintainer, I want one calibration readiness loader so scanner messages, Mission Control, and scorecards cannot drift apart. | Source should include sample depth by horizon. |

---

### Scheduled V4 Control Loop

| Status | User story | Notes |
|--------|------------|-------|
| Draft | As an operator, I want desired-state, actual-state, drift, and reconciliation refreshed before market-session scans so that readiness gates use current control-loop truth. | Cron should run after precompute and before scans. |
| Draft | As a monitor, I want lifecycle refresh failures reported separately from scan failures so that operational diagnosis starts in the right place. | Prevents noisy scanner blame. |

---

### Operator-Visible Readiness

| Status | User story | Notes |
|--------|------------|-------|
| Draft | As an operator, I want Mission Control to show whether BUY is allowed, blocked, or warming so that the dashboard reflects the same gates as alerts. | UI should read artifacts, not recalculate from prose. |
| Draft | As a maintainer, I want every final action artifact to include raw action, final action, blockers, warnings, and source timestamps so that QA can audit decisions. | Machine first, prose second. |

---

## Appendix

### Resolved Decisions And Answered Questions

- A raw strategy `BUY` should not disappear when gates fail; it should become final `WATCH` with explicit blockers.
- Broker execution safety is out of scope for this workstream.
- The initial minimum authority for final `BUY` should be `limited_trust`, not necessarily `trusted`, so the system can remain useful while evidence matures.
- `5d` settled sample depth should be a readiness input, but the first implementation may use a warming/blocking threshold that is configurable while the dataset matures.
- If control-loop artifacts are missing or stale, final `BUY` is blocked even if market data is fresh.
- No open product questions remain for this planning pass.

### Technical Considerations

- The readiness contract should be artifact-first and later database-compatible.
- Alert text should be rendered from typed readiness/calibration artifacts, not from independently inferred prose.
- Hard gates should be tested at the boundary, not only inside individual scanners.
