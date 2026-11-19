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
      `TRUNCATE plays, review_queue, concert_genres, concert_artists, concerts, artists, venues, genres, venue_kinds, tours, channels RESTART IDENTITY CASCADE`,
    );
    await importSeed(db, normalizeSeed(JSON.parse(readFileSync("tests/fixtures/seed-concerts.json", "utf8"))));
    q = await import("../src/lib/queries");
    filters = await import("../src/lib/filters");
  });
  afterAll(async () => db?.$disconnect());

  const list = (params: Record<string, string>) => q.listConcerts(filters.parseFilters(params));

  it("lists all concerts, newest first by default", async () => {
    const { concerts, total } = await list({});
    expect(total).toBe(8);
    expect(concerts[0].youtubeId).toBe("_aWDlaxvEZo"); // The Cure at Troxy, uploaded 1 Nov 2024
  });

  it("filters by artist, genre, venue and venueKind", async () => {
    expect((await list({ artist: "metallica" })).total).toBe(3);
    expect((await list({ artist: "dave-mustaine" })).total).toBe(1); // guests count too
    expect((await list({ genre: "post-punk" })).total).toBe(1);
    expect((await list({ genre: "new-wave-synth" })).total).toBe(2);
    expect((await list({ genre: "techno" })).total).toBe(0); // not a genre on our list
    expect((await list({ venue: "pinkpop" })).total).toBe(3);
    expect((await list({ venueKind: "room" })).total).toBe(3);
    expect((await list({ venueKind: "livestream" })).total).toBe(2);
    expect((await list({ genre: "metal", venueKind: "festival" })).total).toBe(1); // Limp Bizkit at Pinkpop
  });

  it("searches titles, artists (including other spellings), venues and places", async () => {
    await db.artist.update({ where: { slug: "linkin-park" }, data: { aka: "Xero" } }); // the band's first name
    try {
      expect((await list({ q: "metallica" })).total).toBe(3);
      expect((await list({ q: "xero" })).total).toBe(1);
      expect((await list({ q: "pinkpop 1997" })).total).toBe(1); // every word must match
      expect((await list({ q: "troxy" })).total).toBe(1);
      expect((await list({ q: "landgraaf" })).total).toBe(2); // city (Limp Bizkit's row has none)
      expect((await list({ q: "no such thing" })).total).toBe(0);
    } finally {
      await db.artist.update({ where: { slug: "linkin-park" }, data: { aka: null } });
    }
  });

  it("sorts by views and length", async () => {
    expect((await list({ sort: "most-viewed" })).concerts[0].youtubeId).toBe("vXsFpdYAV9c"); // Linkin Park, 5M
    expect((await list({ sort: "longest" })).concerts[0].durationSeconds).toBe(10800);
    expect((await list({ sort: "shortest" })).concerts[0].durationSeconds).toBe(2700);
  });

  it("never shows hidden, private or non-embeddable concerts", async () => {
    await db.concert.update({ where: { youtubeId: "_aWDlaxvEZo" }, data: { status: "HIDDEN" } }); // The Cure: the only post-punk concert
    await db.concert.update({ where: { youtubeId: "pIo5HnaaMoc" }, data: { embeddable: false } });
    await db.concert.update({ where: { youtubeId: "o1rkPf9Nd00" }, data: { privacyStatus: "private" } });
    try {
      expect((await list({})).total).toBe(5);
      expect(await q.getConcertPage("limp-bizkit-pinkpop-1997")).toBeNull();
      expect(await q.getQueue("pIo5HnaaMoc")).toBeNull();
      expect((await q.filterOptions()).genres.some((g) => g.slug === "post-punk")).toBe(false);
      expect((await q.listArtists()).some((a) => a.slug === "the-cure")).toBe(false);
    } finally {
      await db.concert.updateMany({ data: { status: "PUBLISHED", embeddable: true, privacyStatus: "public" } });
    }
  });

  it("builds a concert page with its queue: same artist first", async () => {
    const page = await q.getConcertPage("metallica-the-metro-1983");
    expect(page).not.toBeNull();
    expect(page!.concert.credits).toBe("Metallica");
    expect(page!.queue.slice(0, 2).every((s) => s.artists.some((a) => a.slug === "metallica"))).toBe(true);
    expect(page!.queue[0].youtubeId).toBe("nbhqDjIWLpk"); // Metallica's newest upload
    expect(page!.queue.some((s) => s.id === page!.concert.id)).toBe(false);
    expect(page!.related.length).toBeGreaterThan(0); // Limp Bizkit shares metal
    expect(page!.related.every((s) => !s.artists.some((a) => a.slug === "metallica"))).toBe(true);
    expect(await q.getConcertPage("does-not-exist")).toBeNull();
  });

  it("builds an artist page with similar artists that exist", async () => {
    // The hand-written list keeps only names with a page: no Megadeth concert here, Dave Mustaine is only a guest.
    await db.artist.update({
      where: { slug: "metallica" },
      data: { similarNames: ["Megadeth", "Dave Mustaine", "Limp Bizkit", "Linkin Park"] },
    });
    try {
      const page = await q.getArtistPage("metallica");
      expect(page!.concerts).toHaveLength(3);
      expect(page!.similar.map((a) => a.name)).toEqual(["Limp Bizkit", "Linkin Park"]);
      expect(await q.getArtistPage("nobody")).toBeNull();
    } finally {
      await db.artist.update({ where: { slug: "metallica" }, data: { similarNames: ["Megadeth", "Slayer"] } });
    }
  });

  it("features a different headline artist each day, with that artist's latest concert", async () => {
    const days = await Promise.all(
      Array.from({ length: 6 }, (_, d) => q.featuredConcert(new Date(Date.UTC(2026, 10, 12 + d)))),
    );
    const artists = days.map((s) => s!.artists.find((a) => a.role === "MAIN")!.slug);
    expect(new Set(artists).size).toBe(6); // six headline bands in the fixture
    expect(artists).not.toContain("dave-mustaine"); // a guest never headlines
    const metallica = days.find((s) => s!.artists[0].slug === "metallica")!;
    expect(metallica.youtubeId).toBe("nbhqDjIWLpk"); // Metallica's newest
  });

  it("builds venue and genre pages", async () => {
    expect((await q.getVenuePage("pinkpop"))!.concerts).toHaveLength(3);
    expect((await q.getGenrePage("metal"))!.concerts).toHaveLength(4);
    expect(await q.getGenrePage("techno")).toBeNull(); // not on the list
  });

  it("the Festivals index lists only places with a festival concert", async () => {
    const festivals = await q.listVenues();
    expect(festivals.length).toBeGreaterThan(0);
    const all = await db.venue.findMany({ include: { concerts: { include: { venueKind: true } } } });
    for (const f of festivals) {
      expect(all.find((v) => v.slug === f.slug)!.concerts.some((s) => s.venueKind?.slug === "festival")).toBe(true);
    }
    const nonFestival = all.filter((v) => v.concerts.length > 0 && !v.concerts.some((s) => s.venueKind?.slug === "festival"));
    expect(nonFestival.length).toBeGreaterThan(0);
    for (const v of nonFestival) expect(festivals.map((f) => f.slug)).not.toContain(v.slug);
  });

  it("builds song pages from the setlists, and updates them when a setlist arrives", async () => {
    const set = (youtubeId: string, titles: [number, string][]) =>
      db.concert.update({
        where: { youtubeId },
        data: { setlist: titles.map(([time, title]) => ({ time, artist: null, title })), setlistSource: "DESCRIPTION" },
      });
    const before = await db.concert.findMany({ where: { youtubeId: { in: ["IA9xKr_Dmek", "nbhqDjIWLpk"] } }, select: { youtubeId: true, setlist: true, setlistSource: true } });
    try {
      await set("IA9xKr_Dmek", [[0, "Enter Sandman"], [360, "Creeping Death"], [720, "Seek & Destroy"]]);
      let data = await q.bandSongData("metallica");
      expect(data!.setlists).toBe(1);
      expect(data!.songs.find((s) => s.slug === "enter-sandman")!.versions).toHaveLength(1);
      // A new setlist: the song pages, the catalogue and the sitemap follow by themselves.
      await set("nbhqDjIWLpk", [[0, "Creeping Death"], [400, "Enter Sandman (Live)"], [800, "Fuel"]]);
      data = await q.bandSongData("metallica");
      expect(data!.setlists).toBe(2);
      const sandman = data!.songs.find((s) => s.slug === "enter-sandman")!;
      expect(sandman.versions.map((v) => v.href)).toEqual(["/concerts/metallica-yankee-stadium-2011?t=400", "/concerts/metallica-l-c-walker-arena-1991"]);
      expect(await q.bandSongData("dave-mustaine")).toBeNull(); // a guest has no page, so no songs
      const catalogue = await q.songCatalogue();
      expect(catalogue.find((b) => b.slug === "metallica")!.songs.find((s) => s.slug === "enter-sandman")!.versions).toBe(2);
      process.env.SITE_INDEXABLE = "true";
      const { sitemapEntries } = await import("../src/lib/sitemap");
      const paths = (await sitemapEntries()).map((e) => e.path);
      expect(paths).toContain("/songs/metallica/enter-sandman");
      expect(paths).not.toContain("/songs/metallica/fuel"); // one version
      expect(paths).not.toContain("/songs/metallica"); // 4 songs: not yet
    } finally {
      delete process.env.SITE_INDEXABLE;
      // Both had no setlist in the fixture.
      expect(before.every((b) => b.setlist === null && b.setlistSource === null)).toBe(true);
      await db.$executeRawUnsafe(`UPDATE concerts SET setlist = NULL, setlist_source = NULL WHERE youtube_id IN ('IA9xKr_Dmek', 'nbhqDjIWLpk')`);
    }
  });
});
