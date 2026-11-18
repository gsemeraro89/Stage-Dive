import { describe, expect, it } from "vitest";
import { computeArtistStats, groupByYear } from "../src/lib/artist-stats";
import { buildOrderBy, buildWhere, filtersToQuery, hasActiveFilters, parseFilters, parseSiteSources } from "../src/lib/filters";
import { dayNumber, pickForDay } from "../src/lib/rotation";
import { compactNumber } from "../src/lib/site";
import { bestKnownSize, findBestThumbnail, thumbnailSources } from "../src/lib/thumbnails";
import { buildQueue, relatedByGenre, type QueueCandidate } from "../src/lib/upnext";

describe("parseFilters", () => {
  it("defaults to newest with no filters", () => {
    const f = parseFilters({});
    expect(f).toEqual({ q: null, genre: null, artist: null, venue: null, setting: null, sort: "newest" });
    expect(hasActiveFilters(f)).toBe(false);
  });
  it("reads valid values", () => {
    const f = parseFilters({ q: "  nto   cercle ", genre: "melodic-techno", sort: "longest", setting: "Festival" });
    expect(f.q).toBe("nto cercle");
    expect(f.genre).toBe("melodic-techno");
    expect(f.setting).toBe("festival");
    expect(f.sort).toBe("longest");
    expect(hasActiveFilters(f)).toBe(true);
  });
  it("ignores malformed values instead of failing", () => {
    const f = parseFilters({ genre: "../etc", artist: "a b", sort: "random", venue: ["sonar-lisboa", "x"], q: "" });
    expect(f.genre).toBeNull();
    expect(f.artist).toBeNull();
    expect(f.sort).toBe("newest");
    expect(f.venue).toBe("sonar-lisboa");
    expect(f.q).toBeNull();
  });
  it("cuts very long searches", () => {
    expect(parseFilters({ q: "x".repeat(500) }).q).toHaveLength(80);
  });
});

describe("buildWhere / buildOrderBy", () => {
  it("always limits to published, public, embeddable sets", () => {
    expect(buildWhere(parseFilters({}))).toMatchObject({ status: "PUBLISHED", embeddable: true, privacyStatus: "public" });
  });
  it("adds one condition per filter and per search word", () => {
    const where = buildWhere(parseFilters({ genre: "techno", artist: "nto", q: "paris live" }));
    expect(where.AND).toHaveLength(4);
  });
  it("sorts the four ways", () => {
    expect(buildOrderBy("newest")[0]).toEqual({ publishedAt: "desc" });
    expect(buildOrderBy("most-viewed")[0]).toEqual({ viewCount: "desc" });
    expect(buildOrderBy("longest")[0]).toEqual({ durationSeconds: "desc" });
    expect(buildOrderBy("shortest")[0]).toEqual({ durationSeconds: "asc" });
  });
  it("writes filters back as a query string without defaults", () => {
    expect(filtersToQuery(parseFilters({}))).toBe("");
    expect(filtersToQuery(parseFilters({ genre: "techno", sort: "longest" }))).toBe("?genre=techno&sort=longest");
  });
});

function candidate(id: number, artistIds: number[], genreIds: number[], date: string, viewCount: number): QueueCandidate {
  return { id, artistIds, genreIds, publishedAt: new Date(date), viewCount };
}

describe("buildQueue (up next)", () => {
  const current = candidate(1, [10], [100, 101], "2024-01-01", 1000);
  const sameArtistOld = candidate(2, [10], [100], "2019-01-01", 9_000_000);
  const sameArtistNew = candidate(3, [10, 11], [], "2026-01-01", 5);
  const twoSharedGenres = candidate(4, [20], [100, 101], "2020-01-01", 10);
  const oneSharedGenreBig = candidate(5, [21], [101], "2020-01-01", 5_000_000);
  const oneSharedGenreSmall = candidate(6, [22], [100], "2020-01-01", 50);
  const unrelated = candidate(7, [23], [999], "2025-01-01", 99_000_000);
  const all = [unrelated, oneSharedGenreSmall, oneSharedGenreBig, twoSharedGenres, sameArtistOld, sameArtistNew, current];

  it("plays the same artist first (newest first), then shared genres, and never the current set", () => {
    expect(buildQueue(current, all).map((s) => s.id)).toEqual([3, 2, 4, 5, 6]);
  });
  it("leaves out sets with nothing in common", () => {
    expect(buildQueue(current, all).some((s) => s.id === 7)).toBe(false);
  });
  it("respects the limit", () => {
    expect(buildQueue(current, all, 2).map((s) => s.id)).toEqual([3, 2]);
  });
  it("does not depend on input order", () => {
    expect(buildQueue(current, [...all].reverse()).map((s) => s.id)).toEqual([3, 2, 4, 5, 6]);
  });
  it("relatedByGenre skips the same artist", () => {
    expect(relatedByGenre(current, all, 2).map((s) => s.id)).toEqual([4, 5]);
  });
});

