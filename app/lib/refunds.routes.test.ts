import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import {
  approveRefundRequest,
  declineRefundRequest,
  raiseRefundRequest,
} from "~/lib/refunds.server";
import {
  action as adminAction,
  loader as adminLoader,
} from "~/routes/admin.refunds";
import { action as requestRefund } from "~/routes/courses.$slug.refund";
import { action as redeemSeat } from "~/routes/redeem.$code";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let purchase: typeof schema.purchases.$inferSelect;
vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));
vi.mock("~/lib/session", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("~/lib/country.server", () => ({
  resolveCountry: vi.fn(async () => "US"),
}));

function request(body?: Record<string, string>) {
  return new Request(
    "http://localhost/admin/refunds",
    body ? { method: "POST", body: new URLSearchParams(body) } : undefined
  );
}

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  purchase = testDb
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 2500,
    })
    .returning()
    .get();
  vi.mocked(getCurrentUserId).mockResolvedValue(base.user.id);
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("refund route boundaries", () => {
  it("refuses unauthenticated review and direct decisions by a Team Admin", async () => {
    const team = testDb.insert(schema.teams).values({}).returning().get();
    testDb
      .insert(schema.teamMembers)
      .values({
        teamId: team.id,
        userId: base.user.id,
        role: schema.TeamMemberRole.Admin,
      })
      .run();
    const result = raiseRefundRequest(
      testDb,
      purchase.id,
      base.user.id,
      "Wrong course.",
      new Date()
    );
    if (!result.ok) throw new Error(result.error);
    vi.mocked(getCurrentUserId).mockResolvedValue(null);
    await expect(
      adminLoader({
        request: request(),
        url: new URL("http://localhost/admin/refunds"),
      } as Parameters<typeof adminLoader>[0])
    ).rejects.toMatchObject({ init: { status: 401 } });
    vi.mocked(getCurrentUserId).mockResolvedValue(base.user.id);
    await expect(
      adminLoader({
        request: request(),
        url: new URL("http://localhost/admin/refunds"),
      } as Parameters<typeof adminLoader>[0])
    ).rejects.toMatchObject({ init: { status: 403 } });
    await expect(
      adminAction({
        request: request({
          intent: "approve",
          refundRequestId: String(result.refundRequestId),
        }),
      } as Parameters<typeof adminAction>[0])
    ).rejects.toMatchObject({ init: { status: 403 } });
    expect(testDb.select().from(schema.refunds).get()?.status).toBe(
      schema.RefundStatus.Open
    );
  });

  it("rejects another buyer's purchase and a mismatched course", async () => {
    const other = testDb
      .insert(schema.users)
      .values({
        name: "Other",
        email: "other@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    vi.mocked(getCurrentUserId).mockResolvedValue(other.id);
    await expect(
      requestRefund({
        request: request({
          purchaseId: String(purchase.id),
          reason: "This is not my purchase.",
        }),
        params: { slug: base.course.slug },
      } as Parameters<typeof requestRefund>[0])
    ).rejects.toMatchObject({ init: { status: 404 } });
    const otherCourse = testDb
      .insert(schema.courses)
      .values({ ...base.course, id: undefined, slug: "other" })
      .returning()
      .get();
    vi.mocked(getCurrentUserId).mockResolvedValue(base.user.id);
    await expect(
      requestRefund({
        request: request({
          purchaseId: String(purchase.id),
          reason: "This is the wrong course.",
        }),
        params: { slug: otherCourse.slug },
      } as Parameters<typeof requestRefund>[0])
    ).rejects.toMatchObject({ init: { status: 404 } });
    expect(testDb.select().from(schema.refunds).all()).toHaveLength(0);
  });

  it("lets a Platform Admin approve without treating approval as payment", async () => {
    const admin = testDb
      .insert(schema.users)
      .values({
        name: "Admin",
        email: "admin@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();
    const raised = raiseRefundRequest(
      testDb,
      purchase.id,
      base.user.id,
      "Wrong course.",
      new Date()
    );
    if (!raised.ok) throw new Error(raised.error);
    vi.mocked(getCurrentUserId).mockResolvedValue(admin.id);
    await adminAction({
      request: request({
        intent: "approve",
        refundRequestId: String(raised.refundRequestId),
      }),
    } as Parameters<typeof adminAction>[0]);
    expect(testDb.select().from(schema.refunds).get()?.status).toBe(
      schema.RefundStatus.Approved
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("does not confirm that money has been sent")
    );
  });

  it.each(["open", "approved", "declined"] as const)(
    "enforces %s team-request seat availability at redemption",
    async (status) => {
      const team = testDb.insert(schema.teams).values({}).returning().get();
      const seat = testDb
        .insert(schema.coupons)
        .values({
          teamId: team.id,
          courseId: base.course.id,
          purchaseId: purchase.id,
          code: "TEAM-SEAT",
        })
        .returning()
        .get();
      const raised = raiseRefundRequest(
        testDb,
        purchase.id,
        base.user.id,
        "Team changed.",
        new Date()
      );
      if (!raised.ok) throw new Error(raised.error);
      const admin = testDb
        .insert(schema.users)
        .values({
          name: "Admin",
          email: "admin@example.com",
          role: schema.UserRole.Admin,
        })
        .returning()
        .get();
      if (status === "approved")
        approveRefundRequest(
          testDb,
          raised.refundRequestId,
          admin.id,
          null,
          new Date()
        );
      if (status === "declined")
        declineRefundRequest(
          testDb,
          raised.refundRequestId,
          admin.id,
          "Please keep the seats.",
          new Date()
        );
      const args = {
        request: request({ intent: "confirm-redeem" }),
        params: { code: seat.code },
      } as Parameters<typeof redeemSeat>[0];
      if (status === "declined") {
        await expect(redeemSeat(args)).rejects.toMatchObject({ status: 302 });
        expect(
          testDb
            .select()
            .from(schema.coupons)
            .where(eq(schema.coupons.id, seat.id))
            .get()?.redeemedByUserId
        ).toBe(base.user.id);
      } else {
        await expect(redeemSeat(args)).rejects.toMatchObject({
          init: { status: 400 },
        });
        expect(
          testDb
            .select()
            .from(schema.coupons)
            .where(eq(schema.coupons.id, seat.id))
            .get()?.redeemedAt
        ).toBeNull();
      }
    }
  );
});
