// Similarity job and the pages that use it, against the seeded test database.
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("similar artists (database)", () => {
  let db: ReturnType<typeof import("../src/lib/db").getDb>;
  let job: typeof import("../src/lib/similarity/job");
  let q: typeof import("../src/lib/queries");
  const id = async (slug: string) => (await db.artist.findUniqueOrThrow({ where: { slug } })).id;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    const { getDb } = await import("../src/lib/db");
    const { importSeed } = await import("../src/lib/seed/import");
    const { normalizeSeed } = await import("../src/lib/seed/normalize");
    db = getDb();
    await db.$executeRawUnsafe(
      `TRUNCATE plays, review_queue, artist_lookups, job_runs, concert_genres, concert_artists, concerts, artists, venues, genres, venue_kinds, tours, channels RESTART IDENTITY CASCADE`,
    );
    await importSeed(db, normalizeSeed(JSON.parse(readFileSync("tests/fixtures/seed-concerts.json", "utf8"))));
    job = await import("../src/lib/similarity/job");
    q = await import("../src/lib/queries");
  });
  afterAll(async () => db?.$disconnect());

  it("stores a ranked list per artist, both directions, never the artist itself", async () => {
    const ranked = await job.recompute(db);
    expect(ranked.length).toBeGreaterThan(0);
    const rows = await db.artistSimilarity.findMany();
    expect(rows.length).toBe(ranked.length);
    expect(rows.some((r) => r.artistId === r.similarId)).toBe(false);
    for (const r of rows) expect(rows.some((x) => x.artistId === r.similarId && x.similarId === r.artistId)).toBe(true);
    // Guests without a concert of their own have no page and are never suggested (owner rule).
    const metallica = await q.similarArtistIds([await id("metallica")]);
    expect(metallica).not.toContain(await id("dave-mustaine"));
  });

  it("ListenBrainz lists are stored and change the ranking; artists without an ID are skipped", async () => {
    const metallica = await db.artist.findUniqueOrThrow({ where: { slug: "metallica" } });
    const all = await db.artist.findMany({ where: { credits: { some: { role: "MAIN" } } } });
    const { nameKey } = await import("../src/lib/collector/musicbrainz");
    // No network in tests: every artist already has a MusicBrainz lookup; only Metallica has an ID.
    await db.artistLookup.createMany({
      data: all.map((a) => ({ nameKey: nameKey(a.name), mbid: a.id === metallica.id ? "metallica-mbid" : null, genres: [] })),
    });
    const target = all.find((a) => a.slug === "the-cure")!;
    expect(await q.similarArtistIds([metallica.id])).not.toContain(target.id); // nothing in common on our side
    const asked: string[] = [];
    const stats = await job.refreshExternal(db, {
      similar: async (mbid) => {
        asked.push(mbid);
        return [{ name: target.name, nameKey: nameKey(target.name), mbid: "x", score: 1 }];
      },
    });
    expect(asked).toEqual(["metallica-mbid"]);
    expect(stats.asked).toEqual(["Metallica"]);
    expect(stats.noMbid.length).toBe(all.length - 1);
    expect(await db.artistExternalSimilar.count({ where: { artistId: metallica.id } })).toBe(1);

    await job.recompute(db);
    expect(await q.similarArtistIds([metallica.id])).toContain(target.id);

    // Asked again only when the list is a month old.
    const again = await job.refreshExternal(db, { similar: async () => [] });
    expect(again.asked).toEqual([]);
    expect(again.noMbid).toEqual([]);
  });

  it("the player's suggestions and queue use the similar artists", async () => {
    const metallicaId = await id("metallica");
    const metallicaConcert = await db.concert.findFirstOrThrow({ where: { credits: { some: { artistId: metallicaId, role: "MAIN" } } } });
    const cards = await q.recommendationsFor(metallicaConcert.youtubeId);
    expect(cards!.length).toBeGreaterThan(0);
    expect(cards!.length).toBeLessThanOrEqual(4);
    // Most similar first; a guest whose only concert is with Metallica (Dave Mustaine) is not suggested.
    const order = await q.similarArtistIds([metallicaId]);
    const slugs = await Promise.all(order.map(async (i) => (await db.artist.findUniqueOrThrow({ where: { id: i } })).slug));
    const positions = cards!.map((c) => slugs.indexOf(c.slug));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(cards!.map((c) => c.slug)).not.toContain("dave-mustaine");
    for (const c of cards!) {
      expect(c.concerts).toBeGreaterThan(0);
      expect(c.mostWatched.artists.some((a) => a.slug === c.slug)).toBe(true);
      expect(c.mostWatched.artists.some((a) => a.slug === "metallica")).toBe(false);
    }
    expect(await q.recommendationsFor("xxxxxxxxxxx")).toBeNull();

    // After Metallica's own concerts, the queue goes on with the most similar band.
    const queue = (await q.getQueue(metallicaConcert.youtubeId))!;
    const firstOther = queue.find((s) => !s.artists.some((a) => a.slug === "metallica"));
    expect(firstOther?.artists.some((a) => a.slug === cards![0].slug)).toBe(true);
  });

  it("the artist page lists computed similar artists with their details", async () => {
    const page = await q.getArtistPage("metallica");
    expect(page!.similar.length).toBeGreaterThan(0);
    expect(page!.similarCards[0].latest).toBeTruthy();
  });

  it("the concert page has artist cards for You might also like", async () => {
    const metallicaConcert = await db.concert.findFirstOrThrow({ where: { credits: { some: { artist: { slug: "metallica" }, role: "MAIN" } } } });
    const page = await q.getConcertPage(metallicaConcert.slug);
    expect(page!.similarCards.length).toBeGreaterThan(0);
    expect(page!.similarCards.length).toBeLessThanOrEqual(4);
    expect(page!.similarCards.some((c) => c.slug === "metallica")).toBe(false);
  });

  it("the map: centre, neighbours best first with positions, search by text, genre filter", async () => {
    const map = (await q.getMap("metallica"))!;
    expect(map.centre.slug).toBe("metallica");
    const order = await q.similarArtistIds([await id("metallica")]);
    const slugs = await Promise.all(order.map(async (i) => (await db.artist.findUniqueOrThrow({ where: { id: i } })).slug));
    expect(map.artists.map((a) => a.slug)).toEqual(slugs.filter((s) => map.artists.some((a) => a.slug === s)));
    const d = map.artists.map((a) => Math.hypot(a.x, a.y));
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(JSON.stringify(map)).not.toContain("score");

    expect(await q.getMap("no-such-artist")).toBeNull();
    expect((await q.findArtistByText("  metallica "))?.slug).toBe("metallica");
    expect((await q.findArtistByText("linkin"))?.slug).toBe("linkin-park");
    expect(await q.findArtistByText("zzzz")).toBeNull();

    const genre = await db.genre.findFirstOrThrow({ where: { concerts: { some: {} } } });
    const filtered = (await q.getMap("metallica", [genre.slug]))!;
    for (const a of filtered.artists) expect(a.genres.length).toBeGreaterThan(0);
    expect(filtered.artists.length).toBeLessThanOrEqual(map.artists.length);
    expect(typeof (await q.defaultMapArtist())).toBe("string");
  });
});
