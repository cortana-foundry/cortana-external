# Implementation Plan - Backtester V4 Buy Readiness And Control-Loop Hardening

**Document Status:** In Progress

## Team

| Role | Assignee |
|------|----------|
| Owner(s) | @hameldesai |
| Epic | BT-V4 Buy Readiness And Control-Loop Hardening |
| Tech Spec | [11-backtester-v4-buy-readiness-and-control-loop-hardening.md](../TechSpecs/11-backtester-v4-buy-readiness-and-control-loop-hardening.md) |
| PRD | [11-backtester-v4-buy-readiness-and-control-loop-hardening.md](../PRDs/11-backtester-v4-buy-readiness-and-control-loop-hardening.md) |

---

## Dependency Map

| Vertical | Dependencies | Can Start? |
|----------|-------------|------------|
| V1 - Calibration readiness source of truth | Existing prediction accuracy reports | Start Now |
| V2 - Buy-readiness contract | Existing scorecard, authority, lifecycle artifacts | Start Now |
| V3 - Scanner integration and downgrade behavior | V1, V2 | Start after V1/V2 |
| V4 - Scheduled V4 control-loop refresh | Existing lifecycle cycle and cron config | Start after V2 |
| V5 - Mission Control and QA visibility | V1, V2, V3, V4 | Start after V1-V4 |

---

## Recommended Execution Order

```text
Sprint 1: V1 + V2
Sprint 2: V3 + V4
Sprint 3: V5 + live QA drill
```

---

## Sprint 1 - Readiness Contracts

### Vertical 1 - Calibration Readiness Source Of Truth

**cortana-external backtester: make settled-sample and calibration display state canonical**

*Dependencies: Existing prediction accuracy reports*

#### Jira

- [ ] Sub-task 1: Add `backtester/evaluation/calibration_readiness.py` with a loader for `.cache/prediction_accuracy/reports/prediction-accuracy-latest.json`.
- [ ] Sub-task 2: Emit `.cache/prediction_accuracy/reports/calibration-readiness-latest.json` from `backtester/prediction_accuracy_report.py`.
- [ ] Sub-task 3: Replace alert-message calibration text that says `no settled records yet` with the canonical display line from calibration readiness.

#### Testing

- Settled records in prediction accuracy produce non-empty calibration display state.
- Missing prediction reports produce `calibration_state=unavailable`.
- Alert text and report artifact agree on settled record count.

---

### Vertical 2 - Buy-Readiness Contract

**cortana-external backtester: centralize final BUY permission into one deep module**

*Dependencies: Existing scorecard, authority, lifecycle artifacts*

#### Jira

- [ ] Sub-task 1: Add `backtester/readiness/buy_readiness.py` with `evaluate_buy_readiness(...)`.
- [ ] Sub-task 2: Load evidence from market-data readiness, strategy scorecard, strategy authority, desired state, actual state, drift monitor, intervention events, and reconciliation actions.
- [ ] Sub-task 3: Write `.cache/trade_lifecycle/buy_readiness_latest.json` with raw action, final action, blockers, warnings, and evidence.

#### Testing

- Each hard blocker independently downgrades raw `BUY` to final `WATCH`.
- All gates passing allows final `BUY`.
- Raw non-BUY actions are preserved and do not require BUY readiness.

---

## Sprint 2 - Enforcement And Scheduling

### Vertical 3 - Scanner Integration And Downgrade Behavior

**cortana-external backtester: apply readiness after raw strategy output and before operator payloads**

*Dependencies: V1, V2*

#### Jira

- [ ] Sub-task 1: Update `backtester/strategy_alert_pipeline.py` to apply buy readiness to strategy alert records.
- [ ] Sub-task 2: Ensure `backtester/canslim_alert.py` and `backtester/dipbuyer_alert.py` emit `raw_action`, `final_action`, `buy_readiness`, and blocker fields.
- [ ] Sub-task 3: Update `backtester/advisor.py` and `backtester/operator_surfaces/mission_control.py` so operator surfaces consume final action while preserving raw action.

#### Important Planning Notes

- Do not delete raw `BUY` candidates.
- Do not make the scanner fail just because BUY readiness blocks final BUY.
- Use `BUY_BLOCKED:<reason>` machine codes so downstream tests and UI do not parse prose.

