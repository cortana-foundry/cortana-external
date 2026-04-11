# Polymarket V2 Trade Loop

This page is the top-level roadmap and decision page for the next Polymarket phase. It stays intentionally short and points the implementation work at the companion doc set.

## Document Set

- PRD: [prd-polymarket-v2-trade-loop.md](../prd/prd-polymarket-v2-trade-loop.md)
- Tech Spec: [techspec-polymarket-v2-trade-loop.md](../techspec/techspec-polymarket-v2-trade-loop.md)
- Implementation: [implementation-polymarket-v2-trade-loop.md](../implementation/implementation-polymarket-v2-trade-loop.md)
- QA: [qa-polymarket-v2-trade-loop.md](../qa/qa-polymarket-v2-trade-loop.md)

## Goal

Let the operator evaluate Polymarket contracts and prepare trades from Trading Ops with the same discipline used for stock workflows and Telegram-delivered decision records.

V2 is an operator workflow, not a browser trading shortcut:

- inspect a live contract
- see why it matters
- review evidence and risk
- preview the order
- keep the thesis and outcome on file

## V1 Scope

V1 ships the decision loop only:

- read-only trade dossier
- opinion scorecard
- order preview
- artifact persistence
- Telegram summary

V1 does not include live order submit, live cancel, or browser-side trade authorization.

## Ownership and Boundaries

| Area | Owner | Boundary |
| --- | --- | --- |
| Order and market-state APIs | `external-service` | Owns Polymarket order, preview, cancel, and state APIs |
| Operator UI | Mission Control | Presents data and collects operator review; never submits directly |
| Decision framing | Backtester | Builds the dossier, scorecard, and artifact trail |
| Explanation layer | LLM | Explains the decision; it does not authorize or choose the final trade |
| Run storage | Backtester | Uses a dedicated Polymarket run family under `var/polymarket/` |

## Sequencing

The work should move in phases with clear exit criteria.

### Phase 1: Trade dossier

Build the read-only contract packet for each candidate.

Exit criteria:

- each candidate has a compact dossier
- the dossier includes contract facts, market context, linked proxies, and risks
- the dossier is readable without a trade button

### Phase 2: Opinion scorecard

Add the hybrid decision layer.

Exit criteria:

- deterministic facts and thresholds generate the scorecard
- the LLM adds a short operator explanation
- the UI shows both the facts and the explanation
- the final opinion stays evidence-led, not vibe-led

### Phase 3: Order preview

Add preview only, with no live submit in v1.

Exit criteria:

- the operator can preview side, size, and price
- server-side validation blocks invalid preview state
- the browser still cannot submit an order directly

### Phase 4: Artifacts and Telegram

Persist the decision trail and surface it in Telegram.

Exit criteria:

- thesis snapshot is written to disk
- preview snapshot is written to disk
- Telegram summary is generated from the same record
- outcome tracking is linked to the same run family

### Future phase: Live submit

Only after v1 is stable should live submit, cancel, and close-position support be enabled.

Exit criteria:

- the operator flow is stable in preview mode
- guardrails are explicit and testable
- live order paths are ready for controlled rollout

## Guardrails

- v1 stays read-only beyond preview
- live order submit never happens from Mission Control directly
- order authorization stays server-side
- preview must pass before any later submit path can exist
- max notional and size limits are enforced on the server
- market-state checks must gate any future live submit path
- stale market data should block promotion, not silently pass

## Failure Modes

- stale market data: show the dossier as stale and block promotion
- LLM failure: keep the deterministic scorecard and mark the explanation degraded
- preview failure: show the error and preserve the dossier record
- missing contract metadata: render a partial dossier, not a blank page
- order rejection: record the failure and keep the preview trail intact
- partial API outage: degrade the affected row or panel, not the full page

## Acceptance Criteria

- the operator can open a Polymarket candidate and see a complete dossier
- the scorecard explains the decision with deterministic facts first
- the preview path validates server-side and writes an artifact
- Telegram receives a readable summary from the same run
- the system stores records under the Polymarket run family
- Mission Control never submits live orders directly in v1
- the roadmap points implementers to the PRD, tech spec, implementation plan, and QA doc

## Decision Summary

- Polymarket is its own run family under `var/polymarket/`
- `external-service` owns Polymarket order and state APIs
- Mission Control presents the workflow and never submits directly
- the LLM explains the trade but does not authorize it
- v1 is dossier + opinion + preview + artifacts + Telegram summary only
