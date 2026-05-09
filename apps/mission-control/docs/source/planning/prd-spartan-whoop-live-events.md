# Product Requirements Document (PRD) - Spartan WHOOP Live Events

**Document Status:** Draft

## Team

| Role | Assignee |
|------|----------|
| Primary Owner | @hd |
| Epic | Spartan WHOOP Live Events |

---

## Problem / Opportunity

Spartan currently delivers useful daily, weekly, and monthly coaching through cron-driven fitness jobs. Those messages work well for scheduled insight, but they can be stale around real-life activity timing: workouts happen later than expected, sleep and recovery data become available after fixed windows, and manual "fetch WHOOP" checks are reactive.

WHOOP webhooks create an opportunity to make Spartan event-aware. Instead of waiting for the next cron, WHOOP can notify the system when workout, sleep, recovery, or related WHOOP data changes. Spartan can then analyze fresh data and send a concise Telegram coaching message only when the event creates a useful coaching moment.

---

## Insights

- WHOOP webhooks are event notifications, not a data stream. The webhook should trigger analysis; the system still fetches the latest WHOOP data before coaching.
- `apps/external-service` already owns WHOOP auth, token refresh, `/whoop/data`, provider health, and the local runtime boundary. Webhook ingress belongs there, not in Mission Control.
- Spartan already has a coaching voice, alert policy, Telegram delivery pattern, and Mjolnir UI surface. The MVP should extend those paths rather than create a parallel fitness system.
- The system should ingest all WHOOP events, but it should not message on every event. "All events" means full capture and analysis, with `NO_REPLY` as the low-noise default.

---

## Development Overview

Add a WHOOP webhook ingestion and processing loop to `cortana-external` and `cortana`. `apps/external-service` will expose a narrow public HTTPS webhook endpoint, validate WHOOP signatures, dedupe and persist events in Postgres, ACK quickly, and enqueue asynchronous processing.

A WHOOP live-event processor will fetch the full WHOOP snapshot, build a compact `whoop_event_analysis.v1` artifact, reuse Spartan's existing alert/coaching policy through a live-event adapter, and trigger a Spartan Telegram message only when the policy does not return `NO_REPLY`.

Mission Control's `/mjolnir` route will show a near-top "WHOOP Live Events" panel covering webhook, cron, and manual WHOOP activity. Monitor owns operational failure alerts; Spartan owns only coaching messages.

---

## Success Metrics

- WHOOP can deliver all subscribed events to the Mac mini over public HTTPS.
- `external-service` verifies, dedupes, stores, and ACKs WHOOP webhook events reliably.
- Normal event processing creates a compact analysis artifact within 60 seconds.
- Duplicate event bursts produce at most one Spartan Telegram message.
- Mjolnir shows recent webhook, cron, and manual WHOOP activity with status.
- Monitor alerts on repeated webhook processing failures.
- Existing daily, weekly, and monthly Spartan crons continue working unchanged.

---

## Assumptions

- Webhook ingress terminates in `apps/external-service`.
- WHOOP gets a separate narrow public HTTPS callback scoped to the webhook path only.
- Existing Tailscale access to Mission Control, Codex Sessions, and operator workflows remains unchanged.
- Event truth lives in the existing `cortana` Postgres database through `CORTANA_DATABASE_URL`.
- v1 fetches the full WHOOP snapshot after relevant webhook events.
- Quiet-hours suppression is out of scope for MVP.
- Compact analysis rows are retained for long-term audit; raw payload retention is bounded to keep the store small.

---

## Resolved Decisions

