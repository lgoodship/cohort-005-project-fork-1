import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  coupons,
  enrollments,
  purchases,
  refunds,
  RefundStatus,
} from "~/db/schema";

export const refundUpdateSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("approve"),
    refundId: z.coerce.number().int().positive(),
  }),
  z.object({
    intent: z.literal("decline"),
    refundId: z.coerce.number().int().positive(),
    reviewReason: z
      .string()
      .trim()
      .min(1, "Explain why the request is declined.")
      .max(1000),
  }),
  z.object({
    intent: z.literal("record-issued"),
    refundId: z.coerce.number().int().positive(),
    paymentReference: z
      .string()
      .trim()
      .min(1, "Enter the payment service's refund reference.")
      .max(200),
  }),
  z.object({
    intent: z.literal("record-failed"),
    refundId: z.coerce.number().int().positive(),
  }),
]);

export class RefundUpdateError extends Error {}

// This records a team's review or a confirmed payment-service outcome; it does
// not call a payment service or move money. Issuance must never follow approval
// automatically: the payment service must first accept the refund.
export function updateRefund(
  input: z.infer<typeof refundUpdateSchema>,
  actorId: number
) {
  return db.transaction((tx) => {
    const refund = tx
      .select()
      .from(refunds)
      .where(eq(refunds.id, input.refundId))
      .get();
    if (!refund) throw new RefundUpdateError("Refund request not found.");
    const purchase = tx
      .select()
      .from(purchases)
      .where(eq(purchases.id, refund.purchaseId))
      .get();
    if (!purchase) throw new RefundUpdateError("Purchase not found.");

    const now = new Date().toISOString();
    let changes: Partial<typeof refunds.$inferInsert>;
    if (input.intent === "approve" || input.intent === "decline") {
      if (refund.status !== RefundStatus.Requested) {
        throw new RefundUpdateError(
          "Only requests pending review can be approved or declined."
        );
      }
      changes = {
        status:
          input.intent === "approve"
            ? RefundStatus.Approved
            : RefundStatus.Declined,
        resolvedAt: now,
        resolvedByUserId: actorId,
        reviewReason: input.intent === "decline" ? input.reviewReason : null,
      };
    } else if (input.intent === "record-issued") {
      if (
        refund.status !== RefundStatus.Approved &&
        refund.status !== RefundStatus.ProcessingFailed
      ) {
        throw new RefundUpdateError(
          "Only an approved refund can be recorded as issued."
        );
      }
      const claimedSeat = tx
        .select({ id: coupons.id })
        .from(coupons)
        .where(
          and(
            eq(coupons.purchaseId, purchase.id),
            isNotNull(coupons.redeemedAt)
          )
        )
        .get();
      if (claimedSeat)
        throw new RefundUpdateError(
          "This purchase now has a claimed team seat. Resolve it before issuing a refund."
        );

      const teamPurchase = tx
        .select({ id: coupons.id })
        .from(coupons)
        .where(eq(coupons.purchaseId, purchase.id))
        .get();
      const latestPurchase = tx
        .select({ id: purchases.id })
        .from(purchases)
        .where(
          and(
            eq(purchases.userId, purchase.userId),
            eq(purchases.courseId, purchase.courseId)
          )
        )
        .orderBy(desc(purchases.createdAt), desc(purchases.id))
        .get();
      // A refund on an older or team purchase must not revoke a separate,
      // current personal enrollment.
      const enrollment =
        !teamPurchase && latestPurchase?.id === purchase.id
          ? tx
              .select()
              .from(enrollments)
              .where(
                and(
                  eq(enrollments.userId, purchase.userId),
                  eq(enrollments.courseId, purchase.courseId)
                )
              )
              .get()
          : undefined;
      if (enrollment)
        tx.delete(enrollments)
          .where(
            and(
              eq(enrollments.userId, purchase.userId),
              eq(enrollments.courseId, purchase.courseId)
            )
          )
          .run();
      changes = {
        status: RefundStatus.Issued,
        amountRefunded: purchase.amountPaid,
        paymentReference: input.paymentReference,
        issuedAt: now,
        enrollmentSnapshot: enrollment ?? null,
      };
    } else {
      if (
        refund.status !== RefundStatus.Approved &&
        refund.status !== RefundStatus.Issued
      ) {
        throw new RefundUpdateError(
          "Only an approved or issued refund can encounter a processing failure."
        );
      }
      if (refund.enrollmentSnapshot) {
        const existing = tx
          .select({ id: enrollments.id })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.userId, purchase.userId),
              eq(enrollments.courseId, purchase.courseId)
            )
          )
          .get();
        if (!existing) {
          const { id: _id, ...enrollment } = refund.enrollmentSnapshot;
          tx.insert(enrollments).values(enrollment).run();
        }
      }
      changes = {
        status: RefundStatus.ProcessingFailed,
        amountRefunded: null,
        enrollmentSnapshot: null,
      };
    }
    return tx
      .update(refunds)
      .set(changes)
      .where(eq(refunds.id, refund.id))
      .returning()
      .get()!;
  });
}
