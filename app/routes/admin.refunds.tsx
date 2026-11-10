import { data, Link, useFetcher } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/admin.refunds";
import { db } from "~/db";
import {
  courses,
  purchases,
  refunds,
  users,
  RefundStatus,
  UserRole,
} from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { buildRefundEmail, refundStatusCopy } from "~/lib/refunds";
import {
  refundUpdateSchema,
  RefundUpdateError,
  updateRefund,
} from "~/lib/refunds.server";
import { formatPrice } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";

async function requireAdmin(request: Request) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("You must be logged in.", { status: 401 });
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (user?.role !== UserRole.Admin) {
    throw data("Only admins can manage refund requests.", { status: 403 });
  }
  return userId;
}

function getRefundRequests() {
  return db
    .select({
      id: refunds.id,
      status: refunds.status,
      reason: refunds.reason,
      reviewReason: refunds.reviewReason,
      paymentReference: refunds.paymentReference,
      requestedAt: refunds.requestedAt,
      courseTitle: courses.title,
      learnerName: users.name,
      learnerEmail: users.email,
      amountPaid: purchases.amountPaid,
    })
    .from(refunds)
    .innerJoin(purchases, eq(purchases.id, refunds.purchaseId))
    .innerJoin(courses, eq(courses.id, purchases.courseId))
    .innerJoin(users, eq(users.id, purchases.userId))
    .orderBy(desc(refunds.requestedAt), desc(refunds.id))
    .all();
}

export function meta() {
  return [{ title: "Refund Requests — Cadence" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return { refundRequests: getRefundRequests() };
}

export async function action({ request }: Route.ActionArgs) {
  const actorId = await requireAdmin(request);
  const parsed = parseFormData(await request.formData(), refundUpdateSchema);
  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }
  try {
    const refund = updateRefund(parsed.data, actorId);
    const details = db
      .select({
        learnerName: users.name,
        learnerEmail: users.email,
        courseTitle: courses.title,
        amountPaid: purchases.amountPaid,
      })
      .from(purchases)
      .innerJoin(users, eq(users.id, purchases.userId))
      .innerJoin(courses, eq(courses.id, purchases.courseId))
      .where(eq(purchases.id, refund.purchaseId))
      .get()!;
    const email = buildRefundEmail({
      ...details,
      status: refund.status,
      reviewReason: refund.reviewReason,
    });
    // Match the existing request-email transport until delivery is integrated.
    console.log(
      `[email] to=${email.to} subject=${email.subject}\n${email.body}`
    );
    return { success: true };
  } catch (error) {
    if (error instanceof RefundUpdateError)
      return data({ error: error.message }, { status: 409 });
    throw error;
  }
}

function RefundRequest({
  refund,
}: {
  refund: ReturnType<typeof getRefundRequests>[number];
}) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const canIssue =
    refund.status === RefundStatus.Approved ||
    refund.status === RefundStatus.ProcessingFailed;
  const canFail =
    refund.status === RefundStatus.Approved ||
    refund.status === RefundStatus.Issued;
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">
          {refund.courseTitle} · {refundStatusCopy[refund.status].label}
        </h2>
        <p className="text-sm text-muted-foreground">
          {refund.learnerName} ({refund.learnerEmail}) · Full refund:{" "}
          {formatPrice(refund.amountPaid)}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">Customer's reason: {refund.reason}</p>
        {refund.reviewReason && (
          <p className="text-sm">Reason for decline: {refund.reviewReason}</p>
        )}
        {refund.paymentReference && (
          <p className="text-sm">
            Payment service reference: {refund.paymentReference}
          </p>
        )}
        {fetcher.data && "error" in fetcher.data && (
          <p role="alert" className="text-sm text-destructive">
            {fetcher.data.error}
          </p>
        )}
        {fetcher.data && "success" in fetcher.data && (
          <p role="status" className="text-sm">
            Refund request updated.
          </p>
        )}
        {refund.status === RefundStatus.Requested && (
          <>
            <fetcher.Form method="post">
              <input type="hidden" name="refundId" value={refund.id} />
              <Button name="intent" value="approve" disabled={busy}>
                Approve refund request
              </Button>
              <p className="mt-2 text-sm text-muted-foreground">
                Approval does not issue a refund or end course access.
              </p>
            </fetcher.Form>
            <fetcher.Form method="post" className="space-y-2">
              <input type="hidden" name="refundId" value={refund.id} />
              <label htmlFor={`decline-${refund.id}`} className="text-sm">
                Reason for decline (shared with the customer)
              </label>
              <Textarea
                id={`decline-${refund.id}`}
                name="reviewReason"
                required
                maxLength={1000}
              />
              <Button
                name="intent"
                value="decline"
                variant="outline"
                disabled={busy}
              >
                Decline refund request
              </Button>
            </fetcher.Form>
          </>
        )}
        {canIssue && (
          <fetcher.Form method="post" className="space-y-2">
            <input type="hidden" name="refundId" value={refund.id} />
            <p className="text-sm">
              Record issuance only after the payment service accepts the full
              refund. Course access ends when this is recorded.
            </p>
            <label htmlFor={`reference-${refund.id}`} className="text-sm">
              Payment service refund reference
            </label>
            <Input
              id={`reference-${refund.id}`}
              name="paymentReference"
              required
              maxLength={200}
            />
            <Button name="intent" value="record-issued" disabled={busy}>
              Record refund issued
            </Button>
          </fetcher.Form>
        )}
        {canFail && (
          <fetcher.Form method="post" className="space-y-2">
            <input type="hidden" name="refundId" value={refund.id} />
            <p className="text-sm">
              Record a failure reported by the payment service. Approval stands
              and any removed course access is restored.
            </p>
            <Button
              name="intent"
              value="record-failed"
              variant="outline"
              disabled={busy}
            >
              Record refund processing failed
            </Button>
          </fetcher.Form>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <Link to="/admin/users" className="text-sm hover:underline">
        Manage users
      </Link>
      <h1 className="text-2xl font-bold">Refund requests</h1>
      <p className="text-sm text-muted-foreground">
        Review requests and record confirmed payment outcomes. Recording an
        outcome here does not move money.
      </p>
      {loaderData.refundRequests.length === 0 && <p>No refund requests yet.</p>}
      {loaderData.refundRequests.map((refund) => (
        <RefundRequest key={refund.id} refund={refund} />
      ))}
    </div>
  );
}