| Decision | Resolution |
|----------|------------|
| Webhook owner | `apps/external-service`, because it owns WHOOP auth and provider data. |
| Processing model | Enqueue-only webhook ACK, followed by async processing. No LLM work inside the webhook request. |
| Event coverage | Subscribe to all WHOOP events, store all events, and analyze through policy. |
| Notification policy | Use `NO_REPLY` by default; Telegram only fires for useful coaching moments. |
| Storage | Store event truth and compact artifacts in the `cortana` Postgres database. |
| Latency | Target under 60 seconds for normal processing, with a 5-minute reconciliation fallback. |
| Message authoring | Build deterministic `whoop_event_analysis.v1`; Spartan converts that artifact into human coach text. |
| Mjolnir visibility | Add a near-top WHOOP Live Events panel to `/mjolnir`. |
| Event sources shown | Show `webhook`, `cron`, and `manual` WHOOP activity together. |
| Policy reuse | Reuse existing Spartan alert/coaching policy through a live-event adapter. |
| Data fetch strategy | Fetch full WHOOP snapshot in v1; defer object-specific fetch optimization. |
| Dedupe/coalescing | Exact dedupe by `trace_id`; coalesce 30-60 seconds by `event_type + resource_id`. |
| Public ingress | Prefer Tailscale Funnel if it can expose only `/webhooks/whoop`; otherwise use a constrained HTTPS tunnel such as Cloudflare Tunnel. Do not expose the full service. |
| Failure ownership | Monitor and Mjolnir own operational failures; Spartan owns coaching only. |
| Raw retention | Keep raw webhook payloads bounded, defaulting to 30 days; keep compact analysis/notification rows indefinitely. |
| Delete events | Treat delete/remove-style WHOOP events as audit/UI events only unless later evidence shows coaching value. |
| Replay confirmation | Mjolnir reprocess actions require explicit operator confirmation. |

---

## Out of Scope

- Replacing daily, weekly, or monthly Spartan cron messages.
- Building a full fitness inbox or chat UI in Mission Control.
- Hard real-time delivery guarantees under 10 seconds.
- Object-specific WHOOP fetch optimization.
- Quiet-hours suppression.
- Tonal, Apple Health, or non-WHOOP webhook ingestion.
- Direct port forwarding or broad public exposure of `external-service`.

---

## High Level Requirements

