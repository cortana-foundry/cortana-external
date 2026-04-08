# Mission Control — Architecture Overview

Mission Control is the local operator surface for the Cortana system.

Its job is not to replace the source repos or the runtime. Its job is to make the current system legible:

- what is running
- what failed
- what needs approval
- what the task board says
- what the docs and memory layers currently contain

## Core Responsibilities

Mission Control currently owns these operator surfaces:

- dashboard and run visibility
- jobs and agent execution history
- approvals inbox
- council session review
- docs browser
- long-term memory browser
- services and runtime control views

The app is an execution-plane UI, not just a read-only dashboard.

## Stack

- **Next.js (App Router, TypeScript)** for UI and API routes
- **shadcn/ui + Tailwind v4** for UI primitives
- **PostgreSQL + Prisma** for Mission Control-owned state
- **filesystem reads** for repo docs and memory views
- **read-through integration to Cortana DB** for shared task-board and governance state

## Main Data Boundaries

Mission Control reads from multiple sources on purpose.

### Mission Control database

Mission Control-owned Postgres tables store app-local state such as:

- agents
- runs
- events
- approvals
- council records
- related operator metadata

This is the app's primary UI database.

### Cortana database

Mission Control reads Cortana-owned task and governance state through `CORTANA_DATABASE_URL` when available.

That split matters:

- `cortana` remains the owner of the real task board
- Mission Control is the visibility and control surface

### Repo and runtime files

Mission Control also reads:

- docs from `cortana` and `cortana-external`
- long-term memory files from `cortana`
- selected runtime and service state files

This is why the docs and memories pages are filesystem-backed rather than purely DB-backed.

## Current App Surfaces

### Dashboard

High-level operator view for:

- recent runs
- alerts and event feed
- agent health
- current system totals

### Jobs

Run and execution view for:

- queued, running, completed, failed, and stale work
- confidence-graded lifecycle status
- fallback-path visibility
- sub-agent ingestion state

### Approvals

Human-in-the-loop control surface for:

- pending approval requests
- approve/reject/resume flow
- Telegram-linked approval handling

### Council

Deliberation view for:

- council sessions
- member responses
- synthesis and decision trace

### Docs

Markdown browser over the repo docs and knowledge layers.

### Memories

Browser for durable memory files from `cortana`.

### Services

Operational surface for:

- service health
- agent roster
- selected runtime controls and environment-backed actions

## Integration Patterns

### OpenClaw run ingestion

Mission Control supports both:

- push-style lifecycle ingestion from OpenClaw events
- pull-style reconciliation from local run-state artifacts

This is how the UI avoids becoming stale when webhook-style delivery is missing or delayed.

### Task-board reconciliation

Mission Control treats the Cortana task system as source of truth and reconciles what it shows against that source instead of silently inventing local state.

### Filesystem-backed knowledge access

Docs and memory views intentionally read straight from repo files so the operator can inspect current text, not a lagging copy.

## Reliability Principles

Mission Control should make operator truth clearer, not noisier.

Key rules:

- show fallback paths explicitly
- mark stale execution state instead of pretending it is live
- keep source ownership visible
- prefer read-through truth over duplicated cached truth
- keep manual approval and audit trails first-class

## Source Docs

- app README: `/Users/hd/Developer/cortana-external/apps/mission-control/README.md`
- current-state page: `/Users/hd/Developer/cortana-external/knowledge/domains/mission-control/current-state.md`
- council background jobs: `/Users/hd/Developer/cortana-external/apps/mission-control/docs/source/architecture/council-background-jobs.md`
