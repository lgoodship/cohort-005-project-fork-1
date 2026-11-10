import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "~/db/schema";
import {
  CourseStatus,
  LessonProgressStatus,
  RefundStatus,
  UserRole,
} from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { getAccess } from "~/lib/access.server";
import { buildRefundEmail, refundStatusCopy } from "~/lib/refunds";
import { refundUpdateSchema, updateRefund } from "~/lib/refunds.server";
import { action as requestRefund } from "~/routes/courses.$slug.refund";
import {
  action as adminAction,
  loader as adminLoader,
} from "~/routes/admin.refunds";
import { loader as settingsLoader } from "~/routes/settings";
import { action as redeemCoupon } from "~/routes/redeem.$code";

let sqlite: Database.Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
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
    "http://localhost/settings",
    body ? { method: "POST", body: new URLSearchParams(body) } : undefined
  );
}

function refund() {
  return testDb
    .select()
    .from(schema.refunds)
    .where(eq(schema.refunds.id, 1))
    .get()!;
}

function enrollment() {
  return testDb
    .select()
    .from(schema.enrollments)
    .where(eq(schema.enrollments.userId, 2))
    .get();
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "drizzle" });
  testDb
    .insert(schema.users)
    .values([
      {
        id: 1,
        name: "Admin",
        email: "admin@example.com",
        role: UserRole.Admin,
      },
      {
        id: 2,
        name: "Learner",
        email: "learner@example.com",
        role: UserRole.Student,
      },
      {
        id: 3,
        name: "Other learner",
        email: "other@example.com",
        role: UserRole.Student,
      },
    ])
    .run();
  testDb
    .insert(schema.categories)
    .values({ id: 1, name: "Courses", slug: "courses" })
    .run();
  testDb
    .insert(schema.courses)
    .values({
      id: 1,
      title: "Example course",
      slug: "example",
      description: "Example",
      salesCopy: "Example",
      instructorId: 1,
      categoryId: 1,
      status: CourseStatus.Published,
      price: 20000,
      pppEnabled: false,
    })
    .run();
  testDb
    .insert(schema.modules)
    .values({ id: 1, courseId: 1, title: "Module", position: 1 })
    .run();
  testDb
    .insert(schema.lessons)
    .values({ id: 1, moduleId: 1, title: "Lesson", position: 1 })
    .run();
  testDb
    .insert(schema.purchases)
    .values({ id: 1, userId: 2, courseId: 1, amountPaid: 8000, country: "US" })
    .run();
  testDb
    .insert(schema.enrollments)
    .values({
      userId: 2,
      courseId: 1,
      enrolledAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-02T00:00:00.000Z",
    })
    .run();
  testDb
    .insert(schema.lessonProgress)
    .values({ userId: 2, lessonId: 1, status: LessonProgressStatus.Completed })
    .run();
  testDb
    .insert(schema.refunds)
    .values({
      id: 1,
      purchaseId: 1,
      reason: "The course does not meet my needs.",
    })
    .run();
  vi.mocked(getCurrentUserId).mockResolvedValue(2);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  sqlite.close();
  vi.restoreAllMocks();
});

