# Spartan Overview

Spartan is the fitness coaching domain spanning `cortana` (identity, cron, tools) and `cortana-external` (external service, data providers).

## What Exists Now

The Spartan lane is no longer just a plan. It already has:

- a dedicated identity scaffold under `cortana/identities/spartan/`
- live cron coverage for fitness summaries and checks
- artifact builders and fitness persistence tooling in `cortana/tools/fitness/`
- external service support from `cortana-external/apps/external-service/`

So the active Spartan docs should be read as system summaries and operator guidance, not as speculative product planning.

## Current Goal

The system is trying to act as a reliable, evidence-backed fitness coach that can:

- interpret readiness and recovery
- understand Tonal workouts at a session and movement level
- support body-composition-aware coaching
- drive daily and weekly decisions automatically
- improve from outcome history rather than generic advice

## Current Reading Path

- [Roadmap](./roadmap.md)

## Archive Boundary

The per-epic PRD, Tech Spec, and Implementation triplets are already implemented and live under `apps/external-service/docs/archive/planning/spartan/`.
The active source surface is intentionally much smaller.
