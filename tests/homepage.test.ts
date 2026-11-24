// The new homepage's data (src/lib/home.ts homepageData): pure helpers, the lead sentence and, with a test
// database, every section from the seed fixture.
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { homeLead } from "../src/lib/answers";
import { bestLists } from "../src/lib/best";
import { COVER_BANDS, coverPool, foldPlaces, frontPage, hasTimedSongs, pickForWeek, pickRankings, tilePicture, tileWinners, topSongs } from "../src/lib/home";
import { BANNED, youtubeOnlyWithViews } from "./fixtures/concert-view";

const totals = { concerts: 165, official: 160, bootlegs: 5, bands: 80, withSetlist: 60, festivals: 12, venues: 30 };

describe("homepage lead sentence", () => {
  it("answers first, from the totals, with official and bootlegs counted apart", () => {
    expect(homeLead(totals)).toBe(
      "STAGEDIVE has 165 full rock concerts you can play here, the whole show (160 official, 5 bootlegs) by 80 bands at 12 festivals and 30 venues; 60 with a setlist: click a song to jump to it.",
    );
  });
  it("has no clause for a missing fact, and nothing without concerts", () => {
    expect(homeLead({ ...totals, bootlegs: 0, official: 165, withSetlist: 0, festivals: 0 })).toBe(
      "STAGEDIVE has 165 full rock concerts you can play here, the whole show by 80 bands at 30 venues.",
    );
    expect(homeLead({ ...totals, concerts: 1, official: 1, bootlegs: 0, bands: 1, withSetlist: 1, festivals: 1, venues: 0 })).toBe(
      "STAGEDIVE has 1 full rock concert you can play here, the whole show by 1 band at 1 festival; every one with a setlist: click a song to jump to it.",
    );
    expect(homeLead({ ...totals, concerts: 0, official: 0, bootlegs: 0 })).toBe("");
  });
  it("writes big numbers with thousands separators", () => {
    expect(homeLead({ concerts: 2213, official: 1712, bootlegs: 501, bands: 1298, withSetlist: 1930, festivals: 249, venues: 1340 })).toBe(
      "STAGEDIVE has 2,213 full rock concerts you can play here, the whole show (1,712 official, 501 bootlegs) by 1,298 bands at 249 festivals and 1,340 venues; 1,930 with a setlist: click a song to jump to it.",
    );
  });
  it("follows the copy rules", () => {
    const lead = homeLead(totals);
    expect(lead).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(lead)).toBe(true);
  });
});

