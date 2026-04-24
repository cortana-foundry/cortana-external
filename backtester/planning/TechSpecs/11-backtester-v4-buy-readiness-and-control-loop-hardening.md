# Technical Specification - Backtester V4 Buy Readiness And Control-Loop Hardening

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Owner(s) | @hameldesai |
| Epic | BT-V4 Buy Readiness And Control-Loop Hardening |

---

## Development Overview

Backtester V4 buy-readiness hardening adds a single readiness contract between raw strategy output and final operator-facing action. The system will evaluate market-data freshness, scorecard freshness, strategy authority, and lifecycle/control-loop freshness before allowing any final `BUY` label. If a raw strategy emits `BUY` but a hard gate fails, the final operator action is downgraded to `WATCH` with explicit `BUY_BLOCKED` reasons while the raw signal remains available for later learning.

The same work will make calibration display read from one source of truth and schedule the V4 lifecycle/control-loop refresh so desired-state, actual-state, drift, and reconciliation artifacts stay current before market-session scans.

This Development Overview must stay in sync with the matching PRD.

---

## Data Storage Changes

### Database Changes

No database migration is required for the first implementation. This work should be artifact-first, matching the existing backtester V2/V3/V4 contract style.

Future database persistence can map the artifact contracts below into Mission Control tables after the behavior is stable.

### File / Artifact Changes

#### [NEW] `.cache/trade_lifecycle/buy_readiness_latest.json`

| Field | Type | Notes |
|-------|------|-------|
| artifact_family | string | `buy_readiness_v1` |
| schema_version | integer | `1` |
| generated_at | string | UTC timestamp. |
| status | string | `ok`, `warming`, `degraded`, `blocked`. |
| raw_action | string | Strategy action before gates. |
| final_action | string | Operator-facing action after gates. |
| strategy_family | string | `canslim`, `dip_buyer`, `regime_momentum_rs`, etc. |
| symbol | string | Uppercase ticker when symbol-scoped. |
| buy_allowed | boolean | True only when all hard gates pass. |
| blockers | array | Machine-readable hard blockers. |
| warnings | array | Non-hard degraded notes. |
| evidence | object | Snapshot of market data, scorecard, authority, and lifecycle freshness inputs. |

#### [NEW] `.cache/prediction_accuracy/reports/calibration-readiness-latest.json`

| Field | Type | Notes |
|-------|------|-------|
| artifact_family | string | `calibration_readiness_v1` |
| schema_version | integer | `1` |
| generated_at | string | UTC timestamp. |
| source_report | string | Path or identifier of prediction accuracy source. |
| settled_records | integer | Total settled records. |
| horizon_status | object | Existing `1d`, `5d`, `20d` maturity counts. |
| calibration_state | string | `fresh`, `warming`, `stale`, `unavailable`. |
| display_line | string | Canonical alert/UI text. |
| blockers | array | Missing or insufficient calibration reasons. |

#### [UPDATE] Existing scanner and run artifacts

Existing strategy alert payloads and full-watchlist artifacts should include:

| Field | Type | Notes |
|-------|------|-------|
| raw_action | string | Preserves pre-gate strategy decision. |
| final_action | string | Post-gate operator action. |
| buy_readiness | object | Inline summary or reference to readiness artifact. |
| calibration_readiness | object | Inline summary or reference to calibration artifact. |

---

## Infrastructure Changes (if any?)

### SNS Topic Changes

No AWS SNS changes.

### SQS Queue Changes

No AWS SQS changes.

### Cache Changes

- Add artifact cache files for buy readiness and calibration readiness.
- Treat missing or stale readiness artifacts as hard blockers for final `BUY`.
- Mission Control can cache rendered readiness state only when it carries source timestamps.

### S3 Changes

No S3 changes for the first implementation.

### Secrets Changes

No new secrets.

### Network/Security Changes

No network changes. Readiness should consume existing local service endpoints and artifacts only:

- `http://127.0.0.1:3033/market-data/ready`
- `http://127.0.0.1:3033/market-data/ops`
- existing backtester `.cache` artifacts

---

## Behavior Changes

- A raw strategy `BUY` is not automatically a final operator `BUY`.
- Final `BUY` requires all hard gates to pass:
  - market-data service ready and provider state healthy
  - quote/history freshness within policy
  - scorecard exists, is fresh, and is not stale/degraded beyond policy
  - authority artifact exists and contains the strategy family
  - strategy family authority is at least the configured minimum tier, default `limited_trust`
  - lifecycle/control-loop artifacts exist and are current
  - reconciliation does not contain unresolved hard actions such as `reduce_authority`, `hold_rollout`, or active pause/kill switch
- A blocked raw `BUY` becomes final `WATCH` with `BUY_BLOCKED:*` reasons.
- Calibration text is rendered from `calibration-readiness-latest.json` rather than inferred separately in each message path.
- The V4 lifecycle/control-loop refresh runs on schedule before market-session scans.

---

## Application/Script Changes

### New Python modules

