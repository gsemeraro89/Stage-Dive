import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeSetting } from "../src/lib/catalogue";
import { formatCredits, formatDate, formatDuration } from "../src/lib/format";
import {
  buildSetSlugs,
  normalizeSeed,
  parseCollaborator,
  splitGenres,
  type SeedFile,
  type SeedSet,
} from "../src/lib/seed/normalize";
import { slugify } from "../src/lib/slug";

const seedFile = JSON.parse(readFileSync("data/seed-sets.json", "utf8")) as SeedFile;

function makeSet(overrides: Partial<SeedSet> = {}): SeedSet {
  return {
    id: "AAAAAAAAAAA",
    artist: "Test Artist",
    title: "Test Artist live",
    channel: "Test Channel",
    secs: 3600,
    views: 500000,
    date: "2025-01-01",
    genres: ["Techno"],
    venue: "Test Venue",
    city: "Barcelona",
    country: "Spain",
    setting: "Club",
    about: "A set.",
    youtube_url: "https://www.youtube.com/watch?v=AAAAAAAAAAA",
    checked_embeddable_on: "2026-11-11",
    ...overrides,
  };
}

describe("slugify", () => {
  it("strips accents, apostrophes and symbols", () => {
    expect(slugify("Sónar Lisboa")).toBe("sonar-lisboa");
    expect(slugify("N'to")).toBe("nto");
    expect(slugify("HÖR x Sennheiser Livingroom")).toBe("hor-x-sennheiser-livingroom");
    expect(slugify("Drum & Bass")).toBe("drum-and-bass");
    expect(slugify("  --Hello--  ")).toBe("hello");
  });
});

describe("normalizeSetting", () => {
  it("maps the old seed labels onto the five approved settings", () => {
    expect(normalizeSetting("Cercle / Special location")).toBe("Special location");
    expect(normalizeSetting("Studio / Bedroom")).toBe("Studio-Session");
    expect(normalizeSetting("Studio / Session")).toBe("Studio-Session");
    expect(normalizeSetting("festival")).toBe("Festival");
    expect(normalizeSetting(" Livestream ")).toBe("Livestream");
  });
  it("rejects labels it does not know", () => {
    expect(() => normalizeSetting("Rooftop")).toThrow(/Unknown setting/);
  });
});

describe("parseCollaborator", () => {
  it("splits an alias note in brackets", () => {
    expect(parseCollaborator("Joachim Pastor (as Sinners)")).toEqual({ name: "Joachim Pastor", note: "as Sinners" });
    expect(parseCollaborator("Sofiane Pamart")).toEqual({ name: "Sofiane Pamart", note: null });
  });
});

describe("splitGenres", () => {
  it("drops genres the owner took off the list", () => {
    expect(splitGenres(["Techno", "Psytrance"], "x").genres).toEqual(["Techno"]);
    expect(splitGenres(["House", "Disco"], "x").genres).toEqual([]);
  });
  it("treats Live Act as an attribute, not a genre", () => {
    expect(splitGenres(["Melodic Techno", "Live Act"], "x")).toEqual({ genres: ["Melodic Techno"], liveAct: true });
  });
  it("drops duplicates and rejects unknown genres", () => {
    expect(splitGenres(["Techno", "Techno"], "x").genres).toEqual(["Techno"]);
    expect(() => splitGenres(["Dubstep"], "x")).toThrow(/unknown genre/);
  });
});

describe("buildSetSlugs", () => {
  it("builds artist-venue-year slugs", () => {
    const slugs = buildSetSlugs([{ id: "2is2o6_Hxe0", artist: "NTO", venue: "Spectra Festival", date: "2026-09-30" }]);
    expect(slugs.get("2is2o6_Hxe0")).toBe("nto-spectra-festival-2026");
  });
  it("adds the YouTube ID to every set in a clash, whatever the order", () => {
    const a = { id: "AAAAAAAAAAA", artist: "X", venue: "Y", date: "2020-01-01" };
    const b = { id: "BBBBBBBBBBB", artist: "X", venue: "Y", date: "2020-06-01" };
    const forward = buildSetSlugs([a, b]);
    const backward = buildSetSlugs([b, a]);
    expect(forward.get(a.id)).toBe("x-y-2020-aaaaaaaaaaa");
    expect(forward.get(b.id)).toBe("x-y-2020-bbbbbbbbbbb");
    expect(backward).toEqual(forward);
  });
});

