# W12 Precursor Handoff

**Status:** Pre-W12 evidence collection  
**Last updated:** 2026-04-24  
**Audience:** Future LLM or maintainer deciding whether W12 can start

## Purpose

Use this document when the conversation context is lost. It summarizes the recent reliability work that must be understood before starting W12, and gives a decision protocol for either:

- starting W12, or
- saying "wait a few more trading days" because evidence is still thin.

W12 is not a feature sprint yet. It is blocked until the system proves, through real or replayed evidence, that final operator-facing `BUY` labels are trustworthy after the W11 hardening work.

## Operator Intent

- The system is an advisor first and eventually a real execution bot.
- Paper trading is a hard no.
- Mission Control should become the primary cockpit.
- Telegram should carry advisor snapshots and buy/sell alerts.
- The north star is more good `BUY` decisions and better portfolio outcomes, with explicit guardrails.
- Do not start W12 because the code looks ready. Start only because the artifacts show the system is behaving correctly.

## Recent PR Context

| PR | Purpose | Why it matters for W12 |
| --- | --- | --- |
| #308 `Document V4 buy readiness hardening` | Created W11 docs and W12/W13/W14 future docs. | Defined W12 as blocked until evidence proves W11 gates are reliable. |
| #309 `Add W11 fresh market data cache layer` | Added fresh-data scan performance/freshness work so slow scans can still use fresh-enough evidence. | W12 depends on knowing whether a `BUY` was made from fresh primary data, warm cache, or degraded/stale evidence. |
| #310 `Guard trading artifacts from test-generated data` | Fixed watchdog/lifecycle artifact rendering and rejected corrupt/test-generated artifacts in Mission Control. | W12 cannot trust evidence packets if Mission Control accepts fake or corrupt JSON. |
| #311 `Harden trading reliability boundaries` | Added shared artifact loaders, freshness policies, BUY readiness artifact, control-loop schedule assertion, alert receipts, broker boundary, market-data freshness lane, and scan performance artifacts. | This is the main W11 reliability substrate W12 must evaluate. |
| #312 `Harden trading W12 foundations` | Adds schedule registry, artifact schema/version checks, Dip Buyer profiling report, Telegram alert contract, and Mission Control health-loader extraction. | Makes runtime schedules, artifact versions, alert receipts, and profiling data explicit enough for an LLM to judge W12 readiness. |

## Current Reliability Substrate

The system now has these W12-relevant contracts:

- `buy_readiness_latest.json`: canonical final `BUY_ALLOWED` / `BUY_BLOCKED` gate artifact.
- `market_data_freshness_latest.json`: market data freshness, provider mode, fallback, and stale/cache status.
- `control_loop_schedule_check_latest.json`: whether V4 desired/actual/reconciliation artifacts are current.
- `schedule_registry_latest.json`: source of truth for expected runtime schedules.
- `scan_performance_<strategy>_latest.json`: timing breakdown for scanner phases.
- `dipbuyer_profile_report_latest.json`: names the slowest Dip Buyer phase after real timing samples exist.
- `alert-delivery-receipts.jsonl`: Telegram/watchdog delivery receipt log.
- `telegram_alert_contract`: stable alert type, severity, dedupe key, and receipt policy.
- Mission Control Trading Ops: renders readiness, lifecycle, schedule, financial service, alert delivery, and artifact health.

## What W11 Hardened

Final `BUY` now means more than "a strategy liked the setup." It should require:

- fresh market data
- fresh prediction scorecard
- non-empty authority artifact meeting the configured trust floor
- current lifecycle/control-loop state
- explicit raw action vs final action provenance

If a strategy emits raw `BUY` and a gate fails, the final operator action should downgrade to `WATCH`, preserve the raw `BUY`, and record exact `BUY_BLOCKED:*` reasons.

## What W12 Should Evaluate

W12 should answer:

> Did this signal deserve trust today, and what evidence or counterevidence supports that answer?

A future LLM should compare:

