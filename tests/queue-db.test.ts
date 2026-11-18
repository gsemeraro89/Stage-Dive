// "Up next" reads only related concerts since 17 Nov 2026 (speed). It must give the same order as the
// old way, which ranked the whole catalogue. Skipped when TEST_DATABASE_URL is not set.
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("up next reads only related concerts (database)", () => {
  let q: typeof import("../src/lib/queries");
  let up: typeof import("../src/lib/upnext");
  let db: ReturnType<typeof import("../src/lib/db").getDb>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    const { getDb } = await import("../src/lib/db");
    const { importSeed } = await import("../src/lib/seed/import");
    const { normalizeSeed } = await import("../src/lib/seed/normalize");
    db = getDb();
    await db.$executeRawUnsafe(
      `TRUNCATE plays, review_queue, concert_genres, concert_artists, concerts, artists, venues, genres, settings, channels RESTART IDENTITY CASCADE`,
    );
    await importSeed(db, normalizeSeed(JSON.parse(readFileSync("data/seed-concerts.json", "utf8"))));
    q = await import("../src/lib/queries");
    up = await import("../src/lib/upnext");
  });
  afterAll(async () => db?.$disconnect());

  it("gives the same queue as ranking the whole catalogue, for every concert", async () => {
    const rows = await db.concert.findMany({
      where: { status: "PUBLISHED", embeddable: true, privacyStatus: "public" },
      select: { id: true, youtubeId: true, publishedAt: true, viewCount: true, credits: { select: { artistId: true } }, genres: { select: { genreId: true } } },
    });
    const all = rows.map((r) => ({
      id: r.id,
      youtubeId: r.youtubeId,
      artistIds: r.credits.map((c) => c.artistId),
      genreIds: r.genres.map((g) => g.genreId),
      publishedAt: r.publishedAt,
      viewCount: r.viewCount,
    }));
    expect(all.length).toBeGreaterThan(10);
    for (const current of all) {
      const similar = await q.similarArtistIds(current.artistIds);
      const expected = up.buildQueue(current, all, undefined, similar).map((s) => s.youtubeId);
      const actual = ((await q.getQueue(current.youtubeId)) ?? []).map((s) => s.youtubeId);
      expect(actual, current.youtubeId).toEqual(expected);
    }
  });
});