describe("refund review and access lifecycle", () => {
  it("keeps approval separate from issuance, restores access after failure, and allows retry", async () => {
    const original = enrollment()!;
    expect((await getAccess(request(), 1)).canViewContent).toBe(true);
    updateRefund({ intent: "approve", refundId: 1 }, 1);
    expect(refund().status).toBe(RefundStatus.Approved);
    expect(refund().amountRefunded).toBeNull();
    expect((await getAccess(request(), 1)).canViewContent).toBe(true);

    updateRefund(
      { intent: "record-issued", refundId: 1, paymentReference: "pay-123" },
      1
    );
    expect(refund().amountRefunded).toBe(8000);
    expect(refund().paymentReference).toBe("pay-123");
    expect(enrollment()).toBeUndefined();
    expect((await getAccess(request(), 1)).canViewContent).toBe(false);

    updateRefund({ intent: "record-failed", refundId: 1 }, 1);
    expect(refund().status).toBe(RefundStatus.ProcessingFailed);
    expect(refund().amountRefunded).toBeNull();
    expect(enrollment()).toMatchObject({
      enrolledAt: original.enrolledAt,
      completedAt: original.completedAt,
    });
    expect((await getAccess(request(), 1)).canViewContent).toBe(true);
    expect(testDb.select().from(schema.lessonProgress).all()).toHaveLength(1);

    updateRefund(
      { intent: "record-issued", refundId: 1, paymentReference: "pay-456" },
      1
    );
    expect(refund().status).toBe(RefundStatus.Issued);
    expect((await getAccess(request(), 1)).canViewContent).toBe(false);
  });

  it("retains access and approval when processing fails before issuance", () => {
    const original = enrollment();
    updateRefund({ intent: "approve", refundId: 1 }, 1);
    updateRefund({ intent: "record-failed", refundId: 1 }, 1);
    expect(enrollment()).toEqual(original);
    expect(refund().resolvedByUserId).toBe(1);
    expect(() =>
      updateRefund({ intent: "decline", refundId: 1, reviewReason: "No" }, 1)
    ).toThrow();
  });

  it("does not issue unapproved refunds or accept repeated issuance", () => {
    expect(() =>
      updateRefund(
        { intent: "record-issued", refundId: 1, paymentReference: "pay" },
        1
      )
    ).toThrow();
    expect(enrollment()).toBeDefined();
    updateRefund({ intent: "approve", refundId: 1 }, 1);
    updateRefund(
      { intent: "record-issued", refundId: 1, paymentReference: "pay" },
      1
    );
    expect(() =>
      updateRefund(
        { intent: "record-issued", refundId: 1, paymentReference: "pay" },
        1
      )
    ).toThrow();
  });

  it("does not revoke a newer personal purchase when retrying an older refund", () => {
    updateRefund({ intent: "approve", refundId: 1 }, 1);
    updateRefund(
      { intent: "record-issued", refundId: 1, paymentReference: "old" },
      1
    );
    testDb
      .insert(schema.purchases)
      .values({
        userId: 2,
        courseId: 1,
        amountPaid: 20000,
        createdAt: "2099-01-01",
      })
      .run();
    testDb.insert(schema.enrollments).values({ userId: 2, courseId: 1 }).run();
    const newerEnrollment = enrollment();
    updateRefund({ intent: "record-failed", refundId: 1 }, 1);
    expect(enrollment()).toEqual(newerEnrollment);
    updateRefund(
      { intent: "record-issued", refundId: 1, paymentReference: "retry" },
      1
    );
    expect(enrollment()).toEqual(newerEnrollment);
  });

  it("blocks issuance if a team seat has since been claimed", () => {
    const team = testDb.insert(schema.teams).values({}).returning().get()!;
    testDb
      .insert(schema.coupons)
      .values({
        code: "claimed",
        courseId: 1,
        purchaseId: 1,
        teamId: team.id,
        redeemedAt: new Date().toISOString(),
        redeemedByUserId: 3,
      })
      .run();
    updateRefund({ intent: "approve", refundId: 1 }, 1);
    expect(() =>
      updateRefund(
        { intent: "record-issued", refundId: 1, paymentReference: "pay" },
        1
      )
    ).toThrow(/claimed team seat/);
    expect(refund().status).toBe(RefundStatus.Approved);
    expect(enrollment()).toBeDefined();
  });

  it("prevents redemption of team coupons after issuance and enables them again after failure", async () => {
    const team = testDb.insert(schema.teams).values({}).returning().get()!;
    testDb
      .insert(schema.coupons)
      .values({
        code: "unclaimed",
        courseId: 1,
        purchaseId: 1,
        teamId: team.id,
      })
      .run();
    updateRefund({ intent: "approve", refundId: 1 }, 1);
    updateRefund(
      { intent: "record-issued", refundId: 1, paymentReference: "pay" },
      1
    );
    expect(enrollment()).toBeDefined(); // A team purchase does not own the purchaser's personal access.
    vi.mocked(getCurrentUserId).mockResolvedValue(3);
    const args = () =>
      ({
        request: request({ intent: "confirm-redeem" }),
        params: { code: "unclaimed" },
        context: {},
      }) as Parameters<typeof redeemCoupon>[0];
    const blocked = await redeemCoupon(args());
    expect(blocked).toMatchObject({
      data: { error: expect.stringContaining("refund has been issued") },
    });
    updateRefund({ intent: "record-failed", refundId: 1 }, 1);
    await expect(redeemCoupon(args())).rejects.toMatchObject({ status: 302 });
    expect(
      testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.userId, 3))
        .get()
    ).toBeDefined();
  });
});