#### Testing

- Strategy payload fixture with stale scorecard produces raw `BUY`, final `WATCH`, and blocker reason.
- Strategy payload fixture with current evidence produces final `BUY`.
- Prediction snapshots keep raw/final action provenance for later learning.

---

### Vertical 4 - Scheduled V4 Control-Loop Refresh

**cortana + cortana-external: keep desired/actual/reconciliation artifacts current before scans**

*Dependencies: V2*

#### Jira

- [ ] Sub-task 1: Add `/Users/hd/Developer/cortana/tools/trading/run-trading-control-loop-refresh.sh` to run the non-mutating lifecycle/control-loop refresh.
- [ ] Sub-task 2: Update `/Users/hd/Developer/cortana/config/cron/jobs.json` with a weekday pre-scan refresh after trading precompute.
- [ ] Sub-task 3: Ensure `backtester/trade_lifecycle_cycle.py --review-only` or equivalent writes desired state, actual state, drift monitor, intervention events, and reconciliation actions even when no alert JSON is provided.

#### Testing

- Cron contract test proves ordering: precompute before control-loop refresh before market-session scan.
- Lifecycle refresh creates all required V4 artifacts from an empty/no-alert run.
- Failure is surfaced as control-loop freshness failure, not scanner failure.

---

## Sprint 3 - Operator Truth And QA

### Vertical 5 - Mission Control And QA Visibility

**cortana-external Mission Control: show the same readiness truth used by alerts**

*Dependencies: V1, V2, V3, V4*

#### Jira

- [ ] Sub-task 1: Update `apps/mission-control/lib/trading-ops-contract.ts` with buy-readiness and calibration-readiness types.
- [ ] Sub-task 2: Update `apps/mission-control/lib/trading-ops.ts` to load readiness artifacts and surface blockers.
- [ ] Sub-task 3: Update `apps/mission-control/components/trading-ops-dashboard.tsx` to display BUY allowed/blocked/warming state and calibration truth.
- [ ] Sub-task 4: Extend `apps/mission-control/scripts/check-trading-ops-smoke.ts` to assert readiness artifact presence and freshness.

#### Testing

- Loader tests cover missing, stale, blocked, and allowed readiness artifacts.
- UI tests show blocked BUY reason without conflating raw and final action.
- Smoke test fails when V4 control-loop artifacts are missing or stale.

---

## Dependency Notes

### V1 before V3

Scanner copy cannot be fixed safely until calibration display has one canonical source.

### V2 before V3/V4

Scanner enforcement and cron smoke checks need the readiness contract before they can evaluate pass/fail.

### V4 before V5 live QA

Mission Control should show live-current control-loop artifacts, not static files from an old lifecycle run.

---

## Scope Boundaries

### In Scope (This Plan)

- buy-readiness artifact and hard gates
- raw action vs final action provenance
- calibration-readiness artifact
- scanner payload integration
- scheduled V4 lifecycle/control-loop refresh
- Mission Control readiness visibility
- automated and manual QA coverage

### External Dependencies

- `cortana` owns cron job definitions and wrapper scripts.
- `cortana-external` owns backtester logic and Mission Control surfaces.
- `external-service` owns market-data readiness endpoints.

### Integration Points

- `backtester/strategy_alert_pipeline.py`
- `backtester/canslim_alert.py`
- `backtester/dipbuyer_alert.py`
- `backtester/prediction_accuracy_report.py`
- `backtester/trade_lifecycle_cycle.py`
- `backtester/operator_surfaces/mission_control.py`
- `/Users/hd/Developer/cortana/tools/trading/*`
- `/Users/hd/Developer/cortana/config/cron/jobs.json`
- `apps/mission-control/lib/trading-ops.ts`
- `apps/mission-control/components/trading-ops-dashboard.tsx`

---

## Realistic Delivery Notes

- **Biggest risks:** over-blocking useful advisory signals, letting raw/final action semantics drift, and creating another calibration source instead of removing duplication.
- **Assumptions:** artifact-first implementation is enough for the first pass; database persistence can wait; final `WATCH` is the right downgrade for blocked raw `BUY`.
- **Smallest credible path:** implement readiness artifacts and scanner downgrade first, then schedule lifecycle refresh, then add Mission Control polish.
