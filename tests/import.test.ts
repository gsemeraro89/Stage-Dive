// Runs the real seed import against a test database (TEST_DATABASE_URL), with the rock test fixture.
// Skipped when no test database is configured.
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GENRES, VENUE_KINDS } from "../src/lib/catalogue";
import { createPrismaClient } from "../src/lib/db";
import { importSeed } from "../src/lib/seed/import";
import { normalizeSeed, type SeedFile } from "../src/lib/seed/normalize";

const url = process.env.TEST_DATABASE_URL;
const seed = normalizeSeed(JSON.parse(readFileSync("tests/fixtures/seed-concerts.json", "utf8")) as SeedFile);

describe.skipIf(!url)("importSeed (database)", () => {
  const db = url ? createPrismaClient(url) : null!;

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    await db.$executeRawUnsafe(
      `TRUNCATE plays, review_queue, concert_genres, concert_artists, concerts, tours, artists, venues, genres, venue_kinds, channels RESTART IDENTITY CASCADE`,
    );
  });
  afterAll(async () => db.$disconnect());

  it("imports every concert with its links", async () => {
    await importSeed(db, seed);
    expect(await db.concert.count()).toBe(seed.concerts.length);
    expect(await db.artist.count()).toBe(seed.artists.length);
    expect(await db.genre.count()).toBe(GENRES.length);
    expect(await db.venueKind.count()).toBe(VENUE_KINDS.length);
    expect(await db.tour.count()).toBe(2);

    const yankee = await db.concert.findUniqueOrThrow({
      where: { youtubeId: "nbhqDjIWLpk" },
      include: { credits: { include: { artist: true } }, genres: { include: { genre: true } }, venueKind: true },
    });
    expect(yankee.credits.map((c) => [c.artist.name, c.role, c.creditNote])).toEqual(
      expect.arrayContaining([
        ["Metallica", "MAIN", null],
        ["Dave Mustaine", "WITH", "guest on Am I Evil?"],
      ]),
    );
    expect(yankee.genres.map((g) => g.genre.name)).toEqual(["metal"]);
    expect(yankee.venueKind?.name).toBe("Room");
    expect(yankee.performedYear).toBe(2011);
    expect(yankee.source).toBe("SEED");
    expect(yankee.curated).toBe(true);

    const muskegon = await db.concert.findUniqueOrThrow({ where: { youtubeId: "IA9xKr_Dmek" }, include: { tour: true } });
    expect(muskegon.tour?.name).toBe("Wherever We May Roam");
  });

  it("can run again without creating duplicates", async () => {
    await importSeed(db, seed);
    expect(await db.concert.count()).toBe(seed.concerts.length);
    expect(await db.tour.count()).toBe(2);
    expect(await db.concertArtist.count()).toBe(seed.concerts.reduce((n, s) => n + s.credits.length, 0));
    expect(await db.concertGenre.count()).toBe(seed.concerts.reduce((n, s) => n + s.genres.length, 0));
  });

  it("keeps the owner's edits to status on a re-run", async () => {
    await db.concert.update({ where: { youtubeId: "abDLUhw-53w" }, data: { status: "HIDDEN" } });
    await importSeed(db, seed);
    const concert = await db.concert.findUniqueOrThrow({ where: { youtubeId: "abDLUhw-53w" } });
    expect(concert.status).toBe("HIDDEN");
  });
});
