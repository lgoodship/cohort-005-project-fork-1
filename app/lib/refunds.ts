import { RefundStatus } from "~/db/schema";
import { formatPrice } from "~/lib/utils";

// Shared by customer screens and email so a status always has the same meaning.
export const refundStatusCopy: Record<
  RefundStatus,
  { label: string; description: string }
> = {
  [RefundStatus.Requested]: {
    label: "Pending review",
    description:
      "We have received your refund request. Our team will review it and decide whether to approve or decline it. You retain course access while we review it.",
  },
  [RefundStatus.Approved]: {
    label: "Approved",
    description:
      "Your refund request is approved. The refund has not been issued yet. You retain course access until it is issued.",
  },
  [RefundStatus.Declined]: {
    label: "Refund request declined",
    description:
      "Our team reviewed your refund request and decided not to grant it. Your course access is unchanged.",
  },
  [RefundStatus.Issued]: {
    label: "Refund issued",
    description:
      "The payment service has accepted your refund for processing. It may take time to appear in your account. Your access to this course has ended.",
  },
  [RefundStatus.ProcessingFailed]: {
    label: "Refund processing failed",
    description:
      "Your refund is approved, but we couldn't process it. Our team will follow up. You retain course access and do not need to submit another refund request.",
  },
};

export function buildRefundEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amountPaid: number;
  status: RefundStatus;
  reviewReason?: string | null;
}) {
  const copy = refundStatusCopy[input.status];
  return {
    to: input.learnerEmail,
    subject: `Refund request: ${copy.label} — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `Refund request for "${input.courseTitle}" — ${copy.label}.`,
      `Full refund amount: ${formatPrice(input.amountPaid)}, the amount you paid.`,
      "",
      copy.description,
      ...(input.status === RefundStatus.Declined && input.reviewReason
        ? ["", `Reason: ${input.reviewReason}`]
        : []),
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}
