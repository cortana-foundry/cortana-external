# Technical Specification - [Project Title]

**Document Status:** Not Started
**PRD:** [Link to PRD]()
**Owner:** @owner
**Last Updated:** YYYY-MM-DD

## Development Overview

Describe the high-level technical approach. Keep this in sync with the PRD Development Overview.

## Product Requirement Traceability

Connect every PRD requirement to the technical contract that implements it.

| PRD ID | Product Intent | Tech Spec Concepts | Implementation Vertical |
|--------|----------------|--------------------|--------------------------|
| PRD-R1 | [What the product needs] | [Model/module/API/contract] | V1 - [Vertical] |
| PRD-R2 | [What the product needs] | [Model/module/API/contract] | V2 - [Vertical] |
| PRD-R3 | [What the product needs] | [Model/module/API/contract] | V3 - [Vertical] |

## Vertical Build Order

| Vertical | Consumes | Produces | Why It Comes Here |
|----------|----------|----------|-------------------|
| V1 - [Name] | [Inputs/dependencies] | [Outputs/contracts] | [Ordering reason] |
| V2 - [Name] | [Inputs/dependencies] | [Outputs/contracts] | [Ordering reason] |
| V3 - [Name] | [Inputs/dependencies] | [Outputs/contracts] | [Ordering reason] |

## Data Models / Artifacts

Describe new or changed models, artifacts, schemas, or persisted files.

```text
[Model or artifact shape]
```

## Module Changes

| Module/File | Responsibility | PRD IDs |
|-------------|----------------|---------|
| `[path]` | [Responsibility] | PRD-R1 |
| `[path]` | [Responsibility] | PRD-R2 |

## API / CLI Changes

| Surface | Change | Request/Command | Response/Output | PRD IDs |
|---------|--------|-----------------|-----------------|---------|
| API | [NEW/UPDATE] | `[method/path]` | [Shape] | PRD-R1 |
| CLI | [NEW/UPDATE] | `[command]` | [Shape] | PRD-R2 |

## UI / Operator Surface Changes

Describe how the operator-facing surface changes and which artifacts it reads.

| Surface | Reads | Displays | PRD IDs |
|---------|-------|----------|---------|
| [Page/panel] | [Artifact/API] | [Operator truth] | PRD-R1 |

## Process / Scheduler Changes

Describe cron, launchd, background jobs, or operational workflow changes.

## Security / Safety Boundaries

- [Boundary 1]
- [Boundary 2]
- [Boundary 3]

## Risks

| Risk | Mitigation |
|------|------------|
| [Risk] | [Mitigation] |

## Test Strategy

Summarize the unit, integration, E2E, and live validation approach. Detailed coverage lives in the QA Plan.
