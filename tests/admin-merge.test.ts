// One-off fixes: merging two pages of the same artist, closing stale review items.
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("admin fixes (database)", () => {
  let db: ReturnType<typeof import("../src/lib/db").getDb>;
  let admin: typeof import("../src/lib/admin/merge");

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
    admin = await import("../src/lib/admin/merge");
  });
  afterAll(async () => db?.$disconnect());

  it("moves every credit to one page, keeps the other name as aka, deletes the extra page", async () => {
    const into = await db.artist.findUniqueOrThrow({ where: { slug: "nto" }, include: { credits: true } });
    const concert = await db.concert.findFirstOrThrow({ where: { credits: { some: { artistId: into.id } } } });
    const dup = await db.artist.create({ data: { slug: "n-to", name: "N'to", origin: "Marseille" } });
    // One concert credited to both (stays one credit), one concert only on the duplicate (moves).
    await db.concertArtist.create({ data: { concertId: concert.id, artistId: dup.id, role: "MAIN" } });
    const other = await db.concert.findFirstOrThrow({ where: { credits: { none: { artistId: into.id } } } });
    await db.concertArtist.create({ data: { concertId: other.id, artistId: dup.id, role: "MAIN", position: 1 } });

    const r = await admin.mergeArtists(db, "n-to", "nto");
    expect(r).toMatchObject({ creditsMoved: 1, creditsDropped: 1 });
    expect(await db.artist.findUnique({ where: { slug: "n-to" } })).toBeNull();
    const after = await db.artist.findUniqueOrThrow({ where: { slug: "nto" }, include: { credits: true } });
    expect(after.credits.length).toBe(into.credits.length + 1);
    expect(after.aka).toContain("N'to");
    await expect(admin.mergeArtists(db, "nto", "nto")).rejects.toThrow();
  });

  it("splits a group page into its members and hides a concert", async () => {
    const concert = await db.concert.findFirstOrThrow({ where: { status: "PUBLISHED" } });
    const group = await db.artist.create({ data: { slug: "three-of-us", name: "Three Of Us" } });
    const a = await db.artist.create({ data: { slug: "member-a", name: "Member A" } });
    const b = await db.artist.create({ data: { slug: "member-b", name: "Member B" } });
    await db.concertArtist.create({ data: { concertId: concert.id, artistId: group.id, role: "MAIN" } });
    expect(await admin.splitArtist(db, "three-of-us", ["member-a", "member-b"])).toEqual({ concerts: 1 });
    expect(await db.artist.findUnique({ where: { slug: "three-of-us" } })).toBeNull();
    for (const m of [a, b]) expect(await db.concertArtist.findUnique({ where: { concertId_artistId: { concertId: concert.id, artistId: m.id } } })).toMatchObject({ role: "MAIN" });
    expect(await admin.hideConcert(db, concert.slug)).toBe(concert.slug);
    expect((await db.concert.findUniqueOrThrow({ where: { id: concert.id } })).status).toBe("HIDDEN");
  });

  it("closes review items whose video is already a concert, and older copies of the same video", async () => {
    const concert = await db.concert.findFirstOrThrow();
    await db.reviewItem.createMany({
      data: [
        { youtubeId: concert.youtubeId, payload: {}, reason: "x", confidence: 0.5 },
        { youtubeId: "WAITING0001", payload: {}, reason: "x", confidence: 0.5 },
        { youtubeId: "WAITING0001", payload: {}, reason: "x", confidence: 0.5 },
      ],
    });
    expect(await admin.closeStaleReviewItems(db)).toBe(2);
    expect(await db.reviewItem.count({ where: { status: "PENDING" } })).toBe(1);
    expect(await admin.rejectReviewVideos(db, ["WAITING0001"])).toBe(1);
    expect(await db.reviewItem.count({ where: { status: "PENDING" } })).toBe(0);
    expect((await db.videoDecision.findFirst({ where: { youtubeId: "WAITING0001" } }))?.verdict).toBe("NOT_ELECTRONIC");
  });
});
