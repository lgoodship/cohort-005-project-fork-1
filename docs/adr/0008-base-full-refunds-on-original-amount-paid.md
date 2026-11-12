---
status: accepted
---

# Base a full refund on the original amount paid

A full refund uses the amount actually paid for the purchase, including any discount, regardless of later course-price changes or the purchaser's discount category. Using the current course price can produce conflicting amounts between the request form, review screen, settings, and email, and can promise a different amount from the original payment. Those surfaces must refer to the same purchase amount even though payment processing itself is outside the approval slice.

## Consequences

- A customer who paid 80 for a course later priced at 200 requests a full refund of 80.
- A subsequent purchase has its own amount paid; an older request must not use that newer amount.
- Displaying a full refund amount does not imply approval, issuance, or receipt of money.
