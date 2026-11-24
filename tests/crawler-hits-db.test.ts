// The batched write to crawler_hits adds hits and page-type counts to an existing row. Needs TEST_DATABASE_URL.
import "dotenv/config";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("crawler_hits batched upsert (database)", () => {
  let db: ReturnType<typeof import("../src/lib/db").getDb>;
  let upsertSql: typeof import("../src/lib/crawler-hits").upsertSql;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    db = (await import("../src/lib/db")).getDb();
    upsertSql = (await import("../src/lib/crawler-hits")).upsertSql;
    await db.$executeRawUnsafe(`TRUNCATE crawler_hits`);
  });
  afterAll(async () => db?.$disconnect());

  it("inserts, then adds to the same (day, bot) and merges the page types", async () => {
    const t1 = new Date("2026-11-24T10:00:00Z");
    const t2 = new Date("2026-11-24T10:05:00Z");
    await db.$executeRaw(
      upsertSql([
        { day: "2026-11-24", bot: "GPTBot", hits: 3, kinds: { concert: 2, md: 1 }, lastPath: "/concerts/a.md", lastAt: t1 },
        { day: "2026-11-24", bot: "ClaudeBot", hits: 1, kinds: { llms: 1 }, lastPath: "/llms.txt", lastAt: t1 },
      ]),
    );
    await db.$executeRaw(
      upsertSql([{ day: "2026-11-24", bot: "GPTBot", hits: 2, kinds: { concert: 1, robots: 1 }, lastPath: "/robots.txt", lastAt: t2 }]),
    );
    const rows = await db.crawlerHit.findMany({ orderBy: { bot: "asc" } });
    expect(rows).toHaveLength(2);
    const gpt = rows.find((r) => r.bot === "GPTBot")!;
    expect(gpt.hits).toBe(5);
    expect(gpt.kinds).toEqual({ concert: 3, md: 1, robots: 1 });
    expect(gpt.lastPath).toBe("/robots.txt");
    expect(gpt.lastAt).toEqual(t2);
    expect(rows.find((r) => r.bot === "ClaudeBot")!.kinds).toEqual({ llms: 1 });
  });
});
