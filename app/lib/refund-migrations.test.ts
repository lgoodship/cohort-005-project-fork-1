import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import * as schema from "~/db/schema";
import { seedBaseData } from "~/test/setup";

it("upgrades main's existing requested refunds without losing their data", () => {
  const folder = mkdtempSync(join(tmpdir(), "cadence-main-migrations-"));
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  try {
    const migrations = resolve("drizzle");
    const journal = JSON.parse(
      readFileSync(join(migrations, "meta/_journal.json"), "utf8")
    ) as {
      entries: { idx: number; tag: string }[];
    };
    const initialJournal = {
      ...journal,
      entries: journal.entries.filter((entry) => entry.idx < 10),
    };
    mkdirSync(join(folder, "meta"));
    writeFileSync(
      join(folder, "meta/_journal.json"),
      JSON.stringify(initialJournal)
    );
    for (const entry of initialJournal.entries) {
      copyFileSync(
        join(migrations, `${entry.tag}.sql`),
        join(folder, `${entry.tag}.sql`)
      );
    }
    migrate(db, { migrationsFolder: folder });
    const base = seedBaseData(db);
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 2500,
      })
      .returning()
      .get();
    sqlite
      .prepare(
        "INSERT INTO refunds (purchase_id, status, reason, requested_at) VALUES (?, 'requested', ?, ?)"
      )
      .run(purchase.id, "Keep this request", "2026-10-01T12:00:00Z");
    migrate(db, { migrationsFolder: migrations });

    expect(db.select().from(schema.refunds).get()).toMatchObject({
      purchaseId: purchase.id,
      status: schema.RefundStatus.Open,
      reason: "Keep this request",
      requestedAt: "2026-10-01T12:00:00Z",
      decisionNote: null,
    });
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(sqlite.prepare("PRAGMA table_info(coupons)").all()).toContainEqual(
      expect.objectContaining({ name: "refunded_at" })
    );
  } finally {
    sqlite.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
