// Homepage data (src/lib/home.ts): issue number, weekly rotation, owner picks, and the sections (database).
import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GENRES } from "../src/lib/catalogue";
import { DECADE_LINES, issueLabel, NOISE_ORDER, pickForWeek, readHomePicks, weekNumber } from "../src/lib/home";

describe("issue number and weekly rotation", () => {
  it("starts at No.001 in the week of 16 Nov 2026 and moves on each Monday", () => {
    expect(issueLabel(new Date("2026-11-18T12:00:00Z"))).toBe("No.001");
    expect(issueLabel(new Date("2026-11-22T23:59:59Z"))).toBe("No.001");
    expect(issueLabel(new Date("2026-11-23T00:00:00Z"))).toBe("No.002");
    expect(issueLabel(new Date("2027-11-15T00:00:00Z"))).toBe("No.053");
    expect(weekNumber(new Date("2026-01-01T00:00:00Z"))).toBe(0);
  });
  it("picks one item per week, in turn", () => {
    const items = ["a", "b", "c"];
    expect(pickForWeek(items, new Date("2026-11-18T00:00:00Z"))).toBe("a");
    expect(pickForWeek(items, new Date("2026-11-25T00:00:00Z"))).toBe("b");
    expect(pickForWeek(items, new Date("2026-12-09T00:00:00Z"))).toBe("a");
    expect(pickForWeek([], new Date())).toBeNull();
  });
  it("orders every genre from quiet to loud, and has a line for each decade on the board", () => {
    expect([...NOISE_ORDER].sort()).toEqual([...GENRES].sort());
    expect(Object.keys(DECADE_LINES)).toEqual(["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]);
  });
});

describe("owner picks", () => {
  const write = (content: string) => {
    const file = join(mkdtempSync(join(tmpdir(), "picks-")), "home-picks.json");
    writeFileSync(file, content);
    return file;
  };
  it("shows the night that… only when the owner wrote a headline and a story", () => {
    expect(readHomePicks(write(JSON.stringify({ nightThat: { youtubeId: "x", headline: " A ", story: " B " } }))).nightThat).toEqual({
      youtubeId: "x",
      headline: "A",
      story: "B",
    });
    expect(readHomePicks(write(JSON.stringify({ nightThat: { youtubeId: "x", headline: "A", story: "" } }))).nightThat).toBeNull();
    expect(readHomePicks(write("not json"))).toEqual({});
    expect(readHomePicks("does-not-exist.json")).toEqual({});
  });
  it("the shipped file has no invented story", () => {
    expect(readHomePicks("data/home-picks.json").nightThat).toBeNull();
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
      `TRUNCATE band_photos, band_photo_checks, plays, review_queue, concert_genres, concert_artists, concerts, tours, artists, venues, genres, venue_kinds, channels RESTART IDENTITY CASCADE`,
    );
    await importSeed(db, normalizeSeed(JSON.parse(readFileSync("tests/fixtures/seed-concerts.json", "utf8"))));
    home = await import("../src/lib/home");
  });
  afterAll(async () => db.$disconnect());

  it("fills every section from the seed", async () => {
    const d = await home.homeData(new Date("2026-11-18T12:00:00Z"));
    expect(d.issue).toBe("No.001");
    expect(d.gigOfTheWeek?.concert.artists[0].role).toBe("MAIN");
    expect(d.fresh).toHaveLength(6);
    expect(d.decades.map((x) => x.label)).toEqual(["1980s", "1990s", "2010s", "2020s"]); // the fixture has no 2000s gig
    expect(d.decades[0]).toMatchObject({ label: "1980s", count: 1, line: "post-punk + hardcore" });
    // Pinkpop has 3 gigs in the fixture; rooms are the arenas, clubs and stadiums.
    expect(d.fields[0]).toMatchObject({ slug: "pinkpop", count: 3, city: "Landgraaf" });
    expect(d.rooms.map((r) => r.slug)).toEqual(expect.arrayContaining(["the-metro", "yankee-stadium"]));
    // No plays yet: most played falls back to YouTube views.
    expect(d.mostPlayedBy).toBe("views");
    expect(d.mostPlayed.map((m) => m.concert.youtubeId)[0]).toBe("vXsFpdYAV9c");
    expect(d.nightThat).toBeNull();
    expect(d.noise.map((g) => g.name)).toEqual([...NOISE_ORDER]);
    expect(d.noise.find((g) => g.name === "metal")?.count).toBe(4);
  });

  it("ranks by plays on the site once there are enough", async () => {
    const concerts = await db.concert.findMany({ orderBy: { id: "asc" }, take: 6 });
    const rows = concerts.flatMap((c, i) => Array.from({ length: 6 - i }, () => ({ concertId: c.id, startedAt: new Date("2026-11-17T10:00:00Z") })));
    await db.play.createMany({ data: rows });
    const d = await home.homeData(new Date("2026-11-18T12:00:00Z"));
    expect(d.mostPlayedBy).toBe("plays");
    expect(d.mostPlayed[0]).toMatchObject({ plays: 6 });
    expect(d.mostPlayed[0].concert.id).toBe(concerts[0].id);
    await db.play.deleteMany({});
  });

  it("the gig of the week changes with the week", async () => {
    const a = await home.homeData(new Date("2026-11-18T12:00:00Z"));
    const b = await home.homeData(new Date("2026-11-25T12:00:00Z"));
    expect(a.gigOfTheWeek?.concert.id).not.toBe(b.gigOfTheWeek?.concert.id);
  });
});
