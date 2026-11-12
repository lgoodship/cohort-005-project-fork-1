---
status: accepted
---

# Apply approval once to the request and its purchase

Approval takes effect once per refund request and affects only the purchase that request references. Two Platform Admins may review the same pending request, so a stale or repeated approval must report that the request is already approved without repeating its access effect. This protects both concurrent review and a learner who repurchases between the first approval and a later stale click.

## Consequences

- The action must check the current request state when applying the decision; the state shown on a previously loaded screen is insufficient.
- Repeated approval cannot re-run a general removal of the learner's current course access.
- Scenario: Admin A approves purchase A, the learner buys purchase B, and Admin B submits approval from an old screen. Purchase B retains access and the second action makes no further change.
- Authorization remains necessary even for a repeated action; see [ADR 0001](0001-platform-admin-individual-refund-review.md).
