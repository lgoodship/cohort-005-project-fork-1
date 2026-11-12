# Refund decisions

These ADRs record accepted product and domain decisions from the refund glossary and scenario walkthroughs. **Accepted means the design is agreed; it does not mean the current code implements it.** The [glossary](../../GLOSSARY.md) defines the terms; these records preserve the reasons and trade-offs behind them.

| ADR | Decision |
| --- | --- |
| [0001](0001-platform-admin-individual-refund-review.md) | Platform Admins decide individual-purchase refund requests; team refunds and payment processing are separate concerns. |
| [0002](0002-end-purchase-access-on-approval.md) | Approval ends the refunded purchase's access entitlement. |
| [0003](0003-preserve-learning-history-across-purchases.md) | Learning history survives approval and repurchase; a new purchase starts a new refund window. |
| [0004](0004-treat-usage-rules-as-advisory.md) | Usage breaches flag requests without blocking submission or Platform Admin approval. |
| [0005](0005-review-live-progress-and-submission-time-deadline.md) | Review uses live progress, but deadline eligibility is assessed at submission. |
| [0006](0006-label-video-position-evidence-honestly.md) | Existing video positions provide progress evidence, not measured viewing time. |
| [0007](0007-apply-refund-approval-once-per-request.md) | Approval takes effect once per request and cannot affect a later purchase. |
| [0008](0008-base-full-refunds-on-original-amount-paid.md) | A full refund uses the original amount paid, including discounts. |

## Current implementation gaps

The branch already has an admin-only review screen and approval action. It currently ends access at refund issuance, omits progress and rule flags from review, and blocks some usage-ineligible requests before review. Those behaviours need to change to meet these ADRs.

The existing workflow also records payment outcomes and restores access after processing failure. Payment processing after approval is outside this design slice; that existing behaviour is not a decision to reinstate access under the revised approval model.

The [current workflow notes](../refunds.md) describe existing code. Future implementation and tests should follow these ADRs where they differ from those notes.
