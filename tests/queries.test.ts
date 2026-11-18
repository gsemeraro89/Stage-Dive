// Page queries against the seeded test database. Skipped when TEST_DATABASE_URL is not set.
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("page queries (database)", () => {
  let q: typeof import("../src/lib/queries");
  let filters: typeof import("../src/lib/filters");
  let db: ReturnType<typeof import("../src/lib/db").getDb>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url; // the queries use the shared client
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
    filters = await import("../src/lib/filters");
  });
  afterAll(async () => db?.$disconnect());

  const list = (params: Record<string, string>) => q.listConcerts(filters.parseFilters(params));

  it("lists all concerts, newest first by default", async () => {
    const { concerts, total } = await list({});
    expect(total).toBe(23);
    expect(concerts[0].youtubeId).toBe("NEjcnAJ7Sls"); // NTO at HÖR, 21 Oct 2026
  });

  it("filters by artist, genre, venue and setting", async () => {
    expect((await list({ artist: "nto" })).total).toBe(14);
    expect((await list({ artist: "sofiane-pamart" })).total).toBe(1); // collaborators count too
    expect((await list({ genre: "deep-house" })).total).toBe(1);
    expect((await list({ genre: "disco" })).total).toBe(0); // genre taken off the list
    expect((await list({ venue: "sonar-lisboa" })).total).toBe(1);
    expect((await list({ setting: "club" })).total).toBe(3);
    expect((await list({ artist: "nto", setting: "festival" })).total).toBe(3);
  });

  it("searches titles, artists (including other spellings), venues and places", async () => {
    expect((await list({ q: "kalkbrenner" })).total).toBe(2);
    expect((await list({ q: "n'to" })).total).toBe(14);
    expect((await list({ q: "cercle paris" })).total).toBe(2);
    expect((await list({ q: "albania" })).total).toBe(1);
    expect((await list({ q: "no such thing" })).total).toBe(0);
  });

  it("sorts by views and length", async () => {
    expect((await list({ sort: "most-viewed" })).concerts[0].youtubeId).toBe("4BvjYabSl5A"); // Kalkbrenner, 14.3M
    expect((await list({ sort: "longest" })).concerts[0].durationSeconds).toBe(8764);
    expect((await list({ sort: "shortest" })).concerts[0].durationSeconds).toBe(1659);
  });

  it("never shows hidden, private or non-embeddable concerts", async () => {
    await db.concert.update({ where: { youtubeId: "iybJn1SyXB0" }, data: { status: "HIDDEN" } });
    await db.concert.update({ where: { youtubeId: "YDJEo-rQrfw" }, data: { embeddable: false } });
    await db.concert.update({ where: { youtubeId: "sx6_l6skb5o" }, data: { privacyStatus: "private" } });
    try {
      expect((await list({})).total).toBe(20);
      expect(await q.getConcertPage("folamour-cathedrale-saint-pierre-2023")).toBeNull();
      expect(await q.getQueue("YDJEo-rQrfw")).toBeNull();
      expect((await q.filterOptions()).genres.some((g) => g.slug === "deep-house")).toBe(false);
      expect((await q.listArtists()).some((a) => a.slug === "indira-paganotto")).toBe(false);
    } finally {
      await db.concert.updateMany({ data: { status: "PUBLISHED", embeddable: true, privacyStatus: "public" } });
    }
  });

  it("builds a concert page with its queue: same artist first", async () => {
    const page = await q.getConcertPage("nto-spectra-festival-2026");
    expect(page).not.toBeNull();
    expect(page!.concert.credits).toBe("NTO");
    expect(page!.queue.slice(0, 13).every((s) => s.artists.some((a) => a.slug === "nto"))).toBe(true);
    expect(page!.queue[0].youtubeId).toBe("NEjcnAJ7Sls");
    expect(page!.queue.some((s) => s.id === page!.concert.id)).toBe(false);
    expect(page!.related.every((s) => !s.artists.some((a) => a.slug === "nto"))).toBe(true);
    expect(await q.getConcertPage("does-not-exist")).toBeNull();
  });

  it("builds an artist page with similar artists that exist", async () => {
    const page = await q.getArtistPage("nto");
    expect(page!.concerts).toHaveLength(14);
    expect(page!.similar.map((a) => a.name)).toEqual(["The Blaze", "Marsh", "Paul Kalkbrenner"]);
    expect(await q.getArtistPage("nobody")).toBeNull();
  });

  it("features a different headline artist each day, with that artist's latest concert", async () => {
    const days = await Promise.all(
      Array.from({ length: 9 }, (_, d) => q.featuredConcert(new Date(Date.UTC(2026, 10, 12 + d)))),
    );
    const artists = days.map((s) => s!.artists.find((a) => a.role === "MAIN")!.slug);
    expect(new Set(artists).size).toBe(9); // nine headline artists in the seed
    const nto = days.find((s) => s!.artists[0].slug === "nto")!;
    expect(nto.youtubeId).toBe("NEjcnAJ7Sls"); // NTO's newest
  });

  it("builds venue and genre pages", async () => {
    expect((await q.getVenuePage("sonar-lisboa"))!.concerts).toHaveLength(1);
    expect((await q.getGenrePage("melodic-techno"))!.concerts.length).toBeGreaterThan(10);
    expect(await q.getGenrePage("trance")).toBeNull(); // taken off the list
  });

  it("the Festivals index lists only places with a festival concert", async () => {
    const festivals = await q.listVenues();
    expect(festivals.length).toBeGreaterThan(0);
    const all = await db.venue.findMany({ include: { concerts: { include: { setting: true } } } });
    for (const f of festivals) {
      expect(all.find((v) => v.slug === f.slug)!.concerts.some((s) => s.setting?.slug === "festival")).toBe(true);
    }
    const nonFestival = all.filter((v) => v.concerts.length > 0 && !v.concerts.some((s) => s.setting?.slug === "festival"));
    expect(nonFestival.length).toBeGreaterThan(0);
    for (const v of nonFestival) expect(festivals.map((f) => f.slug)).not.toContain(v.slug);
  });
});
