# Approval ends the refunded Purchase's contribution to Enrollment

A learner keeps their Enrollment while a Refund Request is open. Approval ends the Individual Purchase's contribution to that Enrollment immediately; the Enrollment remains if another Individual Purchase or claimed Seat still grants access, as described in [ADR 0004](0004-a-place-on-a-course-is-not-tied-to-a-purchase.md).

## Considered Options

- **At submission**: rejected because a learner whose Refund Request is declined would lose their Enrollment unnecessarily.
- **When money is returned**: rejected because payment processing is separate and a payment failure must not undo the Platform Admin's decision. Approval is a decision, not confirmation of a Refund.