- raw `BUY` count vs final `BUY` count vs blocked `BUY` count
- every `BUY_BLOCKED:*` reason
- market-data freshness and provider mode at scan time
- scorecard freshness and settled-sample availability
- strategy authority tier and autonomy mode
- lifecycle/control-loop freshness
- schedule registry and control-loop schedule status
- Telegram delivery receipts and dedupe behavior
- Mission Control operator copy versus raw artifacts
- Dip Buyer scan timing, especially repeated slow phases

## Start / Wait Decision

Return `not_ready` and continue collecting evidence if any of these are true:

- final `BUY` appears while market data is stale, missing, degraded, or cache-confused
- final `BUY` appears without a fresh scorecard
- final `BUY` appears without a non-empty authority artifact
- final `BUY` appears while lifecycle/control-loop artifacts are missing or stale
- alert copy and accuracy artifacts disagree about settled records
- Mission Control renders corrupt, missing, or contradictory artifacts
- Telegram receipts are missing for alerts that claim to have sent
- Dip Buyer timing data is too thin to identify repeated bottlenecks
- fewer than several real trading sessions have run after #312

Consider W12 only when the artifacts show:

- no unsafe final `BUY` labels
- raw-to-final downgrade behavior is transparent
- schedule registry and control-loop checks stay current
- alert receipts are present and deduped
- Mission Control agrees with artifacts
- Dip Buyer performance data points to a real repeated bottleneck, not a guess

## Suggested Evidence Commands

Run from `/Users/hd/Developer/cortana-external/backtester`:

```bash
uv run python schedule_registry.py --pretty
uv run python control_loop_schedule_check.py --root . --fail-on-late
uv run python dipbuyer_profile_report.py --pretty
```

Inspect these files:

```text
.cache/trade_lifecycle/buy_readiness_latest.json
.cache/trade_lifecycle/market_data_freshness_latest.json
.cache/trade_lifecycle/control_loop_schedule_check_latest.json
.cache/trade_lifecycle/schedule_registry_latest.json
.cache/trade_lifecycle/scan_performance_dip_buyer_latest.json
.cache/trade_lifecycle/dipbuyer_profile_report_latest.json
../watchdog/logs/alert-delivery-receipts.jsonl
```

Then compare Mission Control:

```text
http://localhost:3000/trading-ops
```

## Validation Baseline From #312

The W12 foundation PR passed:

```bash
cd backtester && uv run pytest tests/test_artifact_schema.py tests/test_schedule_registry.py tests/test_dipbuyer_profile_report.py tests/test_alert_contract.py tests/test_market_data_freshness_lane.py tests/test_scan_performance.py tests/test_buy_readiness.py -q
cd apps/mission-control && pnpm test -- lib/trading-artifacts.test.ts lib/trading-health-model.test.ts lib/trading-ops.test.ts
cd apps/mission-control && pnpm build
bash -n watchdog/watchdog.sh
git diff --check
```

Observed results:

- Backtester targeted tests: `19 passed`
- Mission Control Vitest suite: `441 passed`
- Mission Control production build: passed

## Recommended Next Answer To The Operator

If asked "are we ready for W12?", answer from evidence:

- `approved`: only if post-#312 artifacts are fresh, consistent, and cover enough real sessions.
- `not_ready`: if evidence is missing, stale, contradictory, or only one trading day deep.

Default stance on 2026-04-24: likely `not_ready`. The code foundation is much better, but W12 should wait for a few real trading days of clean artifacts unless the operator explicitly asks for a replay-based evidence review.

## Hand Off To W12

When evidence is sufficient, continue with:

- PRD: `backtester/planning/PRDs/12-backtester-v5-evidence-gated-operator-evaluation.md`
- Future cockpit work: `backtester/planning/PRDs/13-mission-control-advisor-cockpit-and-telegram-actions.md`
- Future execution work: `backtester/planning/PRDs/14-supervised-real-execution-readiness.md`

Do not jump to W13 or W14 until W12 has made the trust-evaluation layer reproducible.