- `backtester/readiness/buy_readiness.py`
  - Owns `evaluate_buy_readiness(...)`.
  - Loads market-data readiness, scorecard, authority, lifecycle, drift, and reconciliation evidence.
  - Returns a typed artifact with `buy_allowed`, `final_action`, blockers, warnings, and evidence.

- `backtester/evaluation/calibration_readiness.py`
  - Owns canonical settled-sample and calibration display state.
  - Reads `.cache/prediction_accuracy/reports/prediction-accuracy-latest.json`.
  - Produces `calibration-readiness-latest.json` and a canonical short display line.

### Updated Python modules

- `backtester/strategy_alert_pipeline.py`
  - Apply buy-readiness gates after raw strategy action is computed and before final payload emission.
  - Preserve raw action and blocker reasons.

- `backtester/canslim_alert.py`
  - Use the shared strategy alert pipeline readiness result.

- `backtester/dipbuyer_alert.py`
  - Use the shared strategy alert pipeline readiness result.

- `backtester/prediction_accuracy_report.py`
  - Emit calibration readiness after rebuilding prediction accuracy and strategy scorecard artifacts.

- `backtester/trade_lifecycle_cycle.py`
  - Ensure desired/actual/drift/reconciliation artifacts are written during scheduled refresh runs, even when no alert JSON is provided.

### Updated TypeScript / shell scripts in `cortana`

- `/Users/hd/Developer/cortana/tools/trading/run-trading-precompute.sh`
  - Continue settling prediction and calibration artifacts.

- `/Users/hd/Developer/cortana/tools/trading/run-trading-control-loop-refresh.sh` [new]
  - Runs `uv run python trade_lifecycle_cycle.py --review-only` or the agreed non-mutating lifecycle refresh mode.

- `/Users/hd/Developer/cortana/config/cron/jobs.json`
  - Add a weekday pre-scan control-loop refresh after trading precompute and before the first scan.

### Updated Mission Control files

- `apps/mission-control/lib/trading-ops.ts`
  - Load buy-readiness and calibration-readiness artifacts.

- `apps/mission-control/lib/trading-ops-contract.ts`
  - Add types for readiness artifacts.

- `apps/mission-control/components/trading-ops-dashboard.tsx`
  - Display buy readiness, blockers, and calibration truth without recalculating gates.

---

## API Changes

### [NEW] Internal buy-readiness artifact contract

| Field | Value |
|-------|-------|
| **API** | File artifact, optionally exposed through existing Trading Ops loader |
| **Description** | Canonical answer to whether raw `BUY` may remain final `BUY`. |
| **Additional Notes** | This is an advisory trust gate, not a broker execution gate. |

| Field | Detail |
|-------|--------|
| **Authentication** | Internal only |
| **URL Params** | N/A |
| **Request** | Raw action, strategy family, symbol, and optional evidence overrides for tests. |
| **Success Response** | `buy_allowed`, `final_action`, `blockers`, `warnings`, `evidence`. |
| **Error Responses** | Missing artifact, stale artifact, invalid readiness input. |

### [NEW] Internal calibration-readiness artifact contract

| Field | Value |
|-------|-------|
| **API** | File artifact, optionally exposed through existing Trading Ops loader |
| **Description** | Canonical calibration display and settled-sample state. |
| **Additional Notes** | Fixes alert/UI mismatch around settled record counts. |

---

## Process Changes

- Trading precompute remains responsible for prediction settlement and calibration refresh.
- A new V4 lifecycle/control-loop refresh should run after precompute and before market-session scans.
- Market-session scans must treat missing control-loop freshness as a readiness blocker, not as a scanner failure.
- Alert and Mission Control wording must be generated from readiness artifacts.

---

## Orchestration Changes

Recommended weekday order:

```text
07:45 Stock Market Brief collect
08:10 Trading Precompute Refresh
08:20 V4 Trading Control Loop Refresh
08:30 Polymarket Market Intel Refresh
09:30 / 12:30 / 15:30 Market-session scans
*/5 09-16 Backtest notify
11:00 / 15:00 Quick re-check
```

The exact cron times may be adjusted, but the dependency order should not be reversed: prediction settlement and control-loop freshness must precede final BUY readiness checks.

---

## Test Plan

- Unit tests for `evaluate_buy_readiness(...)` covering each hard blocker independently.
- Unit tests proving raw `BUY` becomes final `WATCH` when readiness fails.
- Unit tests proving raw `BUY` remains final `BUY` only when all gates pass.
- Unit tests for calibration readiness using prediction accuracy fixtures with settled records.
- Integration tests for strategy alert payloads proving raw/final action fields and blocker reasons are emitted.
- Integration tests for Mission Control loaders reading readiness artifacts.
- Cron contract tests proving the V4 control-loop refresh is scheduled after precompute and before scans.

---

## Resolved Questions

- Should BUY be hidden when blocked? No. Preserve raw `BUY`; downgrade final action.
- Is broker execution safety in scope? No.
- Should missing V4 lifecycle artifacts block final BUY? Yes.
- Should authority have to be `trusted`? Not initially. Default minimum is `limited_trust`, configurable upward later.
- Should calibration text have multiple sources? No. Use one calibration readiness artifact.