describe("normalizeSeed on data/seed-sets.json", () => {
  const seed = normalizeSeed(seedFile);

  it("keeps all 23 sets with unique IDs and slugs", () => {
    expect(seed.sets).toHaveLength(23);
    expect(new Set(seed.sets.map((s) => s.youtubeId)).size).toBe(23);
    expect(new Set(seed.sets.map((s) => s.slug)).size).toBe(23);
  });

  it("only uses the five approved settings", () => {
    const used = new Set(seed.sets.map((s) => s.setting));
    expect([...used].every((s) => ["Festival", "Club", "Special location", "Studio-Session", "Livestream"].includes(s))).toBe(true);
  });

  it("credits collaborations", () => {
    const sinners = seed.sets.find((s) => s.youtubeId === "b_fKzTdMViQ")!;
    expect(sinners.credits).toEqual([
      { artistSlug: "nto", role: "MAIN", creditNote: null, position: 0 },
      { artistSlug: "joachim-pastor", role: "WITH", creditNote: "as Sinners", position: 1 },
    ]);
    expect(seed.artists.find((a) => a.slug === "sofiane-pamart")).toBeTruthy();
  });

  it("keeps the NTO profile", () => {
    const nto = seed.artists.find((a) => a.slug === "nto")!;
    expect(nto.profile?.label).toBe("Hungry Music");
    expect(nto.profile?.similarNames).toEqual(["The Blaze", "Marsh", "Paul Kalkbrenner"]);
  });

  it("marks the three fan-upload channels as not official", () => {
    const fan = seed.channels.filter((c) => !c.isOfficial).map((c) => c.name).sort();
    expect(fan).toEqual(["WAiT_A_DrEAm", "anton", "paardenmiddel"]);
    expect(seed.channels.find((c) => c.name === "Cercle")?.isOfficial).toBe(true);
  });

  it("turns empty city/country into null", () => {
    const pamart = seed.sets.find((s) => s.youtubeId === "0QnMv0bRyk0")!;
    expect(pamart.city).toBeNull();
    expect(pamart.country).toBeNull();
  });
});

describe("normalizeSeed validation", () => {
  it("rejects a duplicate YouTube ID", () => {
    expect(() => normalizeSeed({ sets: [makeSet(), makeSet()], artists: {} })).toThrow(/appears twice/);
  });
  it("rejects a malformed YouTube ID", () => {
    expect(() => normalizeSeed({ sets: [makeSet({ id: "short" })], artists: {} })).toThrow(/Invalid YouTube ID/);
  });
  it("rejects an impossible date", () => {
    expect(() => normalizeSeed({ sets: [makeSet({ date: "2025-02-30" })], artists: {} })).toThrow(/not a real date/);
  });
  it("rejects a zero duration", () => {
    expect(() => normalizeSeed({ sets: [makeSet({ secs: 0 })], artists: {} })).toThrow(/invalid duration/);
  });
});

describe("format helpers", () => {
  it("formats durations as H:MM:SS", () => {
    expect(formatDuration(7416)).toBe("2:03:36");
    expect(formatDuration(3001)).toBe("50:01");
    expect(formatDuration(59)).toBe("0:59");
  });
  it("formats dates as DD.MM.YY", () => {
    expect(formatDate(new Date("2026-09-30T00:00:00Z"))).toBe("30.09.26");
  });
  it("writes collaboration credits", () => {
    expect(
      formatCredits([
        { role: "MAIN", creditNote: null, artist: { name: "NTO" } },
        { role: "WITH", creditNote: "as Sinners", artist: { name: "Joachim Pastor" } },
      ]),
    ).toBe("NTO with Joachim Pastor (as Sinners)");
  });
});
