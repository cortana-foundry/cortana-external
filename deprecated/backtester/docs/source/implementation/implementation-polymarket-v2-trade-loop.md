# Implementation Plan - Polymarket V2 Trade Loop

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Owner(s) | Cortana trading stack |
| Epic | Polymarket V2 Trade Loop |
| Tech Spec | `../techspec/techspec-polymarket-v2-trade-loop.md` |
| PRD | `../prd/prd-polymarket-v2-trade-loop.md` |

---

## Dependency Map

| Vertical | Dependencies | Can Start? |
|----------|-------------|------------|
| V1 - Polymarket run identity, dossier contract, and artifact root | None | Start Now |
| V2 - Opinion scorecard and preview-ready trade packet | V1 | Start after V1 |
| V3 - Telegram summary, Mission Control presentation, and replayability | V1, V2 | Start after V1, V2 |
| V4 - Live submit, cancel, and position state | V1, V2, V3 | Future phase after v1 release |
| V5 - Settlement capture and postmortem | V1, V2, V3, V4 | Future phase after live submit ships |

---

## Recommended Execution Order

```text
Week 1: V1 - run family, dossier schema, artifact layout, and read-only source assembly
Week 2: V2 - deterministic opinion scorecard, order preview packet, and Telegram draft summary
Week 3: V3 - Mission Control read surfaces, artifact replay, and QA hardening for v1 release
Week 4+: V4 - live submit / cancel / position management, only after v1 is stable
Week 5+: V5 - settlement capture, thesis reconciliation, and postmortem automation
```

---

## V1 Release Boundary

V1 is intentionally narrow. It must ship the read-only decision loop first and stop there.

In scope for v1:

- trade dossier
- deterministic opinion scorecard
- order preview only
- artifact persistence under `var/polymarket`
- Telegram summary for preview and decision review

Explicitly out of scope for v1:

- live submit
- cancel
- position management
- settlement automation
- postmortem generation

Source of truth and ownership:

- `external-service` owns Polymarket order and state APIs
- Mission Control presents operator-facing status only
- backtester owns run linkage, artifact layout, and replayable run context
- Polymarket gets its own run family under `var/polymarket`

---

## Sprint 1 - Build The Polymarket Run Spine

### Vertical 1 - Polymarket Run Identity And Artifact Root

**backtester: Create a dedicated Polymarket run family and lock the artifact layout before any decision logic ships.**

*Dependencies: None*

#### Jira

- Sub-task 1: Add a Polymarket run-family identifier in backtester so Polymarket workflows do not collapse into the stock run layout.
- Sub-task 2: Create a deterministic artifact root under `var/polymarket/<run_id>/` with stable names for dossier, opinion, preview, and Telegram output.
- Sub-task 3: Add a run-linking helper that ties each dossier and preview record back to the originating market, contract slug, and session context.
- Sub-task 4: Document the run-family rules in code comments and the artifact metadata so future phases can replay a run without guessing how it was created.

#### Testing

- A Polymarket run writes only to `var/polymarket` and never to the stock run subtree.
- Re-running the same run id produces the same artifact path and stable filenames.
- Artifact metadata preserves the contract slug, market id, and run-family label.

### Vertical 2 - Read-Only Polymarket Dossier Assembly

**backtester: Build the dossier source packet from existing Polymarket data, equity proxies, and market context without touching order APIs.**

*Dependencies: V1*

#### Jira

- Sub-task 1: Assemble a dossier object that includes contract facts, event title, resolution condition, bid/ask/last/spread, liquidity context, and roster position.
- Sub-task 2: Attach supporting equity proxy context where relevant, such as `SPY`, `QQQ`, `DIA`, sector ETFs, and any linked stock symbols.
- Sub-task 3: Include explicit risks and invalidation notes so the dossier can be read without a separate narrative.
- Sub-task 4: Keep this stage read-only by using Polymarket market-state endpoints only and no order submission or cancellation calls.

#### Important Planning Notes

