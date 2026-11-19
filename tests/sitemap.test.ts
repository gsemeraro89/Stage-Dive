// The sitemap lists exactly the pages the pages themselves allow to be indexed (same rules as robotsFor).
import { describe, expect, it } from "vitest";
import { buildSitemap, FIXED_PAGES, type SitemapConcert } from "../src/lib/sitemap";

const day = (d: string) => new Date(`${d}T00:00:00Z`);
const concert = (over: Partial<SitemapConcert>): SitemapConcert => ({
  slug: "c",
  updatedAt: day("2026-11-01"),
  hasSetlist: false,
  curated: false,
  writeUp: null,
  performedYear: null,
  venueSlug: null,
  tourSlug: null,
  artistSlugs: [],
  genreSlugs: [],
  ...over,
});

const concerts = [
  concert({ slug: "a", hasSetlist: true, performedYear: 1991, venueSlug: "pinkpop", tourSlug: "roam", artistSlugs: ["metallica"], genreSlugs: ["metal"], updatedAt: day("2026-11-10") }),
  concert({ slug: "b", performedYear: 1993, venueSlug: "pinkpop", tourSlug: "roam", artistSlugs: ["metallica", "guest"], genreSlugs: ["metal"] }),
  concert({ slug: "c", writeUp: "x".repeat(400), performedYear: 1955, venueSlug: "cbgb", artistSlugs: ["ramones"], genreSlugs: ["punk"] }),
  concert({ slug: "d", curated: true, performedYear: 2004, artistSlugs: ["pixies"], genreSlugs: ["indie"] }),
];
const bands = [
  { slug: "metallica", updatedAt: day("2026-10-01"), bio: null },
  { slug: "ramones", updatedAt: day("2026-10-01"), bio: "Punk from Queens." },
  { slug: "pixies", updatedAt: day("2026-10-01"), bio: null },
];

describe("sitemap", () => {
  const paths = buildSitemap(concerts, bands).map((e) => e.path);
  it("always lists the index pages", () => {
    for (const p of FIXED_PAGES) expect(paths).toContain(p.path);
  });
  it("lists only strong concerts", () => {
    expect(paths.filter((p) => p.startsWith("/concerts/"))).toEqual(["/concerts/a", "/concerts/c", "/concerts/d"]);
  });
  it("lists bands with two concerts or one and a bio, never guests without a page", () => {
    expect(paths.filter((p) => p.startsWith("/artists/"))).toEqual(["/artists/metallica", "/artists/ramones"]);
  });
  it("lists venues, genres, decades and tours only from two concerts, and only real decades", () => {
    expect(paths).toContain("/venues/pinkpop");
    expect(paths).not.toContain("/venues/cbgb");
    expect(paths).toContain("/genres/metal");
    expect(paths).not.toContain("/genres/punk");
    expect(paths).toContain("/tours/roam");
    expect(paths).toContain("/decades/1990s");
    expect(paths).not.toContain("/decades/1950s");
    expect(paths).not.toContain("/decades/2000s");
  });
  it("dates a hub by its newest concert change, a band by the later of its own and its concerts'", () => {
    const entries = buildSitemap(concerts, bands);
    expect(entries.find((e) => e.path === "/venues/pinkpop")!.lastModified).toEqual(day("2026-11-10"));
    expect(entries.find((e) => e.path === "/artists/metallica")!.lastModified).toEqual(day("2026-11-10"));
  });
});
