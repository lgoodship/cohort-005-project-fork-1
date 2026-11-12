---
status: accepted
---

# End the purchase's access entitlement on approval

Approving an individual-purchase refund request ends the access entitlement granted by that purchase, while pending or declined requests leave that entitlement intact. Ending access at submission would lock out learners whose requests are declined; waiting for the subsequent refund is too late, so approval is the chosen boundary and supersedes the earlier issuance-based rule. Access granted by an independent purchase or staff authority remains intact.

## Consequences

- An approved request must not leave that purchase's entitlement active; the decision and its access effect must succeed together.
- A learner may continue studying while their request is pending review.
- Approval of an old purchase must not revoke access from a newer purchase, and refunding an instructor's personal purchase must not remove their authority to manage the course.
- Approval is not confirmation that payment processing has happened. Subsequent payment processing and any response to its failures remain outside this slice.
- Ending an entitlement does not erase learning history; see [ADR 0003](0003-preserve-learning-history-across-purchases.md).