| Requirement | Description | Notes |
|-------------|-------------|-------|
| [Requirement 1 - WHOOP Webhook Ingress](#requirement-1---whoop-webhook-ingress) | Accept public HTTPS WHOOP webhook POSTs in `external-service`. | Validate signatures and ACK fast. |
| [Requirement 2 - Durable Event Store](#requirement-2---durable-event-store) | Persist raw event metadata, processing state, analysis artifact, and notification result. | Postgres `cortana` DB. |
| [Requirement 3 - Async Processing](#requirement-3---async-processing) | Process events after ACK with dedupe, coalescing, full WHOOP refresh, and policy evaluation. | Normal target under 60 seconds. |
| [Requirement 4 - Spartan Notification Path](#requirement-4---spartan-notification-path) | Trigger Spartan only when event analysis says message-worthy. | Otherwise `NO_REPLY`. |
| [Requirement 5 - Mjolnir Visibility](#requirement-5---mjolnir-visibility) | Show live WHOOP activity in `/mjolnir`. | Include webhook, cron, manual sources. |
| [Requirement 6 - Monitor Failure Ownership](#requirement-6---monitor-failure-ownership) | Route repeated processing failures to Monitor, not Spartan. | Avoid polluting coaching channel. |

---

## Detailed User Stories

### Glossary

| Term | Meaning |
|------|---------|
| Webhook event | WHOOP notification with `user_id`, `id`, `type`, and `trace_id`. |
| Analysis artifact | Compact structured result from processing a webhook-triggered WHOOP refresh. |
| Notification policy | Deterministic rule layer deciding whether Spartan sends a Telegram message or returns `NO_REPLY`. |
| Coalescing | Grouping rapid duplicate or similar events before one analysis run. |
| Mjolnir | Mission Control fitness route at `/mjolnir`. |

### Requirement 1 - WHOOP Webhook Ingress

| Status | User story | Notes |
|--------|------------|-------|
| Accepted | As WHOOP, I need a public HTTPS endpoint that accepts webhook POSTs. | Endpoint is narrow, not full-service exposure. |
| Accepted | As an operator, I want invalid signatures rejected. | Use WHOOP webhook signature headers. |
| Accepted | As the runtime, I want to ACK quickly and process later. | Avoid WHOOP retries and timeouts. |

### Requirement 2 - Durable Event Store

| Status | User story | Notes |
|--------|------------|-------|
| Accepted | As an operator, I want every WHOOP event logged so failures can be replayed or audited. | Store `trace_id`, event type, resource id, status, and compact payload metadata. |
| Accepted | As Spartan, I want compact event analysis retained so future coaching can learn from outcomes. | Keep raw payload bounded; keep compact analysis long-term. |
| Accepted | As an operator, I want notification outcomes logged. | Store `NO_REPLY`, sent, failed, delayed, and skipped states. |

### Requirement 3 - Async Processing

| Status | User story | Notes |
|--------|------------|-------|
| Accepted | As Spartan, I want fresh WHOOP data after workouts, sleep, and recovery updates. | Fetch full snapshot v1. |
| Accepted | As the system, I want duplicate bursts collapsed into one analysis. | Exact dedupe by `trace_id`; coalesce by `event_type + resource_id`. |
| Accepted | As an operator, I want missed events recovered. | 5-minute reconciliation fallback. |

### Requirement 4 - Spartan Notification Path

| Status | User story | Notes |
|--------|------------|-------|
| Accepted | As Hamel, I want useful live coaching after meaningful WHOOP changes. | Not every event should message. |
| Accepted | As Spartan, I want a structured artifact instead of raw webhook payload. | Spartan writes the final human text. |
| Accepted | As an operator, I want `NO_REPLY` when an event is not useful. | Low-noise default. |

### Requirement 5 - Mjolnir Visibility

| Status | User story | Notes |
|--------|------------|-------|
| Accepted | As a visual operator, I want to see live WHOOP events in `/mjolnir`. | Near top under primary summary. |
| Accepted | As an operator, I want webhook, cron, and manual refreshes shown together. | Compare freshness paths. |
| Accepted | As an operator, I want failed or suppressed events inspectable and reprocessable. | Debug action only, with confirmation. |

### Requirement 6 - Monitor Failure Ownership

| Status | User story | Notes |
|--------|------------|-------|
| Accepted | As Hamel, I want operational failures separated from coaching messages. | Monitor owns failures. |
| Accepted | As Monitor, I want repeated webhook failures to page me with cause and next action. | Avoid silent breakage. |

---

## Appendix

### Research Notes

WHOOP webhook docs describe webhooks as HTTPS POST event notifications. The receiver must validate webhook signatures, ACK quickly with a `2XX`, account for retries and duplicate events, and build a fallback/reconciliation path because webhooks can fail or be missed.

Supported WHOOP event types for this PRD are `workout.updated`, `workout.deleted`, `sleep.updated`, `sleep.deleted`, `recovery.updated`, and `recovery.deleted`. Create events are delivered as update events.

Signature validation uses `X-WHOOP-Signature` and `X-WHOOP-Signature-Timestamp`. The expected signature is a base64-encoded SHA256 HMAC of `timestamp_header + raw_http_request_body` using the app secret from the WHOOP Developer Dashboard.

Sources:

- [WHOOP Webhooks](https://developer.whoop.com/docs/developing/webhooks/)
- [WHOOP API](https://developer.whoop.com/api)

### Relevant Existing Code

- `apps/external-service/src/whoop/routes.ts`
- `apps/external-service/src/whoop/service.ts`
- `apps/external-service/src/config.ts`
- `apps/mission-control/app/mjolnir/page.tsx`
- `apps/mission-control/app/api/mjolnir/route.ts`
- `/Users/hd/Developer/cortana/tools/fitness/fitness-alerts-data.ts`
- `/Users/hd/Developer/cortana/config/cron/jobs.json`
- `/Users/hd/Developer/cortana/identities/spartan/SOUL.md`

### Follow-Up Tech Spec Decisions

- Public HTTPS ingress should prefer Tailscale Funnel when the route can be constrained to `/webhooks/whoop`; otherwise use a locked-down tunnel such as Cloudflare Tunnel.
- Signature validation must use the documented WHOOP signature headers and should enforce a bounded timestamp freshness window to reduce replay risk.
- The Tech Spec should define exact Postgres table names for event, artifact, and notification state; the PRD-level contract is one durable event row with compact `whoop_event_analysis.v1` output.
- The processor trigger should be selected in the Tech Spec, but it must preserve the product contract: webhook ACK first, async processing second, Spartan agent turn only after a deterministic artifact exists.
