# Product Requirements Document (PRD) - Polymarket V2 Trade Loop

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Primary Owner | Backtester / Polymarket V2 |
| Epic | Polymarket V2 Trade Loop |

---

## Problem / Opportunity

Polymarket support in Cortana currently stops at read-only intelligence and operator context. That is useful, but it leaves the operator doing three things manually:

- interpreting raw market context
- deciding whether a contract is worth a trade
- reconstructing the thesis later from scattered notes and messages

That gap is the opportunity. The next step is not automation for its own sake. It is a controlled operator loop that turns a Polymarket candidate into a deterministic dossier, a deterministic scorecard, a server-owned preview, and a durable artifact trail.

The first release of V2 must stay disciplined:

- read-only dossier
- deterministic opinion scorecard
- server-owned order preview
- artifact persistence
- Telegram summary
- no live submit in v1

This preserves operator trust while creating a clean path to future execution.

---

## Insights

The repo already contains the right ingredients:

- Polymarket US intelligence and live board surfaces exist
- Mission Control can present operator-facing context
- backtester already owns artifact and Telegram patterns for stock workflows
- external-service already owns provider/runtime boundaries

The main design constraint is trust. If the model is allowed to decide whether to submit, the system becomes hard to audit. If the server owns preview and guardrails, and the LLM only explains a deterministic scorecard, the system remains inspectable and LLM agnostic.

Problems this project is not intended to solve:

- live Polymarket order submission in v1
- autonomous trade entry
- portfolio-wide cross-asset execution
- replacing the existing stock workflow

---

## Development Overview

This work spans three repos/surfaces inside the same codebase:

- `backtester` owns decision artifacts, run linkage, and Telegram formatting
- `external-service` owns Polymarket APIs and execution boundaries
- `Mission Control` owns read-only presentation and operator preview surfaces

The v1 release should implement the trade loop as a safe read/preview path:

1. load a Polymarket contract dossier
2. build a deterministic scorecard from market facts and linked context
3. render an LLM explanation of that scorecard
4. preview a hypothetical order server-side
5. persist artifacts under a dedicated Polymarket run family
6. produce a Telegram-ready summary

The implementation must be deterministic where it matters:

- dossier assembly
- scorecard calculation
- guardrail enforcement
- preview eligibility
- artifact naming and linkage
- Telegram formatting

The LLM is limited to explanation. It should not choose whether to submit, and it should not override deterministic guardrails.

---

## Success Metrics

V1 is successful when:

- `100%` of supported Polymarket candidates can produce a dossier without requiring browser-only steps
- `100%` of dossier runs produce a deterministic scorecard
- `100%` of preview attempts write a durable artifact record
- `0` live orders are submitted from v1
- `100%` of preview failures include explicit blocked reasons
- `100%` of Telegram summaries are generated from stored artifacts, not ad hoc text
- `100%` of v1 Polymarket artifacts are isolated under the Polymarket run family

Quality expectations:

- missing data must degrade explicitly, not get silently guessed away
- the UI and Telegram output must stay understandable without raw JSON dumps
- live submit must remain unavailable until a separate approval step exists

---

## Assumptions

- Polymarket US data and stream surfaces already exist in `external-service`
- Mission Control can call server-side routes for dossier and preview
- backtester can persist artifacts to local disk under a dedicated subtree
- Telegram delivery already exists and can consume formatted summary text
- existing runtime and provider health patterns remain available for linked context
- the operator wants a v1 that is safe-by-default rather than aggressively automated

---

## Out of Scope

- live Polymarket submit in v1
- cancel / close-position execution in v1
- browser-to-provider direct execution
- automatic trade sizing without operator review
- mixing Polymarket execution into the current stock run lifecycle
- using the LLM as the source of truth for trade permission

---

## High Level Requirements

> **Note:** This release is preview-first. The first version must be able to explain a trade without placing one.

