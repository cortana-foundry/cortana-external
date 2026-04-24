# Supervised Real Execution Readiness PRD

**Document Status:** Future Work After W13 Advisor Cockpit Proves Useful  
**Owner:** Trading systems  
**Last Updated:** 2026-04-24  
**Depends On:** W11 hardening, W12 activation approval, W13 advisor cockpit adoption

## Purpose

W14 defines the first real-execution direction. The system may eventually place real trades, but only under explicit supervision, strict policy, and current evidence.

This is not a paper-trading track. The transition is advisor to supervised execution, with replay and historical validation allowed for safety checks but no paper portfolio product.

## Product Direction

The execution bot should behave like a constrained operator, not an unconstrained trader.

It can only act when:

- W11 gates pass
- W12 activation evidence remains healthy
- W13 advisor cockpit explains the recommendation
- operator-approved execution policy allows the action
- position, portfolio, and risk limits allow the action
- kill switch is healthy and reachable

## Hard Lines

- No paper-trading mode.
- No real trade without an explicit execution policy.
- No trade outside approved accounts, symbols, hours, and max-risk settings.
- No trade when market data, scorecard, lifecycle, authority, or reconciliation artifacts are stale.
- No hidden model override around gates.
- No averaging down unless a specific strategy policy permits it.
- No position without a sell, trim, or invalidation plan.
- No execution path that bypasses Mission Control audit trails.

## Requirements

### 1. Execution Policy Contract

Define a versioned policy artifact for:

- allowed symbols or universes
- max position size
- max portfolio exposure
- max daily orders
- max daily loss or drawdown guard
- allowed order types
- allowed trading windows
- required approval mode
- kill-switch state

### 2. Approval Modes

Support explicit modes:

- advisory only
- require approval for every order
- allow pre-approved small orders
- execution disabled

The default must be advisory only.

### 3. Buy And Sell Lifecycle

Execution readiness must cover both sides:

- when to buy
- when not to buy
- when to hold
- when to trim
- when to exit
- when to stop trading for the day

Telegram should alert on action opportunities. Mission Control should remain the source of truth for evidence and approval state.

### 4. Broker Boundary

The broker adapter should be isolated behind a narrow port:

- quote check
- account state
- position state
- order preview
- order submit
- order cancel
- order status

All broker calls should be auditable. The advisor should not talk directly to broker APIs.

### 5. Execution Audit Trail

Every proposed and submitted action should record:

- recommendation id
- evidence packet id
- policy version
- approval mode
- operator approval, if required
- broker preview
- submitted order id
- fill or cancel result
- post-trade lifecycle state

## Success Metrics

- 0 orders can be submitted when any hard gate is stale or failing.
- 100% of submitted orders link to an evidence packet and policy version.
- 100% of execution decisions are visible in Mission Control.
- Telegram alerts are actionable but never the only audit record.
- Kill switch blocks execution in tests and in production health checks.

## Resolved Questions

**Should W14 include paper trading?**  
No. Paper trading is a hard no.

**Should the bot eventually execute real trades?**  
Yes, but only after advisor trust is proven and execution policies are explicit.

**Should Mission Control or Telegram be primary?**  
Mission Control is primary. Telegram is the alert and action-notification channel.

**What is the biggest safety rule?**  
No current evidence, no trade.