- The dossier should be useful even when the operator never submits a trade.
- If a market is stale, inactive, or not linked to a stock/ETF signal, the dossier should say that plainly instead of hiding it.
- Keep the data model compact enough that the same object can be persisted, replayed, and summarized in Telegram.

#### Testing

- Dossier generation succeeds for an active market with normal liquidity.
- Dossier generation still works when no linked stock or ETF signal is active.
- A stale or incomplete market produces an explicit warning, not a blank packet.

---

## Sprint 2 - Build The Decision Packet

### Vertical 3 - Deterministic Opinion Scorecard

**backtester: Add a rule-first Polymarket opinion layer that can explain a trade candidate without authorizing the trade.**

*Dependencies: V1*

#### Jira

- Sub-task 1: Define a deterministic scorecard for market quality, liquidity, catalyst timing, proxy alignment, and roster relevance.
- Sub-task 2: Map scorecard outputs to simple operator labels such as `pass`, `watch`, `starter`, and `conviction`.
- Sub-task 3: Add the LLM explanation layer only after the scorecard exists so the model explains facts rather than inventing them.
- Sub-task 4: Make the scorecard replayable from artifacts so the same dossier always yields the same rule output.

#### Important Planning Notes

- The LLM is an explainer, not the decision authority.
- If the LLM fails, the system should still produce the scorecard and a compact fallback summary.
- Keep the scorecard deterministic and unit-testable before wiring any UI polish.

#### Testing

- The same dossier input produces the same scorecard output on repeat runs.
- LLM failure does not block the scorecard or the preview packet.
- Weak liquidity or unclear resolution conditions push the label toward `watch` or `pass`.

### Vertical 4 - Preview Packet And Telegram Draft

**external-service + backtester: Produce a server-owned preview packet with guardrails, then persist a Telegram-ready summary from the same data.**

*Dependencies: V1, V2*

#### Jira

- Sub-task 1: Add or extend the Polymarket preview path in `external-service` so order sizing, price validation, and market-state gating are enforced server-side.
- Sub-task 2: Return a preview packet that includes side, size, estimated entry, guardrail checks, and any rejection reason.
- Sub-task 3: Persist the preview packet and Telegram summary in the Polymarket run family so the operator can replay exactly what was previewed.
- Sub-task 4: Keep v1 limited to preview only; do not expose live submit or cancel from the browser surface yet.

#### Important Planning Notes

- Guardrails belong in the server layer, not in a browser component.
- The preview packet should look like the same trade the operator would later submit, but without actually sending it.
- Telegram should receive the same explanation string used by the operator surface, not a second interpretation.

#### Testing

- A valid preview produces a deterministic packet with all required fields.
- Oversized notional or bad market state causes a clear rejection reason.
- Telegram summary matches the persisted preview packet.

---

## Sprint 3 - Make The Operator Surface Honest

### Vertical 5 - Mission Control Read Surface And Replay

**apps/mission-control: Present the read-only Polymarket loop in a way that matches the persisted artifact and does not imply live submit exists yet.**

*Dependencies: V1, V2, V3, V4*

#### Jira

- Sub-task 1: Add a Polymarket V2 summary panel to Trading Ops that shows dossier status, opinion label, preview status, and latest artifact timestamps.
- Sub-task 2: Reuse existing Mission Control card and badge patterns so the new surface stays inside the current design system.
- Sub-task 3: Add a replay view or detail mode that opens the persisted dossier and preview packet from `var/polymarket`.
- Sub-task 4: Make the UI state explicit when the dossier exists but preview is blocked, stale, or incomplete.

#### Important Planning Notes

- Mission Control should present the system, not make the decision.
- Do not add live-submit language to v1 UI copy.
- If the data is stale, show stale. If the preview is blocked, show blocked.

#### Testing

- Mission Control shows the same opinion label that was written to the artifact.
- Stale or incomplete dossiers render with an explicit degraded state.
- The read surface works on desktop and mobile widths without overflowing the page.

---

## Sprint 4 - Future Live Submit And Position State

### Vertical 6 - Submit, Cancel, And Position Tracking

