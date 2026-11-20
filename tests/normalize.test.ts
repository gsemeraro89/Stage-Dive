import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decadeOf, GENRES, normalizeGenre, normalizeVenueKind, parseDecade, VENUE_KINDS } from "../src/lib/catalogue";
import { formatCredits, formatDate, formatDuration } from "../src/lib/format";
import {
  buildConcertSlugs,
  cleanGenres,
  normalizeSeed,
  parseCollaborator,
  parsePerformed,
  type SeedConcert,
  type SeedFile,
} from "../src/lib/seed/normalize";
import { slugify } from "../src/lib/slug";

const seedFile = JSON.parse(readFileSync("tests/fixtures/seed-concerts.json", "utf8")) as SeedFile;

function makeConcert(overrides: Partial<SeedConcert> = {}): SeedConcert {
  return {
    id: "AAAAAAAAAAA",
    artist: "Test Band",
    title: "Test Band live (full concert)",
    channel: "Test Channel",
    official: true,
    secs: 3600,
    views: 500000,
    date: "2025-01-01",
    performed: "1994-06-04",
    genres: ["grunge"],
    venue: "Test Hall",
    city: "Seattle",
    country: "US",
    venueKind: "Room",
    checked_on: "2026-11-18",
    ...overrides,
  };
}

describe("slugify", () => {
  it("strips accents, apostrophes and symbols", () => {
    expect(slugify("Mötley Crüe")).toBe("motley-crue");
    expect(slugify("Guns N' Roses")).toBe("guns-n-roses");
    expect(slugify("AC/DC")).toBe("ac-dc");
  });
});

describe("catalogue", () => {
  it("has the 12 genres of the brief plus new wave / synth and the owner's three wider genres", () => {
    expect(GENRES).toHaveLength(16);
    expect(GENRES).toContain("new wave / synth");
    expect(GENRES).toContain("emo / post-hardcore");
    expect(GENRES.slice(-3)).toEqual(["trip hop", "electronic rock / big beat", "art pop / experimental"]);
  });
  it("gives the new genres clean page slugs", async () => {
    const { slugify } = await import("../src/lib/slug");
    expect(GENRES.slice(-3).map(slugify)).toEqual(["trip-hop", "electronic-rock-big-beat", "art-pop-experimental"]);
  });
  it("maps the new genres' spellings, and keeps techno, hip hop, reggae and jazz out", () => {
    expect(normalizeGenre("Trip-Hop")).toBe("trip hop");
    expect(normalizeGenre("triphop")).toBe("trip hop");
    expect(normalizeGenre("Big Beat")).toBe("electronic rock / big beat");
    expect(normalizeGenre("electronic rock")).toBe("electronic rock / big beat");
    expect(normalizeGenre("Art Pop")).toBe("art pop / experimental");
    expect(normalizeGenre("experimental")).toBe("art pop / experimental");
    for (const g of ["techno", "house", "hip hop", "reggae", "jazz", "classical", "pop"]) expect(normalizeGenre(g), g).toBeNull();
  });
  it("maps genre spellings onto the list and rejects others", () => {
    expect(normalizeGenre("Metal")).toBe("metal");
    expect(normalizeGenre("emo/post-hardcore")).toBe("emo / post-hardcore");
    expect(normalizeGenre("synth-pop")).toBe("new wave / synth");
    expect(normalizeGenre("techno")).toBeNull();
  });
  it("maps venue-kind labels onto the four kinds", () => {
    expect(VENUE_KINDS).toEqual(["Festival", "Room", "Livestream", "TV-Studio"]);
    expect(normalizeVenueKind("festival archive")).toBe("Festival");
    expect(normalizeVenueKind("Arena")).toBe("Room");
    expect(normalizeVenueKind("webcast")).toBe("Livestream");
    expect(() => normalizeVenueKind("Boiler Room")).toThrow(/Unknown venue kind/);
  });
  it("names decades", () => {
    expect(decadeOf(1983)).toBe("1980s");
    expect(decadeOf(2000)).toBe("2000s");
    expect(parseDecade("1990s")).toBe(1990);
    expect(parseDecade("1995s")).toBeNull();
    expect(parseDecade("1890s")).toBeNull();
    expect(parseDecade("nineties")).toBeNull();
  });
});

describe("parsePerformed", () => {
  it("accepts a year, a month or a day", () => {
    expect(parsePerformed("1997", "x")).toEqual({ year: 1997, day: null });
    expect(parsePerformed("2026-06", "x")).toEqual({ year: 2026, day: null });
    expect(parsePerformed("1983-08-12", "x")).toEqual({ year: 1983, day: new Date("1983-08-12T00:00:00Z") });
  });
  it("rejects anything else", () => {
    expect(() => parsePerformed("check", "x")).toThrow();
    expect(() => parsePerformed("1991-13", "x")).toThrow();
    expect(() => parsePerformed("1991-02-30", "x")).toThrow();
    expect(() => parsePerformed("2999", "x")).toThrow();
  });
});

describe("parseCollaborator", () => {
  it("splits a note in brackets", () => {
    expect(parseCollaborator("Dave Mustaine (guest on Am I Evil?)")).toEqual({ name: "Dave Mustaine", note: "guest on Am I Evil?" });
    expect(parseCollaborator("Lou Reed")).toEqual({ name: "Lou Reed", note: null });
  });
});

describe("cleanGenres", () => {
  it("drops duplicates and rejects unknown genres", () => {
    expect(cleanGenres(["Metal", "metal", "hard rock"], "x")).toEqual(["metal", "hard rock"]);
    expect(() => cleanGenres(["Techno"], "x")).toThrow(/unknown genre "Techno"/);
  });
});

