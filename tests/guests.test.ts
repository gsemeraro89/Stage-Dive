// Guests get a page only when MusicBrainz knows them (owner rule, 13 Nov 2026).
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("guest artists (database)", () => {
  let db: ReturnType<typeof import("../src/lib/db").getDb>;
  let q: typeof import("../src/lib/queries");
  let concertSlug = "";

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
    // A collector concert by a seed artist with two unknown guests.
    const host = await db.concert.findFirstOrThrow({ where: { credits: { some: { artist: { slug: "paul-kalkbrenner" } } } }, include: { credits: true } });
    const victoria = await db.artist.create({ data: { slug: "victoria", name: "Victoria" } });
    const known = await db.artist.create({ data: { slug: "known-guest", name: "Known Guest" } });
    await db.concertArtist.createMany({
      data: [
        { concertId: host.id, artistId: victoria.id, role: "WITH", position: 5 },
        { concertId: host.id, artistId: known.id, role: "WITH", position: 6 },
      ],
    });
    concertSlug = host.slug;
    q = await import("../src/lib/queries");
  });
  afterAll(async () => db?.$disconnect());

  it("a guest never gets a page from someone else's concert, however well known", async () => {
    expect(await q.getArtistPage("sofiane-pamart")).toBeNull();
    expect(await q.getArtistPage("meute")).toBeNull();
    expect((await q.listArtists()).map((a) => a.slug)).not.toContain("meute");
    expect(await q.getMap("meute")).toBeNull();
  });

  it("unknown guests are plain text: no page, not in lists, not on the map", async () => {
    expect(await q.getArtistPage("victoria")).toBeNull();
    expect((await q.listArtists()).map((a) => a.slug)).not.toContain("victoria");
    expect((await q.filterOptions()).artists.map((a) => a.slug)).not.toContain("victoria");
    expect((await q.findArtistByText("victoria"))).toBeNull();
    const page = (await q.getConcertPage(concertSlug))!;
    const credit = page.concert.artists.find((a) => a.slug === "victoria")!;
    expect(credit.hasPage).toBe(false);
    expect(page.concert.artists.find((a) => a.slug === "paul-kalkbrenner")!.hasPage).toBe(true);
  });

  it("a guest gets a page once they have a concert of their own", async () => {
    const guest = await db.artist.findUniqueOrThrow({ where: { slug: "known-guest" } });
    const other = await db.concert.findFirstOrThrow({ where: { credits: { none: { artistId: guest.id } } } });
    await db.concertArtist.create({ data: { concertId: other.id, artistId: guest.id, role: "MAIN", position: 9 } });
    expect(await q.getArtistPage("known-guest")).not.toBeNull();
    const page = (await q.getConcertPage(concertSlug))!;
    expect(page.concert.artists.find((a) => a.slug === "known-guest")!.hasPage).toBe(true);
  });
});
