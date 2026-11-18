// Runs the real seed import against a test database (TEST_DATABASE_URL).
// Skipped when no test database is configured.
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/lib/db";
import { importSeed } from "../src/lib/seed/import";
import { normalizeSeed, type SeedFile } from "../src/lib/seed/normalize";

const url = process.env.TEST_DATABASE_URL;
const seed = normalizeSeed(JSON.parse(readFileSync("data/seed-concerts.json", "utf8")) as SeedFile);

describe.skipIf(!url)("importSeed (database)", () => {
  const db = url ? createPrismaClient(url) : null!;

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    await db.$executeRawUnsafe(
      `TRUNCATE plays, review_queue, concert_genres, concert_artists, concerts, artists, venues, genres, settings, channels RESTART IDENTITY CASCADE`,
    );
  });
  afterAll(async () => db.$disconnect());

  it("imports every concert with its links", async () => {
    await importSeed(db, seed);
    expect(await db.concert.count()).toBe(23);
    expect(await db.artist.count()).toBe(seed.artists.length);
    expect(await db.genre.count()).toBe(9);
    expect(await db.setting.count()).toBe(5);

    const sinners = await db.concert.findUniqueOrThrow({
      where: { youtubeId: "b_fKzTdMViQ" },
      include: { credits: { include: { artist: true } }, genres: { include: { genre: true } }, setting: true },
    });
    expect(sinners.credits.map((c) => [c.artist.name, c.role, c.creditNote])).toEqual(
      expect.arrayContaining([
        ["NTO", "MAIN", null],
        ["Joachim Pastor", "WITH", "as Sinners"],
      ]),
    );
    expect(sinners.genres.map((g) => g.genre.name)).toEqual(["Melodic Techno"]);
    expect(sinners.liveAct).toBe(true);
    expect(sinners.setting?.name).toBe("Special location");
    expect(sinners.source).toBe("SEED");
    expect(sinners.curated).toBe(true);
  });

  it("can run again without creating duplicates", async () => {
    await importSeed(db, seed);
    expect(await db.concert.count()).toBe(23);
    expect(await db.concertArtist.count()).toBe(seed.concerts.reduce((n, s) => n + s.credits.length, 0));
    expect(await db.concertGenre.count()).toBe(seed.concerts.reduce((n, s) => n + s.genres.length, 0));
  });

  it("keeps the owner's edits to status on a re-run", async () => {
    await db.concert.update({ where: { youtubeId: "iybJn1SyXB0" }, data: { status: "HIDDEN" } });
    await importSeed(db, seed);
    const concert = await db.concert.findUniqueOrThrow({ where: { youtubeId: "iybJn1SyXB0" } });
    expect(concert.status).toBe("HIDDEN");
  });
});
