# QA Plan - Polymarket V2 Trade Loop

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Owner(s) | Cortana trading stack |
| Epic | Polymarket V2 Trade Loop |
| PRD | `../prd/prd-polymarket-v2-trade-loop.md` |
| Tech Spec | `../techspec/techspec-polymarket-v2-trade-loop.md` |
| Implementation Plan | `../implementation/implementation-polymarket-v2-trade-loop.md` |

---

## QA Goal

Verify that the Polymarket V2 trade loop is ready to ship in its read-only v1 form without:

- exposing live submit before it is approved
- losing the distinction between dossier, opinion, preview, and settlement phases
- breaking the current Mission Control operator experience
- writing artifacts outside the dedicated Polymarket run family

This QA plan is meant to prove four things:

1. the v1 loop is read-only and replayable
2. the operator can see the same story in artifacts, Telegram, and Mission Control
3. risk controls and preview gates are server-owned
4. later submit and postmortem work stay out of the v1 release boundary

---

## Scope

In scope for v1:

- Polymarket dossier generation
- deterministic opinion scorecard
- preview packet generation
- artifact persistence under `var/polymarket`
- Telegram summary output for preview and operator review
- Mission Control read-only display of dossier / opinion / preview status

Out of scope for v1:

- live submit
- cancel
- position management
- settlement automation
- postmortem automation

---

## QA Matrix

| Area | Scenario | Expected Result |
|------|----------|-----------------|
| Run family | Create a Polymarket V2 run | Artifacts land under `var/polymarket/<run_id>/` and do not mix with stock runs. |
| Dossier | Active market with normal liquidity | Dossier includes contract facts, resolution condition, spread, proxy context, and explicit risks. |
| Dossier | Market with no active linked stock or ETF signal | Dossier stays readable and says there is no active linked signal instead of inventing one. |
| Dossier | Stale or incomplete market data | Dossier emits a clear degraded or warning state. |
| Opinion | Repeat the same dossier input | Scorecard output is deterministic and replayable. |
| Opinion | LLM unavailable | Scorecard still renders and the summary falls back to a compact deterministic explanation. |
| Opinion | Weak liquidity or unclear resolution condition | Opinion trends toward `watch` or `pass`, not false conviction. |
| Preview | Valid preview request | Server returns side, size, estimated entry, and validation checks. |
| Preview | Oversized notional | Preview is rejected with a clear guardrail reason. |
| Preview | Bad market state | Preview is blocked before live submit ever becomes relevant. |
| Artifact | Persist dossier, opinion, preview, and Telegram summary | Stored artifacts match each other and retain the same run id. |
| Mission Control | Open the latest Polymarket run | UI shows the same opinion label and preview status as the persisted artifacts. |
| Mission Control | Stale or blocked preview | UI shows stale / blocked honestly instead of looking healthy. |
| Telegram | Preview summary delivery | Telegram text matches the preview packet and does not add a second interpretation. |
| Safety | Attempt live submit in v1 | There is no enabled live-submit path in the v1 release. |
| Safety | Attempt cancel in v1 | Cancel is not exposed in v1 and remains a future-phase capability. |
| Replay | Reopen a stored run after the fact | The dossier, scorecard, preview, and summary can be reconstructed from the stored artifacts. |

---

## Required Automated Coverage

Add or update tests around these areas when implementation starts:

- backtester run-family and artifact layout
- dossier assembly and proxy/risk inclusion
- opinion scorecard determinism
- preview packet validation and guardrails
- Telegram summary generation
- Mission Control read-only presentation

Suggested test cases:

- `var/polymarket` path creation and naming
- dossier with active and inactive linked signals
- scorecard stable across repeated runs
- preview rejection for bad notional or bad market state
- Telegram summary text matches the preview artifact
- Mission Control shows the same phase labels as the stored run

---

## Manual / Live Validation

### Scenario 1 - Clean Read-Only Run

Setup:

- Polymarket market is live
- roster context is available
- no live submit flag is enabled

Checks:

- dossier is generated
- opinion scorecard is generated
- preview packet is generated
- artifacts are stored under `var/polymarket`
- Mission Control shows the read-only loop

Success:

- no live-submit action appears anywhere in the v1 path
- the operator can understand the trade without opening raw JSON

---

### Scenario 2 - No Linked Stock Or ETF Signal

Setup:

- the current Polymarket event roster has no linked stock or ETF signal

Checks:

- dossier says the linked signal is missing
- opinion scorecard stays conservative
- preview does not invent a synthetic proxy

Success:

- the system stays honest instead of trying to force relevance

---

### Scenario 3 - Weak Market Or Wide Spread

Setup:

- contract is live but illiquid or spread is wide

Checks:

- dossier highlights the liquidity issue
- opinion scorecard downweights the setup
- preview either reduces size or blocks the trade, depending on guardrails

Success:

- liquidity risk is visible in every surface

---

### Scenario 4 - LLM Failure

Setup:

- opinion explanation service is unavailable

Checks:

- deterministic scorecard still runs
- preview packet still renders
- Telegram summary still ships a compact fallback explanation

Success:

- LLM failure does not stop the read-only loop

---

### Scenario 5 - Mission Control / Artifact Cross-Check

Setup:

- open the latest stored Polymarket run in Mission Control

Checks:

- compare the dossier state
- compare the opinion label
- compare the preview packet
- compare the Telegram summary text

Success:

- all three surfaces tell the same story

---

## Acceptance Criteria

The v1 release is QA-complete when all of the following are true:

- `100%` of Polymarket v1 runs write into the dedicated `var/polymarket` run family
- `100%` of v1 runs include dossier, opinion, preview, and Telegram artifacts
- `0` enabled live-submit calls exist in the v1 release boundary
- `0` cases of mixed or contradictory phase labels across artifact, Telegram, and Mission Control surfaces
- `100%` of failing preview guardrails return a clear reason
- the operator can tell whether the current output is:
  - dossier only
  - opinion + preview
  - blocked by guardrail
  - future live-submit work that is not yet enabled

---

## Release Risks To Watch

- artifact naming may drift if the run-family rules are not enforced early
- Mission Control wording may imply live submit exists if copy is not fenced to v1
- the LLM explanation may sound stronger than the deterministic scorecard actually is
- preview validation may appear correct in tests while still allowing ambiguous market-state edge cases in live conditions
- later submit/postmortem work may be mistaken for v1 if it is not explicitly marked as future phase

---

## Sign-Off Checklist

- [ ] Run-family artifact path verified
- [ ] Dossier generation verified
- [ ] Opinion scorecard determinism verified
- [ ] Preview packet and guardrails verified
- [ ] Telegram summary parity verified
- [ ] Mission Control parity verified
- [ ] No live-submit path exposed in v1
- [ ] Future submit and postmortem work clearly deferred
