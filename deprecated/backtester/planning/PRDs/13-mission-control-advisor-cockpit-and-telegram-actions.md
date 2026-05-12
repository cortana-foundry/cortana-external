# Mission Control Advisor Cockpit And Telegram Actions PRD

**Document Status:** Future Work After W12 Activation  
**Owner:** Trading systems  
**Last Updated:** 2026-04-24  
**Depends On:** W11 hardening evidence and W12 activation approval

## Purpose

W13 turns the trading system into a better advisor application. Mission Control becomes the main cockpit, and Telegram becomes the action alert lane.

The product goal is simple: when the system says buy, hold, trim, or sell, the operator can see the evidence, counterevidence, portfolio impact, and lifecycle context without digging through artifacts or logs.

## Product Direction

The long-term path is:

1. Advisor first.
2. Supervised execution bot later.
3. No paper-trading product path.

W13 stays in the advisor phase. It may create action recommendations and alerts, but it must not place trades.

## Requirements

### 1. Mission Control Is The Primary Cockpit

Mission Control should show:

- current portfolio posture
- active buy candidates
- active sell or trim candidates
- held positions with lifecycle state
- signal evidence and counterevidence
- gate status from W11
- calibration and settled outcome context
- operator feedback history

### 2. Telegram Is The Action Alert Channel

Telegram alerts should be reserved for meaningful events:

- buy candidate becomes actionable
- buy candidate is blocked and why
- held position changes sell/trim posture
- lifecycle state changes materially
- data freshness or control-loop freshness breaks
- model confidence drops after earlier confidence

Alerts should include enough context to act, but the canonical detail remains in Mission Control.

### 3. Multi-Horizon Advisor

The advisor should support intraday, 1-5 day swing, and multi-week views.

Each recommendation must say which horizon it belongs to. A symbol may have different actions by horizon, and the UI should avoid collapsing them into one ambiguous label.

### 4. Counterargument Layer

For any high-conviction or actionable recommendation, the system should argue against itself.

This should include:

- why the signal may be wrong
- what data is stale or missing
- what would invalidate the thesis
- what portfolio risk the recommendation adds
- what recent settled outcomes say about similar calls

This does not need to run for every low-priority scan item. It should run for recommendations that may cause a human action.

### 5. Learn From Manual Decisions

The cockpit should capture operator decisions:

- accepted recommendation
- ignored recommendation
- rejected recommendation
- manual buy not recommended by the system
- manual sell or trim
- freeform rationale

The system should later compare those decisions against outcomes, so it learns from both market results and the operator's judgment.

## Trust Bar

The operator should trust a recommendation only when the app can answer:

- Is the data fresh?
- Is the scorecard fresh?
- Is the lifecycle/control-loop state current?
- Is the authority artifact non-empty and above threshold?
- What has this kind of signal done historically?
- What is the risk if this is wrong?
- What is the sell or invalidation plan if bought?
- What does the system disagree with inside its own evidence?

If those answers are missing, the recommendation should remain visible but not feel actionable.

## Architecture Evolution Notes

This track does not require a full rewrite of the current backtester or control loop. The existing system is scalable enough for the next phase if the product surface grows around stronger contracts instead of duplicated interpretation.

W13 should gradually consolidate these boundaries:

- canonical recommendation contract with `raw_action`, `final_action`, horizon, confidence, evidence, blockers, lifecycle state, and sell plan
- stable decision evidence layer that Mission Control and Telegram both read
- Python-owned decision contracts that Mission Control renders without reinterpreting scattered artifacts
- Telegram alert pipeline that consumes the same recommendation contract as Mission Control
- no duplicated buy/sell logic across Python, Mission Control, cron, alerts, or future execution code

The architectural risk is not throughput scale yet. The risk is letting decision logic fork across scripts, UI code, alerts, and broker integrations.

## Non-Goals

- No broker execution.
- No paper-trading mode.
- No automatic portfolio sizing changes.
- No new strategy family unless W12 evidence says the advisor layer is ready.
- No alert spam for ordinary scan churn.

## Success Metrics

- Actionable alerts include buy/sell action, horizon, evidence, and blockers when present.
- Mission Control can explain each actionable recommendation without reading raw artifacts.
- Operator feedback can be captured and replayed against later outcomes.
- High-conviction recommendations include counterarguments.
- Telegram alerts map back to a stable Mission Control detail view.

## Resolved Questions

**Should W13 optimize for advisor or execution?**  
Advisor. Execution waits for W14 or later.

**Should paper trading be part of the path?**  
No. Paper trading is explicitly excluded.

**Should the system argue against itself?**  
Yes, for high-conviction or actionable recommendations.

**What would create trust?**  
Fresh evidence, calibration truth, lifecycle truth, counterarguments, risk impact, sell plan, and operator feedback loops.
