// Artist pictures from official YouTube channels (owner decision 13 Nov 2026).
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseYouTubeChannelUrl } from "../src/lib/collector/musicbrainz";

describe("YouTube channel links", () => {
  it("reads channel IDs, handles and user names; ignores the rest", () => {
    expect(parseYouTubeChannelUrl("https://www.youtube.com/channel/UCPKT_csvP72boVX0XrMtagQ")).toEqual({ id: "UCPKT_csvP72boVX0XrMtagQ" });
    expect(parseYouTubeChannelUrl("https://www.youtube.com/@metallica")).toEqual({ handle: "metallica" });
    expect(parseYouTubeChannelUrl("https://youtube.com/user/thecure")).toEqual({ user: "thecure" });
    expect(parseYouTubeChannelUrl("https://www.youtube.com/watch?v=abc")).toBeNull();
    expect(parseYouTubeChannelUrl("https://example.com/@x")).toBeNull();
    expect(parseYouTubeChannelUrl("not a url")).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("artist pictures (database)", () => {
  let db: ReturnType<typeof import("../src/lib/db").getDb>;
  let q: typeof import("../src/lib/queries");
  let images: typeof import("../src/lib/collector/artist-images");

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
    q = await import("../src/lib/queries");
    images = await import("../src/lib/collector/artist-images");
  });
  afterAll(async () => db?.$disconnect());

  it("takes the avatar of the artist's own channel, from our channels or MusicBrainz", async () => {
    // Metallica: the seed's official "Metallica" channel. The Cure: their channel ID is not in the seed, so MusicBrainz.
    const own = "UCbulh9WdLtEXiooRcYK7SWw";
    const asked: unknown[] = [];
    const stats = await images.refreshArtistImages(db, {
      channelFromMusicBrainz: async (name) => (name === "The Cure" ? { handle: "thecure" } : null),
      avatars: async (refs) => {
        asked.push(...refs);
        return new Map([
          [own, { id: own, url: "https://yt3.ggpht.com/metallica=s800-c-k" }],
          ["@thecure", { id: "UC_thecure_test_0000000", url: "https://yt3.ggpht.com/cure=s800-c-k" }],
        ]);
      },
    });
    expect(asked).toEqual([{ id: own }, { handle: "thecure" }]);
    expect(stats.withPicture.sort()).toEqual(["Metallica", "The Cure"]);
    expect(stats.noChannel.length).toBe(stats.checked - 2);

    // Owner decision: the concert thumbnail stays the artist's picture; the avatar is only a fallback.
    const artists = await q.listArtists();
    expect(artists.find((a) => a.slug === "metallica")!.cover!.portrait).toBe(false);
    expect(q.avatarSources("https://yt3.ggpht.com/metallica=s800-c-k").src).toBe("https://yt3.ggpht.com/metallica=s400-c-k");
    expect((await db.artist.findUniqueOrThrow({ where: { slug: "metallica" } })).imageUrl).toBe("https://yt3.ggpht.com/metallica=s800-c-k");
    expect((await db.artist.findUniqueOrThrow({ where: { slug: "the-cure" } })).youtubeChannelId).toBe("UC_thecure_test_0000000");
  });

  it("checks again only when due, and clears a picture whose channel is gone", async () => {
    const none = await images.refreshArtistImages(db, { avatars: async () => new Map() });
    expect(none.checked).toBe(0);
    await db.artist.updateMany({ data: { imageCheckedAt: new Date(Date.now() - 26 * 86_400_000) } });
    const stats = await images.refreshArtistImages(db, { avatars: async () => new Map() });
    expect(stats.cleared.sort()).toEqual(["Metallica", "The Cure"]);
    expect((await db.artist.findUniqueOrThrow({ where: { slug: "metallica" } })).imageUrl).toBeNull();
  });

  it("chooses the cover among the artist's concert thumbnails; avatar only when none shows a person", async () => {
    const covers = await import("../src/lib/collector/covers");
    const metallica = await db.artist.findUniqueOrThrow({ where: { slug: "metallica" }, include: { credits: { include: { concert: true } } } });
    const byViews = [...metallica.credits].sort((a, b) => b.concert.viewCount - a.concert.viewCount).map((c) => c.concert.youtubeId);
    await db.artist.update({ where: { slug: "the-cure" }, data: { imageUrl: "https://yt3.ggpht.com/cure=s800" } });

    const seen: string[][] = [];
    const stats = await covers.chooseCovers(db, async (urls) => {
      seen.push(urls);
      if (urls[0] === covers.judgeUrl(byViews[0])) return 2; // Metallica: the second most viewed concert
      return 0; // everyone else asked: only graphics
    });
    expect(seen.find((u) => u[0] === covers.judgeUrl(byViews[0]))!.length).toBe(Math.min(byViews.length, covers.MAX_CANDIDATES));
    expect(stats.chosen).toEqual(["Metallica"]);
    expect(stats.avatar).toEqual(["The Cure"]);

    const artists = await q.listArtists();
    expect(artists.find((a) => a.slug === "metallica")!.cover).toMatchObject({ portrait: false, youtubeId: byViews[1] });
    expect(artists.find((a) => a.slug === "the-cure")!.cover!.portrait).toBe(true);
    // An artist with one concert and no avatar keeps that thumbnail, without asking.
    expect(artists.find((a) => a.slug === "radiohead")!.cover!.portrait).toBe(false);

    // Asked once: nothing changed, nothing is asked again. The owner's pick is never touched.
    let calls = 0;
    await covers.chooseCovers(db, async () => (calls++, 1));
    expect(calls).toBe(0);
    await db.artist.update({ where: { slug: "metallica" }, data: { coverLocked: true, coverChosenFrom: null, coverYoutubeId: byViews[0] } });
    await covers.chooseCovers(db, async () => (calls++, 3));
    expect(calls).toBe(0);
    expect((await q.listArtists()).find((a) => a.slug === "metallica")!.cover!.youtubeId).toBe(byViews[0]);
  });

  it("never gives a co-headliner the other band's thumbnail", async () => {
    const covers = await import("../src/lib/collector/covers");
    // Host: a band with concerts of their own. Partner: only a co-headlined show billed with the host.
    const host = await db.artist.findUniqueOrThrow({ where: { slug: "metallica" } });
    const partner = await db.artist.create({ data: { slug: "co-headliner", name: "Co-Headliner" } });
    const hostConcerts = await db.concert.findMany({ where: { credits: { some: { artistId: host.id, role: "MAIN" } } }, orderBy: { viewCount: "desc" } });
    const shared = hostConcerts[0];
    await db.concertArtist.create({ data: { concertId: shared.id, artistId: partner.id, role: "MAIN", position: 1 } });
    await db.artist.updateMany({ data: { coverChosenFrom: null, coverLocked: false } });

    // The shared show is one of the host's concerts, but no longer a solo one.
    const asked: { name: string; urls: string[] }[] = [];
    await covers.chooseCovers(db, async (urls, name) => (asked.push({ name, urls }), 1));
    const hostAsk = asked.find((x) => x.name === "Metallica");
    // Only the host's solo concerts are offered to the host; the shared show is left out.
    if (hostAsk) expect(hostAsk.urls).not.toContain(covers.judgeUrl(shared.youtubeId));
    const hostRow = await db.artist.findUniqueOrThrow({ where: { id: host.id } });
    expect(hostRow.coverYoutubeId).not.toBe(shared.youtubeId);

    // The partner's only concert is the shared show, not used by the host, and no channel photo: it is theirs, without asking.
    const partnerRow = await db.artist.findUniqueOrThrow({ where: { id: partner.id } });
    expect(partnerRow.coverYoutubeId).toBe(shared.youtubeId);
    expect(asked.some((x) => x.name === "Co-Headliner")).toBe(false);

    // With a channel photo, an artist with only shared concerts always shows it (the shared show may show the other band).
    await db.artist.update({ where: { id: partner.id }, data: { imageUrl: "https://yt3.ggpht.com/p=s800" } });
    const stats = await covers.chooseCovers(db, async () => 1);
    expect(stats.avatar).toContain("Co-Headliner");
    const cover = (await q.listArtists()).find((a) => a.slug === "co-headliner")!.cover!;
    expect(cover.portrait).toBe(true);
  });
});
