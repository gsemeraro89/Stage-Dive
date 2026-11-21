// Saving collected concerts: duplicates, official-over-fan, hand-picked concerts protected. Needs TEST_DATABASE_URL.
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FullClassification } from "../src/lib/collector/classify";
import type { YouTubeVideo } from "../src/lib/collector/youtube";

const url = process.env.TEST_DATABASE_URL;

function ytVideo(overrides: Partial<YouTubeVideo> = {}): YouTubeVideo {
  return {
    youtubeId: "NEWCONC0001",
    title: "Radiohead live at Somewhere Open Air",
    description: "",
    tags: [],
    channelId: "UCfan000000000000000000",
    channelTitle: "Some Fan",
    publishedAt: new Date("2025-06-01T12:00:00Z"),
    durationSeconds: 6000,
    viewCount: 11_000_000,
    embeddable: true,
    privacyStatus: "public",
    madeForKids: false,
    liveBroadcastContent: "none",
    uploadStatus: "processed",
    blockedIn: [],
    ...overrides,
  };
}

function cls(overrides: Partial<FullClassification> = {}): FullClassification {
  return {
    isFullConcert: true,
    notConcertReason: "",
    isRock: true,
    confidence: 0.95,
    mainArtists: ["Radiohead"],
    collaborators: [],
    venue: "Somewhere Open Air",
    city: "Berlin",
    country: "Germany",
    venueKind: "Festival",
    genres: ["alternative"],
    performed: "2024",
    uploaderIsOfficial: false,
    writeUp: "Radiohead play a long open-air festival show.",
    ...overrides,
  };
}

