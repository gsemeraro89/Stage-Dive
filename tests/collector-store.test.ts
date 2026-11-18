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
    youtubeId: "NEWSET00001",
    title: "Marsh live at Somewhere",
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
    mainArtists: ["Marsh"],
    collaborators: [],
    venue: "Somewhere Open Air",
    city: "Berlin",
    country: "Germany",
    venueKind: "Festival",
    genres: ["metal"],
    performed: "2024",
    uploaderIsOfficial: false,
    writeUp: "Marsh plays a long melodic house concert outdoors.",
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
      where: { youtubeId: "NEWSET00001" },
      include: { credits: { include: { artist: true } }, genres: { include: { genre: true } }, venue: true, venueKind: true, channel: true },
    });
    expect(concert.source).toBe("COLLECTOR");
    expect(concert.curated).toBe(false);
    expect(concert.credits.map((c) => c.artist.slug)).toEqual(["marsh"]); // existing artist reused
    expect(concert.genres.map((g) => g.genre.name)).toEqual(["Melodic House"]);
    expect(concert.venue?.name).toBe("Somewhere Open Air");
    expect(concert.venueKind?.name).toBe("Festival");
    expect(concert.channel.isOfficial).toBe(false);
    expect(concert.thumbnailUrl).toContain("maxresdefault");
    expect(concert.writeUp).toContain("melodic house");
  });

  it("does not add the same concert twice", async () => {
    const r = await store.saveConcert(db, { video: ytVideo({ youtubeId: "NEWSET00002" }), classification: cls(), channel: fanChannel, thumbnail: null });
    expect(r).toEqual({ status: "duplicate", ofYoutubeId: "NEWSET00001" });
  });

  it("replaces a fan upload with the official upload of the same concert", async () => {
    const r = await store.saveConcert(db, {
      video: ytVideo({ youtubeId: "OFFICIAL001", channelId: officialChannel.youtubeChannelId, channelTitle: officialChannel.name }),
      classification: cls(),
      channel: officialChannel,
      thumbnail: null,
    });
    expect(r.status).toBe("replaced");
    expect(await db.concert.findUnique({ where: { youtubeId: "NEWSET00001" } })).toBeNull();
    expect((await db.concert.findUniqueOrThrow({ where: { youtubeId: "OFFICIAL001" }, include: { channel: true } })).channel.isOfficial).toBe(true);
  });

  it("never replaces a hand-picked seed concert", async () => {
    // Same artist, same venue, same year as the seed's NTO at Tour Saint-Jacques (Cercle, 2017).
    const r = await store.saveConcert(db, {
      video: ytVideo({ youtubeId: "COPYCAT0001", publishedAt: new Date("2017-10-01"), durationSeconds: 5140 }),
      classification: cls({ mainArtists: ["NTO"], venue: "Tour Saint-Jacques" }),
      channel: officialChannel,
      thumbnail: null,
    });
    expect(r).toEqual({ status: "duplicate", ofYoutubeId: "LL0b2ZKEJoY" });
  });

  it("creates new artists, collaborators and a unique slug", async () => {
    const r = await store.saveConcert(db, {
      video: ytVideo({ youtubeId: "NEWARTIST01", publishedAt: new Date("2024-01-01") }),
      classification: cls({ mainArtists: ["Brand New DJ"], collaborators: [{ name: "Guest Star", note: "as GS" }], venue: "Somewhere Open Air" }),
      channel: officialChannel,
      thumbnail: null,
    });
    expect(r.status).toBe("created");
    const concert = await db.concert.findUniqueOrThrow({ where: { youtubeId: "NEWARTIST01" }, include: { credits: { include: { artist: true } } } });
    expect(concert.slug).toBe("brand-new-dj-somewhere-open-air-2024");
    expect(concert.credits.map((c) => [c.artist.name, c.role, c.creditNote])).toEqual([
      ["Brand New DJ", "MAIN", null],
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
    expect((await cache.cachedClassifications(db, ["CACHED00001"], "v1", 30)).get("CACHED00001")?.mainArtists).toEqual(["Marsh"]);
    expect((await cache.cachedClassifications(db, ["CACHED00001"], "v2", 30)).size).toBe(0); // rules changed
    await db.classificationCache.update({ where: { youtubeId: "CACHED00001" }, data: { createdAt: new Date(Date.now() - 31 * 86_400_000) } });
    expect((await cache.cachedClassifications(db, ["CACHED00001"], "v1", 30)).size).toBe(0); // too old
    expect((await store.expireOldData(db, 30)).classifications).toBe(1);
  });

  it("keeps clear verdicts longer so the classifier is not paid again", async () => {
    const old = (days: number) => new Date(Date.now() - days * 86_400_000);
    await store.recordDecision(db, "NOTASET0001", "NOT_A_CONCERT", "a clip");
    await store.recordDecision(db, "NOTELEC0001", "NOT_ROCK", "rock");
    await store.recordDecision(db, "UNSURE00001", "UNCERTAIN", "unsure");
    await db.videoDecision.updateMany({ where: { youtubeId: { in: ["NOTASET0001", "NOTELEC0001", "UNSURE00001"] } }, data: { decidedAt: old(100) } });
    expect([...(await store.recentDecisions(db, ["NOTASET0001", "NOTELEC0001", "UNSURE00001"], 30))].sort()).toEqual(["NOTASET0001", "NOTELEC0001"]);
    await store.expireOldData(db, 30);
    expect(await db.videoDecision.count({ where: { youtubeId: { in: ["NOTASET0001", "NOTELEC0001"] } } })).toBe(2);
    await db.videoDecision.update({ where: { youtubeId: "NOTELEC0001" }, data: { decidedAt: old(200) } });
    expect([...(await store.recentDecisions(db, ["NOTELEC0001"], 30))]).toEqual([]);
    await store.expireOldData(db, 30);
    expect(await db.videoDecision.count({ where: { youtubeId: "NOTELEC0001" } })).toBe(0);
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

  it("retries errors on the next run", async () => {
    await store.recordDecision(db, "ERRORED0001", "ERROR", "timeout");
    expect((await store.recentDecisions(db, ["ERRORED0001"], 30)).size).toBe(0);
  });
});
