# Refund requests

[The glossary](../GLOSSARY.md) defines the language shared by the application and refund emails.

Customers request a full refund from the course page and track its status in Settings. The amount is always the original purchase's amount paid, including any discount.

Admins review requests under **Refund Requests** in the sidebar (`/admin/refunds`). Approval keeps course access and does not issue a refund. Declining requires a reason shared with the customer.

Payment processing is currently external to the application. After the payment service accepts a full refund, an admin records **Refund issued** with the service's refund reference. This ends access for that personal purchase and prevents redemption of coupons belonging to a refunded team purchase. Issuance is blocked if a team seat has already been claimed.

If the payment service reports a failure, an admin records **Refund processing failed**. Approval stands, any removed enrollment is restored with its original dates, and lesson progress is preserved. Once the service accepts a retry, the admin records issuance again with its reference. An older purchase's refund does not revoke access from a newer purchase.

Refund emails use the same status descriptions as Settings. The existing email transport logs messages to the server console; delivery and automatic payment-service callbacks are not integrated.

For an existing local database, apply the additive migration with `npm run db:migrate`. `npm run db:seed` rebuilds the database with review examples; to verify the seed separately, set `CADENCE_SEED_DATABASE` to a temporary database path.
