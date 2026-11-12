# Refund requests

The [glossary](../GLOSSARY.md) defines the shared terms. Platform Admins decide requests for a specific Purchase; Team Admin status alone grants no review authority. Buyers request Individual Purchase refunds from the course page and Team Licence refunds from the team page, and track decisions in Settings.

The deadline is 14 calendar days after purchase, inclusive. Lesson completion of at least 50% and Watched of at least one hour are advisory flags, not submission or approval gates. Review shows live usage and calendar-day purchase age, but judges the deadline at submission so review delays do not invalidate an on-time request. Watched sums the furthest recorded position per lesson; it does not measure elapsed viewing time.

Approval removes the learner's Enrollment only when no other Individual Purchase or claimed Seat still grants access, preserving learning history in either case. Decline requires a note, leaves access intact and permits another request within the window. Decisions are transactional and a repeated decision returns a conflict without changing access again.

A Team Licence with any claimed Seat cannot be refunded. Its unclaimed Seats are held while a Refund Request is open, released after decline and permanently disabled after approval. Approval rechecks claimed Seats before applying the decision.

All displayed refund amounts use the original amount paid, including discounts. Approval records a decision and the approved amount in the legacy `amount_refunded` column; it does not call a payment service or establish that money was sent. There are no issuance/failure actions or automatic access restoration on payment failure. Emails are logged to the server console; delivery is not integrated.

## Reconciliation

This implementation combines the lesson branch's purchase-specific and team-seat behavior with the accepted decisions on `feature/refund-language-and-lifecycle`: approval-time access removal, independent access protection, retained learning history, advisory usage flags, live review evidence, repeat-decision protection and original purchase amounts. The older issuance-time access removal and failure-driven restoration are superseded. The lesson's submission-time usage blocks and payment-promising approval copy are superseded as well.

The authoritative migration chain is `0010_cuddly_red_skull` followed by `0011_volatile_sasquatch`, upgrading main's original schema and converting `requested` to `open`. The competing `0010_fine_exiles` migration was never merged and is excluded. Databases manually created from that unmerged branch must be reseeded rather than mixing migration chains.

For a main-branch database, run `npm run db:migrate`. For disposable development data, `npm run db:seed` rebuilds the database and includes an individual and a team refund request. The preserved rationale is in [docs/adr](adr/).
