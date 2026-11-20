// Storing bootlegs (owner, 20 Nov 2026): official always wins (existing or later), hidden not deleted, shown again
// when the official version goes, dedupe between bootlegs. Needs TEST_DATABASE_URL.
import "dotenv/config";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FullClassification } from "../src/lib/collector/classify";
import type { YouTubeVideo } from "../src/lib/collector/youtube";

const url = process.env.TEST_DATABASE_URL;

const video = (youtubeId: string, over: Partial<YouTubeVideo> = {}): YouTubeVideo => ({
  youtubeId,
  title: "Nirvana live at Teatro Castello, Rome 1991",
  description: "",
  tags: [],
  channelId: "UCfanchannel00000000000",
  channelTitle: "Better Than Nothing Videos",
  publishedAt: new Date("2019-06-01T12:00:00Z"),
  durationSeconds: 3400,
  viewCount: 500_000,
  embeddable: true,
  privacyStatus: "public",
  madeForKids: false,
  liveBroadcastContent: "none",
  uploadStatus: "processed",
  blockedIn: [],
  ...over,
});

const cls = (over: Partial<FullClassification> = {}): FullClassification => ({
  isFullConcert: true,
  notConcertReason: "",
  isRock: true,
  confidence: 0.9,
  mainArtists: ["Nirvana"],
  collaborators: [],
  venue: "Teatro Castello",
  city: "Rome",
  country: "Italy",
  venueKind: "Room",
  genres: ["grunge"],
  performed: "1991-11-19",
  uploaderIsOfficial: false,
  writeUp: "Nirvana in Rome, two months after Nevermind.",
  ...over,
});

const fan = { youtubeChannelId: "UCfanchannel00000000000", name: "Better Than Nothing Videos", isOfficial: false };
const otherFan = { youtubeChannelId: "UCotherfan0000000000000", name: "Jakeflix", isOfficial: false };
const label = { youtubeChannelId: "UCnirvanaofficial000000", name: "Nirvana", isOfficial: true };

describe.skipIf(!url)("bootlegs in the database", () => {
  let store: typeof import("../src/lib/collector/store");
  let db: ReturnType<typeof import("../src/lib/db").getDb>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    const { getDb } = await import("../src/lib/db");
    db = getDb();
    await db.$executeRawUnsafe(
      `TRUNCATE plays, review_queue, video_decisions, long_videos, classification_cache, classifier_batches, artist_lookups, job_runs, concert_genres, concert_artists, concerts, artists, venues, venue_aliases, genres, venue_kinds, tours, channels RESTART IDENTITY CASCADE`,
    );
    store = await import("../src/lib/collector/store");
  });
  afterAll(async () => db?.$disconnect());

  const row = (youtubeId: string) => db.concert.findUniqueOrThrow({ where: { youtubeId } });

  it("stores a bootleg with its mark, credit and its own -bootleg address", async () => {
    const r = await store.saveConcert(db, { video: video("BOOTLEG0001"), classification: cls(), channel: fan, thumbnail: null, bootleg: { creditName: fan.name } });
    expect(r.status).toBe("created");
    const c = await row("BOOTLEG0001");
    expect(c.sourceKind).toBe("FAN_PRO_SHOT");
    expect(c.creditName).toBe("Better Than Nothing Videos");
    expect(c.slug).toBe("nirvana-teatro-castello-1991-bootleg");
    expect(c.status).toBe("PUBLISHED");
  });

  it("never stores a second bootleg of the same concert", async () => {
    const r = await store.saveConcert(db, {
      video: video("BOOTLEG0002", { channelId: otherFan.youtubeChannelId, channelTitle: otherFan.name, durationSeconds: 3380 }),
      classification: cls(),
      channel: otherFan,
      thumbnail: null,
      bootleg: { creditName: otherFan.name },
    });
    expect(r).toEqual({ status: "duplicate", ofYoutubeId: "BOOTLEG0001" });
  });

  it("an official version arriving later hides the bootleg (kept, not deleted) and takes the plain address", async () => {
    const r = await store.saveConcert(db, {
      video: video("OFFICIAL001", { channelId: label.youtubeChannelId, channelTitle: label.name, durationSeconds: 3600, publishedAt: new Date("2024-01-01T00:00:00Z") }),
      classification: cls({ uploaderIsOfficial: true }),
      channel: label,
      thumbnail: null,
    });
    expect(r.status === "created" || r.status === "replaced").toBe(true);
    if (r.status === "duplicate") throw new Error("unexpected");
    expect(r.hiddenBootlegs).toEqual(["nirvana-teatro-castello-1991-bootleg"]);
    expect(r.slug).toBe("nirvana-teatro-castello-1991");
    const b = await row("BOOTLEG0001");
    const o = await row("OFFICIAL001");
    expect(b.status).toBe("HIDDEN");
    expect(b.officialTwinId).toBe(o.id);
    expect(o.sourceKind).toBe("OFFICIAL");
  });

  it("a bootleg of a concert already listed officially is never stored", async () => {
    const r = await store.saveConcert(db, {
      video: video("BOOTLEG0003", { channelId: otherFan.youtubeChannelId, channelTitle: otherFan.name, durationSeconds: 3590 }),
      classification: cls(),
      channel: otherFan,
      thumbnail: null,
      bootleg: { creditName: otherFan.name },
    });
    expect(r.status).toBe("duplicate");
  });

  it("the refresh shows the bootleg again when the official version goes, and hides it when it is back", async () => {
    await db.concert.update({ where: { youtubeId: "OFFICIAL001" }, data: { status: "REMOVED" } });
    expect(await store.syncBootlegTwins(db)).toEqual({ hidden: [], restored: ["nirvana-teatro-castello-1991-bootleg"] });
    expect((await row("BOOTLEG0001")).status).toBe("PUBLISHED");
    await db.concert.update({ where: { youtubeId: "OFFICIAL001" }, data: { status: "PUBLISHED" } });
    expect(await store.syncBootlegTwins(db)).toEqual({ hidden: ["nirvana-teatro-castello-1991-bootleg"], restored: [] });
    expect((await row("BOOTLEG0001")).status).toBe("HIDDEN");
  });

  it("a bootleg the owner hid stays hidden", async () => {
    await db.concert.update({ where: { youtubeId: "BOOTLEG0001" }, data: { officialTwinId: null } });
    await db.concert.update({ where: { youtubeId: "OFFICIAL001" }, data: { status: "REMOVED" } });
    expect(await store.syncBootlegTwins(db)).toEqual({ hidden: [], restored: [] });
    expect((await row("BOOTLEG0001")).status).toBe("HIDDEN");
  });

  it("a bootleg of another concert of the same band is unaffected", async () => {
    await store.saveConcert(db, {
      video: video("BOOTLEG0004", { title: "Nirvana live at Paradiso 1991", durationSeconds: 4200 }),
      classification: cls({ venue: "Paradiso", city: "Amsterdam", country: "Netherlands", performed: "1991-11-25" }),
      channel: fan,
      thumbnail: null,
      bootleg: { creditName: fan.name },
    });
    await db.concert.update({ where: { youtubeId: "OFFICIAL001" }, data: { status: "PUBLISHED" } });
    await store.syncBootlegTwins(db);
    expect((await row("BOOTLEG0004")).status).toBe("PUBLISHED");
  });
});