**external-service + backtester: Add the live order loop only after v1 has been exercised and trusted in read-only mode.**

*Dependencies: V1, V2, V3*

#### Jira

- Sub-task 1: Add a live submit route in `external-service` that accepts only server-validated preview packets.
- Sub-task 2: Add cancel and open-position state routes that return canonical Polymarket order state.
- Sub-task 3: Link submitted orders back to the Polymarket run family so artifact replay can explain what happened after preview.
- Sub-task 4: Keep Mission Control read-only unless the submit phase is explicitly enabled and signed off.

#### Important Planning Notes

- This phase is intentionally not part of v1.
- The submit path should never be callable without a preceding preview record.
- Any live-order state should be visible in artifacts and in Mission Control after the fact.

#### Testing

- Submit rejects packets that were not produced by the preview path.
- Cancel and open-position retrieval return consistent order state.
- A submitted order can be tied back to the originating dossier and preview artifact.

---

## Sprint 5 - Future Settlement And Postmortem

### Vertical 7 - Settlement Capture And Thesis Review

**backtester: Capture final outcomes and produce the postmortem trail once live submit is stable.**

*Dependencies: V1, V2, V3, V4*

#### Jira

- Sub-task 1: Add settlement ingestion for resolved markets and store the outcome in the same Polymarket run family.
- Sub-task 2: Generate a postmortem artifact that compares the original thesis, the preview packet, the final state, and the result.
- Sub-task 3: Add a Telegram settlement summary that reads like a final operator note, not a new trade recommendation.
- Sub-task 4: Keep the settlement phase separate from the read-only v1 launch so the first release stays tight.

#### Important Planning Notes

- Postmortem is a later phase, not part of v1.
- The final artifact should be readable even when the trade was never submitted.
- Tie settlement back to the original thesis so future iteration has a clear audit trail.

#### Testing

- A resolved market writes a final outcome record under the Polymarket run family.
- The postmortem shows thesis, preview, outcome, and delta in one place.
- Telegram settlement text matches the stored final outcome.

---

## Dependency Notes

### V1 before V2

The run family and artifact layout have to exist before any opinion or preview logic can be trusted. Without that spine, the rest of the loop would be hard to replay and hard to test.

### V2 before V3

The opinion scorecard and preview packet should be stable before Mission Control starts presenting them. Otherwise the UI would freeze assumptions that later change.

### V3 before V4

Live submit should not exist until the operator can read the same dossier, scorecard, preview, and Telegram text from artifacts and Mission Control. That is the trust boundary.

### V4 before V5

Settlement and postmortem only matter once live submit and cancel are real. Otherwise the postmortem would be a mock trail instead of a record of actual execution.

---

## Scope Boundaries

### In Scope (This Plan)

- read-only Polymarket trade dossier
- deterministic opinion scorecard
- server-owned preview packet
- artifact persistence in `var/polymarket`
- Telegram summary generation
- Mission Control read surfaces for the v1 loop
- later-phase live submit, cancel, and postmortem only as planned follow-on work

### External Dependencies

- Polymarket market and roster feeds from the existing service layer
- `external-service` Polymarket order/state APIs
- Telegram delivery plumbing already used by the backtester
- Mission Control read surfaces for operator visibility

### Integration Points

- `apps/external-service/src/polymarket/*`
- `backtester/*` run linkage and artifact persistence
- `apps/mission-control/lib/trading-ops.ts`
- `apps/mission-control/components/trading-ops-dashboard.tsx`
- `var/polymarket/<run_id>/` artifact subtree

---

## Realistic Delivery Notes

The smallest credible path is:

1. create the Polymarket run family and artifact root
2. assemble a read-only dossier
3. add the deterministic opinion scorecard
4. add preview and Telegram summary output
5. expose the read-only story in Mission Control
6. only then add live submit and postmortem phases

- **Biggest risks:** ambiguous ownership between services, drifting artifact schemas, and accidental live-submit scope creep
- **Assumptions:** v1 stays read-only, Polymarket has its own run family under `var/polymarket`, and the operator prefers explicit gating over clever shortcuts
