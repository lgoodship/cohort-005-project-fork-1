# Base a Refund on the Purchase's original amount paid

A Refund returns the amount paid for its Purchase, including discounts, regardless of later course-price changes. The Refund Request form, Platform Admin review, Settings and emails use that same amount to avoid promising a different sum.

## Consequences

- A buyer who paid 80 for a course later priced at 200 raises a Refund Request for 80.
- Another Purchase has its own amount; it cannot change the amount on an earlier Refund Request.
- Approval establishes the approved amount but does not confirm that a Refund has occurred; payment processing remains separate.
