---
status: accepted
---

# Preserve learning history independently of purchases

Lesson progress, quiz results, and video watch history belong to the learner and course and survive approval of a refund request: deletion cannot be undone, and watch history is evidence behind the review decision. The learner may buy the course again, creating a new purchase, a new access entitlement, and a fresh 14-day refund window. Repurchasing resumes retained learning progress, which continues to count toward usage flags rather than making the course appear unused.

## Consequences

- Revoking access must not delete or reset lesson progress, quiz results, or video watch history.
- Someone who completed 60% before approval resumes at 60% after repurchasing; a subsequent request is assessed against that retained progress.
- The new purchase's date governs its refund window, while course usage remains cumulative across purchases.
- A progress flag does not prevent the learner from submitting the new request or prevent a Platform Admin from approving it; see [ADR 0004](0004-treat-usage-rules-as-advisory.md).