describe("buildConcertSlugs", () => {
  it("builds band-venue-year slugs from the year played", () => {
    const slugs = buildConcertSlugs([{ id: "abDLUhw-53w", artist: "Metallica", venue: "The Metro", performed: "1983-08-12" }]);
    expect(slugs.get("abDLUhw-53w")).toBe("metallica-the-metro-1983");
  });
  it("adds the YouTube ID to every concert in a clash, whatever the order", () => {
    const a = { id: "AAAAAAAAAAA", artist: "Korn", venue: "Pinkpop", performed: "2000" };
    const b = { id: "BBBBBBBBBBB", artist: "Korn", venue: "Pinkpop", performed: "2000-06" };
    for (const list of [[a, b], [b, a]]) {
      const slugs = buildConcertSlugs(list);
      expect(slugs.get(a.id)).toBe("korn-pinkpop-2000-aaaaaaaaaaa");
      expect(slugs.get(b.id)).toBe("korn-pinkpop-2000-bbbbbbbbbbb");
    }
  });
});

describe("normalizeSeed on the test fixture", () => {
  const seed = normalizeSeed(seedFile);

  it("keeps every concert with unique IDs and slugs", () => {
    expect(seed.concerts).toHaveLength(seedFile.concerts.length);
    expect(new Set(seed.concerts.map((c) => c.youtubeId)).size).toBe(seed.concerts.length);
    expect(new Set(seed.concerts.map((c) => c.slug)).size).toBe(seed.concerts.length);
  });
  it("only uses the four venue kinds", () => {
    for (const c of seed.concerts) expect(VENUE_KINDS).toContain(c.venueKind);
  });
  it("stores the year played apart from the upload date", () => {
    const metro = seed.concerts.find((c) => c.youtubeId === "abDLUhw-53w")!;
    expect(metro.performedYear).toBe(1983);
    expect(metro.performedOn?.toISOString().slice(0, 10)).toBe("1983-08-12");
    expect(metro.publishedAt.getUTCFullYear()).toBe(2021);
    const limp = seed.concerts.find((c) => c.youtubeId === "o1rkPf9Nd00")!;
    expect(limp.performedYear).toBe(1997);
    expect(limp.performedOn).toBeNull();
  });
  it("creates one tour per band and tour name", () => {
    expect(seed.tours.map((t) => t.slug).sort()).toEqual(["metallica-kill-em-all-for-one", "metallica-wherever-we-may-roam"]);
    expect(seed.concerts.find((c) => c.youtubeId === "IA9xKr_Dmek")!.tourSlug).toBe("metallica-wherever-we-may-roam");
  });
  it("credits a guest", () => {
    const yankee = seed.concerts.find((c) => c.youtubeId === "nbhqDjIWLpk")!;
    expect(yankee.credits).toEqual([
      { artistSlug: "metallica", role: "MAIN", creditNote: null, position: 0 },
      { artistSlug: "dave-mustaine", role: "WITH", creditNote: "guest on Am I Evil?", position: 1 },
    ]);
  });
  it("keeps channel IDs and marks fan uploads as not official", () => {
    expect(seed.channels.find((c) => c.name === "Metallica")).toEqual({
      name: "Metallica",
      youtubeChannelId: "UCbulh9WdLtEXiooRcYK7SWw",
      isOfficial: true,
    });
    expect(seed.channels.find((c) => c.name === "some fan")!.isOfficial).toBe(false);
  });
  it("one venue per festival, empty city/country become null", () => {
    expect(seed.venues.filter((v) => v.slug === "pinkpop")).toHaveLength(1);
    expect(seed.venues.find((v) => v.slug === "pinkpop")!.city).toBe("Landgraaf");
    expect(seed.concerts.find((c) => c.youtubeId === "o1rkPf9Nd00")!.city).toBeNull();
  });
  it("keeps the artist profile", () => {
    expect(seed.artists.find((a) => a.slug === "metallica")!.profile?.similarNames).toEqual(["Megadeth", "Slayer"]);
  });
});

describe("normalizeSeed validation", () => {
  it("rejects a duplicate YouTube ID", () => {
    expect(() => normalizeSeed({ concerts: [makeConcert(), makeConcert()] })).toThrow(/appears twice/);
  });
  it("rejects a malformed YouTube ID", () => {
    expect(() => normalizeSeed({ concerts: [makeConcert({ id: "short" })] })).toThrow(/Invalid YouTube ID/);
  });
  it("rejects an impossible upload date", () => {
    expect(() => normalizeSeed({ concerts: [makeConcert({ date: "2025-02-30" })] })).toThrow(/not a real date/);
  });
  it("rejects a missing concert date", () => {
    expect(() => normalizeSeed({ concerts: [makeConcert({ performed: "" })] })).toThrow(/performed/);
  });
  it("rejects a zero duration", () => {
    expect(() => normalizeSeed({ concerts: [makeConcert({ secs: 0 })] })).toThrow(/invalid duration/);
  });
});

describe("format helpers", () => {
  it("formats durations as H:MM:SS", () => {
    expect(formatDuration(8820)).toBe("2:27:00");
    expect(formatDuration(3001)).toBe("50:01");
    expect(formatDuration(59)).toBe("0:59");
  });
  it("formats dates as DD.MM.YY", () => {
    expect(formatDate(new Date("2026-09-30T00:00:00Z"))).toBe("30.09.26");
  });
  it("writes guest credits", () => {
    expect(
      formatCredits([
        { role: "MAIN", creditNote: null, artist: { name: "Metallica" } },
        { role: "WITH", creditNote: "guest on Am I Evil?", artist: { name: "Dave Mustaine" } },
      ]),
    ).toBe("Metallica with Dave Mustaine (guest on Am I Evil?)");
  });
});