describe("homepage helpers", () => {
  it("folds concert counts per place: total, festival when any concert was at a festival, year span", () => {
    const folded = foldPlaces(
      [
        { venueId: 1, venueKindId: 10, count: 3, minYear: 1993, maxYear: 2001 },
        { venueId: 1, venueKindId: 11, count: 1, minYear: 1989, maxYear: 1989 },
        { venueId: 2, venueKindId: 11, count: 2, minYear: null, maxYear: null },
        { venueId: null, venueKindId: 10, count: 9, minYear: 2000, maxYear: 2000 },
      ],
      new Set([10]),
    );
    expect(folded.get(1)).toEqual({ concerts: 4, festival: true, years: { from: 1989, to: 2001 } });
    expect(folded.get(2)).toEqual({ concerts: 2, festival: false, years: null });
    expect(folded.size).toBe(2);
  });

  const lists = bestLists({
    total: 40,
    decades: [
      { label: "1980s", count: 12 },
      { label: "1990s", count: 15 },
      { label: "2000s", count: 3 },
    ],
    genres: [{ slug: "metal", name: "metal", count: 11 }],
    venueKinds: [
      { slug: "festival", count: 20 },
      { slug: "room", count: 20 },
    ],
  });

  it("picks all time, a decade that changes weekly and festival shows, only rankings worth showing", () => {
    const a = pickRankings(lists, new Date("2026-11-18T12:00:00Z"));
    const b = pickRankings(lists, new Date("2026-11-25T12:00:00Z"));
    expect(a.map((l) => l.slug)).toEqual(["most-watched-rock-concerts", "most-watched-rock-concerts-1980s", "best-festival-rock-concerts"]);
    expect(b[1].slug).toBe("most-watched-rock-concerts-1990s");
    // The 2000s have too few concerts to be ranked on their own.
    for (let w = 0; w < 6; w++) expect(pickRankings(lists, new Date(Date.UTC(2026, 10, 18 + 7 * w)))[1].slug).not.toMatch(/2000s/);
  });
  it("fills a missing ranking with the next one (genres first), and never repeats one", () => {
    const noFestival = lists.filter((l) => l.key !== "festival");
    expect(pickRankings(noFestival, new Date("2026-11-18T12:00:00Z")).map((l) => l.slug)).toEqual([
      "most-watched-rock-concerts",
      "most-watched-rock-concerts-1980s",
      "best-live-metal-concerts",
    ]);
    expect(pickRankings([], new Date())).toEqual([]);
  });

  it("lists the most played songs, one per band (its most played), only those with a page worth showing", () => {
    const songs = topSongs(
      [
        { slug: "metallica", name: "Metallica", songs: [{ slug: "one", title: "One", versions: 9 }, { slug: "fade-to-black", title: "Fade to Black", versions: 8 }] },
        { slug: "pixies", name: "Pixies", songs: [{ slug: "hey", title: "Hey", versions: 4 }, { slug: "debaser", title: "Debaser", versions: 6 }] },
        { slug: "low", name: "Low", songs: [{ slug: "words", title: "Words", versions: 1 }] },
        { slug: "suede", name: "Suede", songs: [{ slug: "trash", title: "Trash", versions: 3 }, { slug: "animal-nitrate", title: "Animal Nitrate", versions: 3 }] },
      ],
      3,
    );
    expect(songs).toEqual([
      { title: "One", href: "/songs/metallica/one", band: { slug: "metallica", name: "Metallica" }, versions: 9 },
      { title: "Debaser", href: "/songs/pixies/debaser", band: { slug: "pixies", name: "Pixies" }, versions: 6 },
      { title: "Animal Nitrate", href: "/songs/suede/animal-nitrate", band: { slug: "suede", name: "Suede" }, versions: 3 },
    ]);
  });

  it("builds the cover pool from the bands with the most official concerts, their most watched gig with song times", () => {
    const bands = Array.from({ length: 25 }, (_, i) => ({ artistId: i + 1, name: `Band ${String.fromCharCode(65 + i)}`, official: 30 - i, hasPhoto: i % 2 === 0 }));
    const best = new Map(bands.map((b) => [b.artistId, 100 + b.artistId]));
    // The top 20 bands; 10 of them have a photo: only those, in order of official concerts.
    const pool = coverPool(bands, best);
    expect(pool).toEqual([101, 103, 105, 107, 109, 111, 113, 115, 117, 119]);
    expect(pool.every((id) => id - 100 <= COVER_BANDS)).toBe(true);
    // A band with no concert with song times is left out.
    best.delete(1);
    expect(coverPool(bands, best)[0]).toBe(103);
    // Fewer than eight with a photo: every band.
    const few = bands.map((b) => ({ ...b, hasPhoto: b.artistId <= 3 }));
    expect(coverPool(few, best)).toHaveLength(COVER_BANDS - 1);
    // Ties on official concerts: name A to Z; one entry per concert.
    expect(
      coverPool(
        [
          { artistId: 1, name: "Zeta", official: 5, hasPhoto: false },
          { artistId: 2, name: "Alpha", official: 5, hasPhoto: false },
          { artistId: 3, name: "Beta", official: 5, hasPhoto: false },
        ],
        new Map([
          [1, 7],
          [2, 8],
          [3, 8],
        ]),
      ),
    ).toEqual([8, 7]);
    expect(coverPool([], new Map())).toEqual([]);
  });

  it("changes the cover every Monday and keeps it all week", () => {
    const pool = [11, 12, 13];
    expect(pickForWeek(pool, new Date("2026-11-23T00:00:00Z"))).toBe(12); // Monday
    expect(pickForWeek(pool, new Date("2026-11-29T23:59:59Z"))).toBe(12); // Sunday
    expect(pickForWeek(pool, new Date("2026-11-30T00:00:00Z"))).toBe(13);
    expect(pickForWeek(pool, new Date("2026-12-07T08:00:00Z"))).toBe(11);
  });

  it("counts a setlist as clickable only with song times", () => {
    expect(hasTimedSongs([{ title: "One", time: 0 }, { title: "Two", time: null }])).toBe(true);
    expect(hasTimedSongs([{ title: "One" }, { title: "Two" }])).toBe(false);
    expect(hasTimedSongs(null)).toBe(false);
  });

  it("finds each tile's top band and most watched concert", () => {
    const w = tileWinners([
      { id: 1, viewCount: 500, mainArtistIds: [10], keys: ["decade:1990s", "genre:1"] },
      { id: 2, viewCount: 900, mainArtistIds: [20], keys: ["decade:1990s"] },
      { id: 3, viewCount: 100, mainArtistIds: [10], keys: ["decade:1990s", "tour:4"] },
      { id: 4, viewCount: 100, mainArtistIds: [], keys: ["tour:4"] },
    ]);
    expect(w.get("decade:1990s")).toEqual({ artistId: 10, concertId: 2 });
    expect(w.get("genre:1")).toEqual({ artistId: 10, concertId: 1 });
    expect(w.get("tour:4")).toEqual({ artistId: 10, concertId: 3 });
    expect(w.has("decade:1980s")).toBe(false);
    // A tie on concerts: more views in all.
    expect(
      tileWinners([
        { id: 1, viewCount: 5, mainArtistIds: [1], keys: ["k"] },
        { id: 2, viewCount: 9, mainArtistIds: [2], keys: ["k"] },
      ]).get("k"),
    ).toEqual({ artistId: 2, concertId: 2 });
  });

  it("gives a tile its band's photo with the band named, else the concert picture", () => {
    const photo = { src: "/photos/bands/suede?v=1", width: 800, height: 600, credit: "Photo: X", author: "X", sourcePage: "https://commons.wikimedia.org/x", license: "CC BY 4.0", licenseUrl: null };
    const concert = { kind: "concert" as const, cover: { youtubeId: "abc", thumbnail: { src: "t", srcSet: "", width: 480, height: 360 }, portrait: false } };
    const photos = new Map([["suede", photo]]);
    expect(tilePicture("suede", photos, concert)).toEqual({ picture: { kind: "band-photo", photo }, pictureBand: "suede", fallback: concert });
    expect(tilePicture("pixies", photos, concert)).toEqual({ picture: concert, pictureBand: null, fallback: concert });
    expect(tilePicture(null, photos, null)).toEqual({ picture: null, pictureBand: null, fallback: null });
  });

  it("puts the news list's lead story on the front page, else the newest", () => {
    expect(frontPage([{ id: 1 }, { id: 2, isLead: true }, { id: 3 }, { id: 4 }], 3)).toEqual({ lead: { id: 2, isLead: true }, more: [{ id: 1 }, { id: 3 }, { id: 4 }] });
    expect(frontPage([{ id: 1 }, { id: 2 }], 3)).toEqual({ lead: { id: 1 }, more: [{ id: 2 }] });
    expect(frontPage([], 3)).toEqual({ lead: null, more: [] });
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("homepage sections (database)", () => {
  let home: typeof import("../src/lib/home");
  let db: ReturnType<typeof import("../src/lib/db").getDb>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    const { getDb } = await import("../src/lib/db");
    const { importSeed } = await import("../src/lib/seed/import");
    const { normalizeSeed } = await import("../src/lib/seed/normalize");
    db = getDb();
    await db.$executeRawUnsafe(
      `TRUNCATE news_articles, festival_photos, artist_live_albums, band_photos, band_photo_checks, plays, review_queue, concert_genres, concert_artists, concerts, tours, artists, venues, genres, venue_kinds, channels RESTART IDENTITY CASCADE`,
    );
    await importSeed(db, normalizeSeed(JSON.parse(readFileSync("tests/fixtures/seed-concerts.json", "utf8"))));
    home = await import("../src/lib/home");
  });
  afterAll(async () => db.$disconnect());

  it("fills the sections from the seed, each safe when empty", async () => {
    const d = await home.homepageData(new Date("2026-11-18T12:00:00Z"));
    const visible = await db.concert.count({ where: { status: "PUBLISHED", embeddable: true, privacyStatus: "public" } });
    expect(d.hero.totals.concerts).toBe(visible);
    expect(d.hero.totals.official + d.hero.totals.bootlegs).toBe(visible);
    expect(d.hero.totals.festivals + d.hero.totals.venues).toBe(d.hero.totals.places);
    expect(d.lead).toMatch(/^STAGEDIVE has \d+ full rock concerts/);
    expect(d.hero.gig?.concert.artists[0].role).toBe("MAIN");
    // Legends: most concerts first, each linked, with a picture (no band photos in the seed: a concert picture).
    expect(d.legends.length).toBeGreaterThan(0);
    expect(d.legends.length).toBeLessThanOrEqual(home.LEGENDS_SIZE);
    for (let i = 1; i < d.legends.length; i++) expect(d.legends[i - 1].concerts).toBeGreaterThanOrEqual(d.legends[i].concerts);
    expect(d.legends[0].picture?.kind).toBe("concert");
    // Places: Pinkpop has 3 concerts in the fixture, a festival.
    expect(d.places.find((p) => p.slug === "pinkpop")).toMatchObject({ kind: "festival", concerts: 3, href: "/venues/pinkpop" });
    expect(d.places.every((p) => p.picture?.kind === "concert")).toBe(true);
    expect(d.fresh.length).toBeGreaterThan(0);
    expect(d.fresh.length).toBeLessThanOrEqual(home.FRESH_SIZE);
    // Rankings only from ten concerts; official only.
    for (const r of d.bestOf) {
      expect(r.concerts.length).toBeLessThanOrEqual(home.RANKING_TOP);
      expect(r.concerts.every((c) => !c.bootleg)).toBe(true);
    }
    // No news, live albums or bootlegs in the seed: empty, never broken.
    expect(d.news).toEqual({ href: "/news", lead: null, more: [] });
    expect(d.shelves.liveAlbums).toEqual({ href: null, count: 0, albums: [] });
    expect(d.shelves.fans.concerts).toEqual([]);
    expect(d.waysIn.decades.map((x) => x.label)).toEqual(["1980s", "1990s", "2010s", "2020s"]);
    expect(d.waysIn.decades[0]).toMatchObject({ href: "/decades/1980s", line: "post-punk + hardcore" });
    expect(d.waysIn.genres[0].count).toBeGreaterThanOrEqual(d.waysIn.genres.at(-1)!.count);
    // Picture tiles: no band photos in the seed, so a concert picture each, and no band named for it.
    for (const t of [...d.waysIn.decades, ...d.waysIn.genres]) expect(t).toMatchObject({ picture: { kind: "concert" }, pictureBand: null });
    expect(new Set(d.waysIn.songs.map((s) => s.band.slug)).size).toBe(d.waysIn.songs.length);
    expect(d.nextBand.noise.length).toBeGreaterThan(0);
  });

  it("puts a live album on its shelf when it records one of our concerts", async () => {
    const pinkpop = await db.concert.findFirst({
      where: { venue: { slug: "pinkpop" }, performedYear: { not: null } },
      select: { id: true, performedYear: true, credits: { where: { role: "MAIN" }, select: { artistId: true } } },
    });
    await db.artistLiveAlbum.create({
      data: { artistId: pinkpop!.credits[0].artistId, mbid: "00000000-0000-0000-0000-000000000001", title: `Live at Pinkpop ${pinkpop!.performedYear}`, year: null },
    });
    const d = await home.homepageData(new Date("2026-11-18T12:00:00Z"));
    expect(d.shelves.liveAlbums.count).toBe(1);
    expect(d.shelves.liveAlbums.albums[0]).toMatchObject({ title: `Live at Pinkpop ${pinkpop!.performedYear}`, concert: { id: pinkpop!.id } });
    await db.artistLiveAlbum.deleteMany({});
  });
});
