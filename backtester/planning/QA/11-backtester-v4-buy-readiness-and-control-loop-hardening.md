# QA Plan - Backtester V4 Buy Readiness And Control-Loop Hardening

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Owner(s) | @hameldesai |
| Epic | BT-V4 Buy Readiness And Control-Loop Hardening |
| PRD | [11-backtester-v4-buy-readiness-and-control-loop-hardening.md](../PRDs/11-backtester-v4-buy-readiness-and-control-loop-hardening.md) |
| Tech Spec | [11-backtester-v4-buy-readiness-and-control-loop-hardening.md](../TechSpecs/11-backtester-v4-buy-readiness-and-control-loop-hardening.md) |
| Implementation Plan | [11-backtester-v4-buy-readiness-and-control-loop-hardening.md](../Implementation/11-backtester-v4-buy-readiness-and-control-loop-hardening.md) |

---

## QA Goal

Verify that final operator-facing `BUY` labels are only emitted when the system has current market data, current evidence, current authority, and current V4 control-loop state.

This QA plan proves:

1. raw `BUY` signals are preserved for learning
2. final `BUY` is blocked when trust gates fail
3. calibration messaging has one source of truth
4. desired-state, actual-state, drift, and reconciliation artifacts stay current on schedule
5. Mission Control shows the same readiness truth as alerts

---

## Scope

In scope:

- buy-readiness hard gates
- raw action vs final action behavior
- calibration-readiness display truth
- V4 lifecycle/control-loop scheduled refresh
- Mission Control readiness visibility

Out of scope:

- broker execution safety
- new strategy-family evaluation
- changing the prediction horizon
- requiring full 20-day maturity before advisory operation

---

## QA Matrix

| Area | Scenario | Expected Result |
|------|----------|-----------------|
| Market data gate | Raw `BUY` with market-data service unavailable | Final action is `WATCH`; blocker includes `BUY_BLOCKED:market_data_unavailable`. |
| Market data gate | Raw `BUY` with stale quote/history evidence | Final action is `WATCH`; blocker identifies stale source and age. |
| Scorecard gate | Raw `BUY` with missing scorecard | Final action is `WATCH`; blocker includes `BUY_BLOCKED:scorecard_missing`. |
| Scorecard gate | Raw `BUY` with stale scorecard | Final action is `WATCH`; blocker includes `BUY_BLOCKED:scorecard_stale`. |
| Authority gate | Raw `BUY` with empty authority artifact | Final action is `WATCH`; blocker includes `BUY_BLOCKED:authority_missing`. |
| Authority gate | Raw `BUY` with strategy below minimum tier | Final action is `WATCH`; blocker includes `BUY_BLOCKED:authority_tier_insufficient`. |
| Lifecycle gate | Raw `BUY` with missing desired/actual/reconciliation artifacts | Final action is `WATCH`; blocker includes `BUY_BLOCKED:control_loop_missing`. |
| Lifecycle gate | Reconciliation has `hold_rollout` or `reduce_authority` | Final action is `WATCH`; blocker includes the active action. |
| Happy path | Raw `BUY` with all gates passing | Final action remains `BUY`; readiness artifact has `buy_allowed=true`. |
| Calibration | Prediction accuracy has settled records | Alert/UI calibration text does not say `no settled records yet`. |
| Scheduling | Pre-scan control-loop refresh runs after precompute | V4 artifacts are fresh before first market-session scan. |
| Mission Control | Blocked BUY is loaded in UI | UI shows raw `BUY`, final `WATCH`, and blocker reasons. |

---

## Required Automated Coverage

Add or update tests around these areas when implementation starts:

- `backtester/readiness/buy_readiness.py`
- `backtester/evaluation/calibration_readiness.py`
- `backtester/strategy_alert_pipeline.py`
- `backtester/tests/test_strategy_alert_payloads.py`
- `backtester/tests/test_control_loop_v4.py`
- `tests/cron/trading-alert-scan-routing.test.ts` in `cortana`
- `apps/mission-control` Trading Ops loader and smoke tests

Suggested test cases:

- raw `BUY` plus every individual hard blocker
- raw `BUY` plus all gates passing
- raw `WATCH` remains `WATCH` without requiring BUY readiness
- calibration readiness reflects nonzero settled records
- lifecycle refresh writes desired/actual/drift/reconciliation with no alert JSON
- cron ordering preserves precompute -> control-loop refresh -> scan

---

## Manual / Live Validation

### Scenario 1 - Blocked BUY Drill

Setup:

- create or replay a raw `BUY` fixture
- remove or stale one readiness source, such as authority or scorecard

Checks:

- inspect strategy alert payload
- inspect buy-readiness artifact
- inspect Mission Control Trading Ops

Success:

- raw action is `BUY`, final action is `WATCH`, blocker is explicit, and no surface shows final `BUY`.

---

### Scenario 2 - Happy Path BUY Drill

Setup:

- use fixtures or a controlled run where market data, scorecard, authority, and lifecycle artifacts are fresh
- strategy emits raw `BUY`

Checks:

- inspect final alert payload
- inspect readiness artifact
- inspect prediction snapshot provenance

Success:

- final action remains `BUY`, `buy_allowed=true`, and evidence timestamps are current.

---

### Scenario 3 - Calibration Truth Cross-Check

Setup:

- run `uv run python prediction_accuracy_report.py`
- inspect prediction accuracy report and calibration readiness report

Checks:

- compare settled record counts
- inspect alert message calibration line
- inspect Mission Control calibration display

Success:

- all three surfaces tell the same settled-sample story.

---

### Scenario 4 - Scheduled Control-Loop Freshness

Setup:

- run the new control-loop refresh wrapper after trading precompute
- open Trading Ops before the first market-session scan

Checks:

- desired-state, actual-state, drift, intervention, and reconciliation artifacts exist
- generated timestamps are within the configured freshness window
- readiness gate sees lifecycle as current

Success:

- scans have current V4 control-loop truth before evaluating final BUY.

---

## Acceptance Criteria

The release is QA-complete when all of the following are true:

- `100%` of final `BUY` outputs have `buy_allowed=true` in a current readiness artifact
- `0` final `BUY` outputs occur with missing/stale market-data, scorecard, authority, or lifecycle evidence
- `100%` of blocked raw `BUY` fixtures preserve raw action and emit final `WATCH` with blocker reasons
- calibration display matches prediction accuracy settled-record state in alerts and Mission Control
- scheduled control-loop refresh creates fresh desired/actual/drift/reconciliation artifacts before market-session scans
- Mission Control smoke checks fail when readiness artifacts are missing or stale

---

## Release Risks To Watch

- Over-blocking could hide useful advisory signals if raw/final action is not displayed clearly.
- Calibration could remain duplicated if old message paths keep fallback prose.
- Lifecycle refresh could become stale again if cron succeeds but the Python cycle silently skips writes.
- Mission Control could flatten raw and final action, recreating operator confusion.

---

## Sign-Off Checklist

- [ ] Buy-readiness unit tests added
- [ ] Calibration-readiness unit tests added
- [ ] Strategy alert payload tests updated
- [ ] Cron ordering test added
- [ ] Lifecycle no-alert refresh test added
- [ ] Mission Control loader/smoke tests updated
- [ ] Manual blocked BUY drill completed
- [ ] Manual happy path BUY drill completed
- [ ] Calibration truth cross-check completed
- [ ] Scheduled control-loop freshness verified
