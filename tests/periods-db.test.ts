// "This month" and year pages against the seeded test database. Skipped when TEST_DATABASE_URL is not set.
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("period queries (database)", () => {
  let q: typeof import("../src/lib/queries");
  let p: typeof import("../src/lib/periods");
  let db: ReturnType<typeof import("../src/lib/db").getDb>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    const { getDb } = await import("../src/lib/db");
    const { importSeed } = await import("../src/lib/seed/import");
    const { normalizeSeed } = await import("../src/lib/seed/normalize");
    db = getDb();
    await db.$executeRawUnsafe(
      `TRUNCATE plays, review_queue, set_genres, set_artists, sets, artists, venues, genres, settings, channels RESTART IDENTITY CASCADE`,
    );
    await importSeed(db, normalizeSeed(JSON.parse(readFileSync("data/seed-sets.json", "utf8"))));
    q = await import("../src/lib/queries");
    p = await import("../src/lib/periods");
  });
  afterAll(async () => db?.$disconnect());

  it("lists a month's uploads, newest first, and nothing outside it", async () => {
    const { start, end } = p.monthRange({ year: 2026, month: 10 });
    const sets = await q.setsUploadedBetween(start, end);
    expect(sets.length).toBeGreaterThan(0);
    for (const s of sets) expect(s.publishedAt >= start && s.publishedAt < end).toBe(true);
    const dates = sets.map((s) => s.publishedAt.getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });

  it("gives a year month by month, counts adding up to the total", async () => {
    const overview = await q.yearOverview(2026, 2);
    expect(overview.total).toBeGreaterThan(0);
    expect(overview.months.reduce((n, m) => n + m.total, 0)).toBe(overview.total);
    const months = overview.months.map((m) => m.month);
    expect([...months].sort((a, b) => b - a)).toEqual(months);
    for (const m of overview.months) expect(m.top.length).toBeLessThanOrEqual(2);
  });

  it("an empty month is empty, not an error", async () => {
    const { start, end } = p.monthRange({ year: 2010, month: 1 });
    expect(await q.setsUploadedBetween(start, end)).toEqual([]);
  });
});
