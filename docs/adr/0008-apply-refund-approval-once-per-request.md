# Apply approval once per Refund Request

A Platform Admin's approval takes effect once per Refund Request and affects only its Purchase. A stale or repeated decision reports the existing decision without changing the Enrollment again, protecting a learner who makes another Individual Purchase after approval.

## Consequences

- Decision and Enrollment or Seat changes occur in one transaction after checking the current Refund Request state.
- If one Platform Admin approves, the learner buys again, and another Platform Admin submits a stale approval, the new Enrollment remains intact.
- Every decision requires Platform Admin authority, including repeated decisions; Team Admin status alone is insufficient.
