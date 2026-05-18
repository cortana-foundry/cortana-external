# Planning Templates

Use these templates for durable planning workstreams across this repo.

Copy all four files for a meaningful feature or architecture track:

- [PRD](prd.md)
- [Tech Spec](tech-spec.md)
- [Implementation Plan](implementation-plan.md)
- [QA Plan](qa-plan.md)

Traceability rule:

```text
PRD requirement ID
-> Tech Spec concept
-> Implementation vertical
-> QA coverage
```

Every high-level PRD requirement should have a stable ID such as `PRD-R1`, and every Tech Spec, Implementation Plan, and QA Plan should map back to those IDs.