describe.skipIf(!url)("saveConcert (database)", () => {
  let store: typeof import("../src/lib/collector/store");
  let db: ReturnType<typeof import("../src/lib/db").getDb>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    const { getDb } = await import("../src/lib/db");
    const { importSeed } = await import("../src/lib/seed/import");
    const { normalizeSeed } = await import("../src/lib/seed/normalize");
    db = getDb();
    await db.$executeRawUnsafe(
      `TRUNCATE plays, review_queue, video_decisions, long_videos, classification_cache, classifier_batches, artist_lookups, job_runs, concert_genres, concert_artists, concerts, artists, venues, genres, venue_kinds, tours, channels RESTART IDENTITY CASCADE`,
    );
    await importSeed(db, normalizeSeed(JSON.parse(readFileSync("tests/fixtures/seed-concerts.json", "utf8"))));
    store = await import("../src/lib/collector/store");
  });
  afterAll(async () => db?.$disconnect());

  const fanChannel = { youtubeChannelId: "UCfan000000000000000000", name: "Some Fan", isOfficial: false };
  const officialChannel = { youtubeChannelId: "UCofficial0000000000000", name: "Somewhere Festival", isOfficial: true };

  it("creates a new concert with artist, venue, genres, venueKind and write-up", async () => {
    const r = await store.saveConcert(db, { video: ytVideo(), classification: cls(), channel: fanChannel, thumbnail: "maxresdefault" });
    expect(r.status).toBe("created");
    const concert = await db.concert.findUniqueOrThrow({
      where: { youtubeId: "NEWCONC0001" },
      include: { credits: { include: { artist: true } }, genres: { include: { genre: true } }, venue: true, venueKind: true, channel: true },
    });
    expect(concert.source).toBe("COLLECTOR");
    expect(concert.curated).toBe(false);
    expect(concert.credits.map((c) => c.artist.slug)).toEqual(["radiohead"]); // existing artist reused
    expect(concert.genres.map((g) => g.genre.name)).toEqual(["alternative"]);
    expect(concert.venue?.name).toBe("Somewhere Open Air");
    expect(concert.venueKind?.name).toBe("Festival");
    expect(concert.channel.isOfficial).toBe(false);
    expect(concert.thumbnailUrl).toContain("maxresdefault");
    expect(concert.writeUp).toContain("open-air festival");
  });

  it("does not add the same concert twice", async () => {
    const r = await store.saveConcert(db, { video: ytVideo({ youtubeId: "NEWCONC0002" }), classification: cls(), channel: fanChannel, thumbnail: null });
    expect(r).toEqual({ status: "duplicate", ofYoutubeId: "NEWCONC0001" });
  });

  it("replaces a fan upload with the official upload of the same concert", async () => {
    const r = await store.saveConcert(db, {
      video: ytVideo({ youtubeId: "OFFICIAL001", channelId: officialChannel.youtubeChannelId, channelTitle: officialChannel.name }),
      classification: cls(),
      channel: officialChannel,
      thumbnail: null,
    });
    expect(r.status).toBe("replaced");
    expect(await db.concert.findUnique({ where: { youtubeId: "NEWCONC0001" } })).toBeNull();
    expect((await db.concert.findUniqueOrThrow({ where: { youtubeId: "OFFICIAL001" }, include: { channel: true } })).channel.isOfficial).toBe(true);
  });

  it("never replaces a hand-picked seed concert", async () => {
    // Same band, same venue, uploaded weeks after the seed's Metallica at Yankee Stadium (2022), other channel.
    const r = await store.saveConcert(db, {
      video: ytVideo({ youtubeId: "COPYCAT0001", publishedAt: new Date("2022-03-01"), durationSeconds: 8100 }),
      classification: cls({ mainArtists: ["Metallica"], venue: "Yankee Stadium", genres: ["metal"], performed: "2011-09-14" }),
      channel: officialChannel,
      thumbnail: null,
    });
    expect(r).toEqual({ status: "duplicate", ofYoutubeId: "nbhqDjIWLpk" });
  });

  it("creates new artists, collaborators and a unique slug", async () => {
    const r = await store.saveConcert(db, {
      video: ytVideo({ youtubeId: "NEWARTIST01", publishedAt: new Date("2024-01-01") }),
      classification: cls({ mainArtists: ["Brand New Band"], collaborators: [{ name: "Guest Star", note: "as GS" }], venue: "Somewhere Open Air" }),
      channel: officialChannel,
      thumbnail: null,
    });
    expect(r.status).toBe("created");
    const concert = await db.concert.findUniqueOrThrow({ where: { youtubeId: "NEWARTIST01" }, include: { credits: { include: { artist: true } } } });
    expect(concert.slug).toBe("brand-new-band-somewhere-open-air-2024");
    expect(concert.credits.map((c) => [c.artist.name, c.role, c.creditNote])).toEqual([
      ["Brand New Band", "MAIN", null],
      ["Guest Star", "WITH", "as GS"],
    ]);
  });

  it("remembers decisions and forgets them after the retention period", async () => {
    await store.recordDecision(db, "DECIDED0001", "UNCERTAIN", "not sure");
    expect([...(await store.recentDecisions(db, ["DECIDED0001", "UNKNOWN0001"], 30))]).toEqual(["DECIDED0001"]);
    await db.videoDecision.update({ where: { youtubeId: "DECIDED0001" }, data: { decidedAt: new Date(Date.now() - 31 * 86_400_000) } });
    expect((await store.recentDecisions(db, ["DECIDED0001"], 30)).size).toBe(0);
    expect((await store.expireOldData(db, 30)).decisions).toBe(1);
  });

  it("reuses a stored classification only for the same rules and within 30 days", async () => {
    const cache = await import("../src/lib/collector/cache");
    await cache.storeClassification(db, "CACHED00001", "v1", cls());
    expect((await cache.cachedClassifications(db, ["CACHED00001"], "v1", 30)).get("CACHED00001")?.mainArtists).toEqual(["Radiohead"]);
    expect((await cache.cachedClassifications(db, ["CACHED00001"], "v2", 30)).size).toBe(0); // rules changed
    await db.classificationCache.update({ where: { youtubeId: "CACHED00001" }, data: { createdAt: new Date(Date.now() - 31 * 86_400_000) } });
    expect((await cache.cachedClassifications(db, ["CACHED00001"], "v1", 30)).size).toBe(0); // too old
    expect((await store.expireOldData(db, 30)).classifications).toBe(1);
  });

  it("keeps clear verdicts longer so the classifier is not paid again", async () => {
    const old = (days: number) => new Date(Date.now() - days * 86_400_000);
    await store.recordDecision(db, "NOTACON0001", "NOT_A_CONCERT", "a clip");
    await store.recordDecision(db, "NOTROCK0001", "NOT_ROCK", "not rock");
    await store.recordDecision(db, "UNSURE00001", "UNCERTAIN", "unsure");
    await db.videoDecision.updateMany({ where: { youtubeId: { in: ["NOTACON0001", "NOTROCK0001", "UNSURE00001"] } }, data: { decidedAt: old(100) } });
    expect([...(await store.recentDecisions(db, ["NOTACON0001", "NOTROCK0001", "UNSURE00001"], 30))].sort()).toEqual(["NOTACON0001", "NOTROCK0001"]);
    await store.expireOldData(db, 30);
    expect(await db.videoDecision.count({ where: { youtubeId: { in: ["NOTACON0001", "NOTROCK0001"] } } })).toBe(2);
    await db.videoDecision.update({ where: { youtubeId: "NOTROCK0001" }, data: { decidedAt: old(200) } });
    expect([...(await store.recentDecisions(db, ["NOTROCK0001"], 30))]).toEqual([]);
    await store.expireOldData(db, 30);
    expect(await db.videoDecision.count({ where: { youtubeId: "NOTROCK0001" } })).toBe(0);
  });

  it("remembers long videos, looks at them again when due, forgets them", async () => {
    await db.longVideo.deleteMany();
    await store.rememberLongVideos(db, [{ youtubeId: "LONGVIDEO01", channelId: "UC1" }, { youtubeId: "LONGVIDEO02", channelId: "UC1" }]);
    expect(await store.longVideosDue(db, { everyDays: 7 })).toEqual([]);
    expect((await store.longVideosDue(db, { everyDays: 7, all: true })).sort()).toEqual(["LONGVIDEO01", "LONGVIDEO02"]);
    await db.longVideo.update({ where: { youtubeId: "LONGVIDEO01" }, data: { checkedAt: new Date(Date.now() - 8 * 86_400_000) } });
    expect(await store.longVideosDue(db, { everyDays: 7 })).toEqual(["LONGVIDEO01"]);
    await store.rememberLongVideos(db, [{ youtubeId: "LONGVIDEO01", channelId: "UC1" }]); // checked again
    expect(await store.longVideosDue(db, { everyDays: 7 })).toEqual([]);
    expect(await store.forgetLongVideos(db, ["LONGVIDEO01", "NOTTHERE001"])).toBe(1);
    expect(await db.longVideo.count()).toBe(1);
  });

  it("handles a full re-read: tens of thousands of IDs in one call (Postgres parameter limit)", async () => {
    const many = Array.from({ length: 40_000 }, (_, i) => `BULK${String(i).padStart(7, "0")}`);
    await store.recordDecision(db, many[39_999], "NOT_A_CONCERT", "clip");
    expect([...(await store.recentDecisions(db, many, 30))]).toEqual([many[39_999]]);
    await db.longVideo.deleteMany();
    await store.rememberLongVideos(db, many.map((youtubeId) => ({ youtubeId, channelId: "UC1" })));
    expect(await db.longVideo.count()).toBe(40_000);
    expect(await store.forgetLongVideos(db, many)).toBe(40_000);
    expect(store.chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("links the main band's tour named in the title, and merges spellings of one tour (owner, 21 Nov 2026)", async () => {
    const a = await store.saveConcert(db, {
      video: ytVideo({ youtubeId: "TOURVID0001", title: "Metallica - Wherever We May Roam Tour 1992 - Live in San Diego" }),
      classification: cls({ mainArtists: ["Metallica"], venue: "San Diego Sports Arena", city: "San Diego", country: "United States", venueKind: "Room", performed: "1992-01-13" }),
      channel: officialChannel,
      thumbnail: null,
    });
    const b = await store.saveConcert(db, {
      video: ytVideo({ youtubeId: "TOURVID0002", title: "METALLICA - WHEREVER WE MAY ROAM WORLD TOUR - LIVE IN PARIS" }),
      classification: cls({ mainArtists: ["Metallica"], venue: "Bercy", city: "Paris", country: "France", venueKind: "Room", performed: "1992-07-02" }),
      channel: officialChannel,
      thumbnail: null,
    });
    const rows = await db.concert.findMany({ where: { youtubeId: { in: ["TOURVID0001", "TOURVID0002"] } }, include: { tour: { include: { artist: true } } } });
    expect(a.status).toBe("created");
    expect(b.status).toBe("created");
    // The seed already lists Metallica's "Wherever We May Roam": both concerts join that tour, under its spelling.
    const seedTour = await db.tour.findFirstOrThrow({ where: { name: "Wherever We May Roam" } });
    expect(rows.map((r) => r.tourId)).toEqual([seedTour.id, seedTour.id]);
    expect(rows[0].tour?.artist?.slug).toBe("metallica");
    expect(rows.every((r) => r.tourCheckedAt)).toBe(true);
  });

  it("creates a new tour for the band, its slug carrying the band", async () => {
    await store.saveConcert(db, {
      video: ytVideo({ youtubeId: "TOURVID0005", title: "Iron Maiden - Somewhere Back in Time World Tour 2008 (Live in Mumbai)" }),
      classification: cls({ mainArtists: ["Iron Maiden"], venue: "Palace Grounds", city: "Bangalore", country: "India", venueKind: "Room", performed: "2008" }),
      channel: officialChannel,
      thumbnail: null,
    });
    const row = await db.concert.findUniqueOrThrow({ where: { youtubeId: "TOURVID0005" }, include: { tour: { include: { artist: true } } } });
    expect(row.tour).toMatchObject({ name: "Somewhere Back in Time World Tour", slug: "iron-maiden-somewhere-back-in-time-world-tour" });
    expect(row.tour?.artist?.slug).toBe("iron-maiden");
  });

  it("leaves the tour open when the rules are unsure and Haiku has not answered; a supported lane hint settles it", async () => {
    await store.saveConcert(db, {
      video: ytVideo({ youtubeId: "TOURVID0003", title: "Ghost live, supporting Metallica WorldWired Tour" }),
      classification: cls({ mainArtists: ["Ghost"], venue: "Stade de France", city: "Paris", country: "France", venueKind: "Room", performed: "2019-07-06" }),
      channel: officialChannel,
      thumbnail: null,
    });
    await store.saveConcert(db, {
      video: ytVideo({ youtubeId: "TOURVID0004", title: "muse drones world tour live in rome" }),
      classification: { ...cls({ mainArtists: ["Muse"], venue: "Stadio Olimpico", city: "Rome", country: "Italy", venueKind: "Room", performed: "2016" }), tour: "Drones World Tour" },
      channel: officialChannel,
      thumbnail: null,
    });
    const ghost = await db.concert.findUniqueOrThrow({ where: { youtubeId: "TOURVID0003" } });
    expect(ghost.tourId).toBeNull();
    expect(ghost.tourCheckedAt).toBeNull();
    const muse = await db.concert.findUniqueOrThrow({ where: { youtubeId: "TOURVID0004" }, include: { tour: true } });
    expect(muse.tour?.name).toBe("Drones World Tour");
  });

  it("backfills tours once: regex first, nothing asked twice (admin_ops backfill-tours)", async () => {
    const { backfillTours } = await import("../src/lib/collector/tour-backfill");
    await db.concert.updateMany({ where: { youtubeId: { notIn: ["TOURVID0003"] } }, data: { tourCheckedAt: new Date() } });
    await db.concert.updateMany({ where: { youtubeId: "TOURVID0003" }, data: { tourCheckedAt: null } });
    const yt = {
      unitsUsed: 0,
      async videos(ids: string[]) {
        this.unitsUsed++;
        return new Map(ids.map((id) => [id, ytVideo({ youtubeId: id, title: "Ghost - Live in Paris", description: "Filmed during the Imperatour, part of their Imperatour World Tour 2019." })]));
      },
    };
    const first = await backfillTours(db, yt as never, null);
    expect(first.concertsLooked).toBe(1);
    expect(first.byRegex).toBe(1);
    expect((await db.concert.findUniqueOrThrow({ where: { youtubeId: "TOURVID0003" }, include: { tour: true } })).tour?.name).toBe("Imperatour World Tour");
    const again = await backfillTours(db, yt as never, null);
    expect(again.concertsLooked).toBe(0);
  });

  it("retries errors on the next run", async () => {
    await store.recordDecision(db, "ERRORED0001", "ERROR", "timeout");
    expect((await store.recentDecisions(db, ["ERRORED0001"], 30)).size).toBe(0);
  });
});
