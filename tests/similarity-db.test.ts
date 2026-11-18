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
      `TRUNCATE plays, review_queue, artist_lookups, job_runs, set_genres, set_artists, sets, artists, venues, genres, settings, channels RESTART IDENTITY CASCADE`,
    );
    await importSeed(db, normalizeSeed(JSON.parse(readFileSync("data/seed-sets.json", "utf8"))));
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
    // Guests without a set of their own have no page and are never suggested (owner rule).
    const nto = await q.similarArtistIds([await id("nto")]);
    expect(nto).not.toContain(await id("sofiane-pamart"));
  });

  it("ListenBrainz lists are stored and change the ranking; artists without an ID are skipped", async () => {
    const nto = await db.artist.findUniqueOrThrow({ where: { slug: "nto" } });
    const all = await db.artist.findMany({ where: { credits: { some: { role: "MAIN" } } } });
    const { nameKey } = await import("../src/lib/collector/musicbrainz");
    // No network in tests: every artist already has a MusicBrainz lookup; only NTO has an ID.
    await db.artistLookup.createMany({
      data: all.map((a) => ({ nameKey: nameKey(a.name), mbid: a.id === nto.id ? "nto-mbid" : null, genres: [] })),
    });
    const target = all.find((a) => a.slug === "paul-kalkbrenner")!;
    const asked: string[] = [];
    const stats = await job.refreshExternal(db, {
      similar: async (mbid) => {
        asked.push(mbid);
        return [{ name: target.name, nameKey: nameKey(target.name), mbid: "x", score: 1 }];
      },
    });
    expect(asked).toEqual(["nto-mbid"]);
    expect(stats.asked).toEqual(["NTO"]);
    expect(stats.noMbid.length).toBe(all.length - 1);
    expect(await db.artistExternalSimilar.count({ where: { artistId: nto.id } })).toBe(1);

    await job.recompute(db);
    expect(await q.similarArtistIds([nto.id])).toContain(target.id);

    // Asked again only when the list is a month old.
    const again = await job.refreshExternal(db, { similar: async () => [] });
    expect(again.asked).toEqual([]);
    expect(again.noMbid).toEqual([]);
  });

  it("the player's suggestions and queue use the similar artists", async () => {
    const ntoId = await id("nto");
    const ntoSet = await db.set.findFirstOrThrow({ where: { credits: { some: { artistId: ntoId, role: "MAIN" } } } });
    const cards = await q.recommendationsFor(ntoSet.youtubeId);
    expect(cards!.length).toBeGreaterThan(0);
    expect(cards!.length).toBeLessThanOrEqual(4);
    // Most similar first; an artist whose only set is with NTO (Sofiane Pamart) is not suggested.
    const order = await q.similarArtistIds([ntoId]);
    const slugs = await Promise.all(order.map(async (i) => (await db.artist.findUniqueOrThrow({ where: { id: i } })).slug));
    const positions = cards!.map((c) => slugs.indexOf(c.slug));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(cards!.map((c) => c.slug)).not.toContain("sofiane-pamart");
    for (const c of cards!) {
      expect(c.sets).toBeGreaterThan(0);
      expect(c.mostWatched.artists.some((a) => a.slug === c.slug)).toBe(true);
      expect(c.mostWatched.artists.some((a) => a.slug === "nto")).toBe(false);
    }
    expect(await q.recommendationsFor("xxxxxxxxxxx")).toBeNull();

    // After NTO's own sets, the queue goes on with the most similar artist.
    const queue = (await q.getQueue(ntoSet.youtubeId))!;
    const firstOther = queue.find((s) => !s.artists.some((a) => a.slug === "nto"));
    expect(firstOther?.artists.some((a) => a.slug === cards![0].slug)).toBe(true);
  });

  it("the artist page lists computed similar artists with their details", async () => {
    const page = await q.getArtistPage("nto");
    expect(page!.similar.length).toBeGreaterThan(0);
    expect(page!.similarCards[0].latest).toBeTruthy();
  });

  it("the set page has artist cards for You might also like", async () => {
    const ntoSet = await db.set.findFirstOrThrow({ where: { credits: { some: { artist: { slug: "nto" }, role: "MAIN" } } } });
    const page = await q.getSetPage(ntoSet.slug);
    expect(page!.similarCards.length).toBeGreaterThan(0);
    expect(page!.similarCards.length).toBeLessThanOrEqual(4);
    expect(page!.similarCards.some((c) => c.slug === "nto")).toBe(false);
  });

  it("the map: centre, neighbours best first with positions, search by text, genre filter", async () => {
    const map = (await q.getMap("nto"))!;
    expect(map.centre.slug).toBe("nto");
    const order = await q.similarArtistIds([await id("nto")]);
    const slugs = await Promise.all(order.map(async (i) => (await db.artist.findUniqueOrThrow({ where: { id: i } })).slug));
    expect(map.artists.map((a) => a.slug)).toEqual(slugs.filter((s) => map.artists.some((a) => a.slug === s)));
    const d = map.artists.map((a) => Math.hypot(a.x, a.y));
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(JSON.stringify(map)).not.toContain("score");

    expect(await q.getMap("no-such-artist")).toBeNull();
    expect((await q.findArtistByText("  nto "))?.slug).toBe("nto");
    expect((await q.findArtistByText("kalkb"))?.slug).toBe("paul-kalkbrenner");
    expect(await q.findArtistByText("zzzz")).toBeNull();

    const genre = await db.genre.findFirstOrThrow({ where: { sets: { some: {} } } });
    const filtered = (await q.getMap("nto", [genre.slug]))!;
    for (const a of filtered.artists) expect(a.genres.length).toBeGreaterThan(0);
    expect(filtered.artists.length).toBeLessThanOrEqual(map.artists.length);
    expect(typeof (await q.defaultMapArtist())).toBe("string");
  });
});