| Requirement | Description | Notes |
|-------------|-------------|-------|
| [Requirement 1 - Read-only dossier](#requirement-1---read-only-dossier) | Build a contract dossier with facts, proxy context, and risks. | Server-side, deterministic, no live submit. |
| [Requirement 2 - Deterministic opinion scorecard](#requirement-2---deterministic-opinion-scorecard) | Compute a rule-based opinion and let the LLM explain it. | LLM cannot approve a trade. |
| [Requirement 3 - Server-owned preview and artifacts](#requirement-3---server-owned-preview-and-artifacts) | Preview a hypothetical order and persist the result. | No live order placement in v1. |
| [Requirement 4 - Polymarket run family and Telegram output](#requirement-4---polymarket-run-family-and-telegram-output) | Store artifacts in a dedicated run family and format Telegram summaries from them. | Links to existing stock runs, but does not collapse into them. |

---

## Detailed User Stories

### Glossary

| Term | Meaning |
|------|---------|
| Dossier | A read-only evidence packet for one Polymarket candidate contract. |
| Scorecard | A deterministic rules output that ranks the candidate and explains why. |
| Preview | A server-owned hypothetical order check that validates guardrails without submitting. |
| Run family | A dedicated artifact namespace for one workflow lineage. |
| Linked equity run | The stock market run or regime snapshot that provides cross-context for a Polymarket thesis. |

### Requirement 1 - Read-only dossier

| Status | User story | Notes |
|--------|------------|-------|
| Accepted | As an operator, I want a compact Polymarket dossier so I can inspect the contract before deciding anything. | Must include contract facts, price context, liquidity, roster context, proxies, and invalidation risks. |
| Accepted | As a developer, I want the dossier to be deterministic so that the same inputs produce the same operator view. | Missing fields degrade explicitly. |

The dossier must include:

- market id, slug, title, and event description
- current bid, ask, last, spread, volume, open interest, and freshness
- linked equity proxies when relevant
- related market or macro context
- supporting facts and conflicting facts
- risks and invalidation conditions

### Requirement 2 - Deterministic opinion scorecard

| Status | User story | Notes |
|--------|------------|-------|
| Accepted | As an operator, I want a rule-based scorecard so I can see why a candidate is pass, watch, or small conviction. | The scorecard must be explainable and reproducible. |
| Accepted | As an operator, I want the LLM to explain the scorecard in plain language without changing the trade decision. | The LLM may summarize, not authorize. |

The scorecard must be derived from deterministic inputs:

- market structure and spread quality
- liquidity and size suitability
- catalyst timing
- event relevance
- alignment or conflict with the linked equity regime
- staleness and data quality

The LLM may produce:

- a short thesis summary
- a conflict summary
- a plain-language explanation of the scorecard

The LLM may not:

- choose the final action
- override a guardrail
- invent a market fact

### Requirement 3 - Server-owned preview and artifacts

| Status | User story | Notes |
|--------|------------|-------|
| Accepted | As an operator, I want to preview an order server-side so I can see what would happen before any live action. | Preview must be owned by `external-service`, not by the browser. |
| Accepted | As a developer, I want guardrails to fail closed so unsafe previews never get treated as valid. | Preview failure must carry explicit reasons. |

Preview must validate:

- contract state is tradeable
- market data freshness is acceptable
- requested size is within configured limits
- spread and liquidity are acceptable
- execution permissions are enabled for preview mode

Artifacts must be written for:

- dossier snapshot
- scorecard snapshot
- order preview snapshot
- Telegram summary

### Requirement 4 - Polymarket run family and Telegram output

| Status | User story | Notes |
|--------|------------|-------|
| Accepted | As an operator, I want Polymarket artifacts separated from stock run artifacts so I can review them cleanly. | Use a dedicated `var/polymarket` run family. |
| Accepted | As an operator, I want Telegram summaries generated from stored artifacts so the record matches the UI. | Formatting must be deterministic and concise. |

The run family must:

- live under `var/polymarket`
- keep one lineage per Polymarket candidate or session
- link back to a stock/regime run when relevant
- preserve a clear artifact chain from dossier to postmortem

Telegram summaries must include:

- the candidate title
- the deterministic opinion
- the preview result
- guardrail blocks or warnings
- the linked run ids

---

## Appendix

### Additional Considerations

This repo should remain LLM agnostic.

That means:

- exact repos, files, services, and schemas should be named in the spec
- essential behavior must live in code, config, or typed data contracts
- the LLM should be explainability only for v1
- no submit permission should exist until the system has a separate approval path

### User Research

Observed operator preference from the current roadmap review:

- keep Polymarket useful for trade preparation, not trade autopilot
- separate read-only context from execution
- make artifacts easy to inspect later
- keep Telegram concise and trustworthy

### Resolved Decisions

- No v1-blocking open questions remain for this doc set.
- Live submit, cancel, and close-position behavior is out of scope for v1 and will be designed in a separate later doc set after the preview-first release has proven stable.