describe("artist stats", () => {
  const sets = [
    { durationSeconds: 5140, viewCount: 4_413_755, publishedAt: new Date("2017-09-26"), country: "France" },
    { durationSeconds: 7416, viewCount: 66_693, publishedAt: new Date("2026-09-30"), country: "Belgium" },
    { durationSeconds: 3001, viewCount: 445_740, publishedAt: new Date("2021-08-26"), country: "France" },
    { durationSeconds: 2442, viewCount: 418_110, publishedAt: new Date("2024-06-14"), country: null },
  ];
  it("adds up sets, hours, views, years and countries", () => {
    expect(computeArtistStats(sets)).toMatchObject({
      sets: 4,
      totalSeconds: 17999,
      hours: 5,
      totalViews: 5_344_298,
      firstYear: 2017,
      lastYear: 2026,
      yearsOnYouTube: 10,
      countries: 2,
    });
  });
  it("handles an artist with no sets", () => {
    expect(computeArtistStats([])).toMatchObject({ sets: 0, hours: 0, yearsOnYouTube: 0, firstYear: null });
  });
  it("groups by year, newest first", () => {
    expect(groupByYear(sets).map((g) => [g.year, g.sets.length])).toEqual([[2026, 1], [2024, 1], [2021, 1], [2017, 1]]);
  });
});

describe("thumbnails", () => {
  it("offers every size up to the best one known", () => {
    const t = thumbnailSources("LL0b2ZKEJoY", "https://i.ytimg.com/vi/LL0b2ZKEJoY/maxresdefault.jpg");
    expect(t.src).toContain("maxresdefault");
    expect(t.width).toBe(1280);
    expect(t.srcSet.split(", ")).toHaveLength(3);
  });
  it("falls back to hqdefault, which always exists, when nothing is stored", () => {
    expect(bestKnownSize(null)).toBe("hqdefault");
    expect(thumbnailSources("LL0b2ZKEJoY", null).srcSet).toBe("https://i.ytimg.com/vi/LL0b2ZKEJoY/hqdefault.jpg 480w");
  });
  it("picks the largest size the image server has", async () => {
    const server = (ok: string[]) =>
      (async (url: RequestInfo | URL) =>
        new Response(null, { status: ok.some((n) => String(url).includes(n)) ? 200 : 404 })) as typeof fetch;
    expect(await findBestThumbnail("x", server(["maxresdefault", "sddefault"]))).toBe("maxresdefault");
    expect(await findBestThumbnail("x", server(["sddefault"]))).toBe("sddefault");
    expect(await findBestThumbnail("x", server([]))).toBe("hqdefault");
  });
  it("stores nothing when the answer is unknown", async () => {
    const down = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const blocked = (async () => new Response(null, { status: 403 })) as typeof fetch;
    expect(await findBestThumbnail("x", down)).toBeNull();
    expect(await findBestThumbnail("x", blocked)).toBeNull();
  });
});

describe("compactNumber", () => {
  it("shortens big numbers", () => {
    expect(compactNumber(4_413_755)).toBe("4.4M");
    expect(compactNumber(14_340_113)).toBe("14M");
    expect(compactNumber(66_693)).toBe("67K");
    expect(compactNumber(950)).toBe("950");
  });
});

describe("daily rotation", () => {
  const artists = ["a", "b", "c"];
  it("keeps the same pick all day and moves on at midnight UTC", () => {
    const morning = pickForDay(artists, new Date("2026-11-12T00:00:01Z"));
    expect(pickForDay(artists, new Date("2026-11-12T23:59:59Z"))).toBe(morning);
    expect(pickForDay(artists, new Date("2026-11-13T00:00:01Z"))).not.toBe(morning);
  });
  it("gives every item a turn before repeating", () => {
    const week = [0, 1, 2, 3, 4, 5].map((d) => pickForDay(artists, new Date(Date.UTC(2026, 10, 12 + d))));
    expect(new Set(week.slice(0, 3)).size).toBe(3);
    expect(week.slice(3)).toEqual(week.slice(0, 3));
  });
  it("handles an empty list", () => {
    expect(pickForDay([], new Date())).toBeNull();
    expect(dayNumber(new Date("1970-01-02T00:00:00Z"))).toBe(1);
  });
});

describe("parseSiteSources", () => {
  it("reads the list of set sources a site shows", () => {
    expect(parseSiteSources("SEED")).toEqual(["SEED"]);
    expect(parseSiteSources(" seed , collector,SEED")).toEqual(["SEED", "COLLECTOR"]);
  });
  it("shows everything when unset, empty or unreadable", () => {
    expect(parseSiteSources(undefined)).toBeNull();
    expect(parseSiteSources("")).toBeNull();
    expect(parseSiteSources("nonsense")).toBeNull();
  });
});