describe("customer and admin refund routes", () => {
  it("uses the original amount in the request email despite a later course price", async () => {
    testDb.delete(schema.refunds).run();
    const response = await requestRefund({
      request: request({ reason: "The course does not meet my needs." }),
      params: { slug: "example" },
      context: {},
    } as Parameters<typeof requestRefund>[0]);
    expect(response).toMatchObject({ status: 302 });
    expect(testDb.select().from(schema.refunds).get()?.status).toBe(
      RefundStatus.Requested
    );
    expect(enrollment()).toBeDefined();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Full refund amount: $80.00")
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Pending review")
    );
  });

  it.each([
    RefundStatus.Requested,
    RefundStatus.Approved,
    RefundStatus.Issued,
    RefundStatus.ProcessingFailed,
  ])("rejects a new request when one already has status %s", async (status) => {
    testDb.update(schema.refunds).set({ status }).run();
    await expect(
      requestRefund({
        request: request({ reason: "Another refund request." }),
        params: { slug: "example" },
        context: {},
      } as Parameters<typeof requestRefund>[0])
    ).rejects.toMatchObject({ init: { status: 409 } });
    expect(testDb.select().from(schema.refunds).all()).toHaveLength(1);
  });

  it("shows a decline reason in settings and the matching email without changing access", async () => {
    updateRefund(
      {
        intent: "decline",
        refundId: 1,
        reviewReason: "Outside the request window.",
      },
      1
    );
    const settings = await settingsLoader({
      request: request(),
      params: {},
      context: {},
    } as Parameters<typeof settingsLoader>[0]);
    expect(settings.refundRequests[0]).toMatchObject({
      status: RefundStatus.Declined,
      amountPaid: 8000,
      reviewReason: "Outside the request window.",
    });
    const email = buildRefundEmail({
      learnerName: "Learner",
      learnerEmail: "learner@example.com",
      courseTitle: "Example",
      amountPaid: 8000,
      status: RefundStatus.Declined,
      reviewReason: refund().reviewReason,
    });
    expect(email.body).toContain(
      refundStatusCopy[RefundStatus.Declined].description
    );
    expect(email.body).toContain("Reason: Outside the request window.");
    expect((await getAccess(request(), 1)).canViewContent).toBe(true);
  });

  it("rejects non-admin review and requires a decline reason or payment reference", async () => {
    await expect(
      adminLoader({ request: request(), params: {}, context: {} } as Parameters<
        typeof adminLoader
      >[0])
    ).rejects.toMatchObject({ init: { status: 403 } });
    await expect(
      adminAction({
        request: request({ intent: "approve", refundId: "1" }),
        params: {},
        context: {},
      } as Parameters<typeof adminAction>[0])
    ).rejects.toMatchObject({ init: { status: 403 } });
    expect(refund().status).toBe(RefundStatus.Requested);
    expect(
      refundUpdateSchema.safeParse({
        intent: "decline",
        refundId: 1,
        reviewReason: " ",
      }).success
    ).toBe(false);
    expect(
      refundUpdateSchema.safeParse({
        intent: "record-issued",
        refundId: 1,
        paymentReference: " ",
      }).success
    ).toBe(false);
  });

  it("lets admins approve a request and builds the matching status email", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue(1);
    const response = await adminAction({
      request: request({ intent: "approve", refundId: "1" }),
      params: {},
      context: {},
    } as Parameters<typeof adminAction>[0]);
    expect(response).toEqual({ success: true });
    expect(refund().status).toBe(RefundStatus.Approved);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        refundStatusCopy[RefundStatus.Approved].description
      )
    );
  });
});
