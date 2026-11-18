// "Up next" reads only related concerts since 17 Nov 2026 (speed). It must give the same order as the
// old way, which ranked the whole catalogue. Skipped when TEST_DATABASE_URL is not set.
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

const extra = (id: string, artist: string, venue: string, performed: string, genres: string[], venueKind: string, views: number, date: string) => ({
  id,
  artist,
  title: `${artist} - Live at ${venue} ${performed.slice(0, 4)} (Full Concert)`,
  channel: artist,
  official: true,
  secs: 5000,
  views,
  date,
  performed,
  genres,
  venue,
  city: "",
  country: "",
  venueKind,
  checked_on: "2026-11-18",
});
const EXTRA_CONCERTS = [
  extra("tstLPkRaR04", "Linkin Park", "Rock am Ring", "2004-06-05", ["alternative"], "Festival", 2_000_000, "2020-04-01"),
  extra("tstCureHyd8", "The Cure", "Hyde Park", "2018-07-07", ["post-punk"], "Festival", 2_500_000, "2019-10-18"),
  extra("tstRHGlast7", "Radiohead", "Glastonbury", "1997-06-28", ["alternative"], "Festival", 1_100_000, "2017-06-28"),
  extra("tstDMWaldb9", "Depeche Mode", "Waldbühne", "2009-06-10", ["new wave / synth"], "Room", 700_000, "2021-09-09"),
];

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
      `TRUNCATE plays, review_queue, concert_genres, concert_artists, concerts, artists, venues, genres, venue_kinds, tours, channels RESTART IDENTITY CASCADE`,
    );
    // The 8-concert fixture plus a few more, so the queues mix same-band, shared-genre and unrelated concerts.
    const seed = JSON.parse(readFileSync("tests/fixtures/seed-concerts.json", "utf8"));
    seed.concerts.push(...EXTRA_CONCERTS);
    await importSeed(db, normalizeSeed(seed));
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
