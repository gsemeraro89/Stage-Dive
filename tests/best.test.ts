// "Best of" rankings: which lists exist, strong-page rule (shared with the sitemap), titles, lead,
// structured data, Markdown copy, llms files and the copy rules.
import { afterEach, describe, expect, it } from "vitest";
import {
  ALL_SLUG,
  BEST_SIZE,
  bestHeading,
  bestIsStrong,
  bestLead,
  bestLists,
  bestQuestions,
  bestSearchTitle,
  bestSlugsFor,
  rankedName,
  shownIn,
} from "../src/lib/best";
import { bestMarkdown, llmsFullTxt, llmsTxt } from "../src/lib/llms";
import { robotsFor } from "../src/lib/seo";
import { buildSitemap, type SitemapConcert } from "../src/lib/sitemap";
import { itemList } from "../src/lib/structured-data";
import { BANNED, concertView, youtubeOnlyWithViews } from "./fixtures/concert-view";

process.env.SITE_URL = "https://stagedive.example";
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

const lists = bestLists({
  total: 165,
  decades: [
    { label: "1950s", count: 1 },
    { label: "1990s", count: 20 },
    { label: "2020s", count: 3 },
  ],
  genres: [
    { slug: "metal", name: "metal", count: 47 },
    { slug: "new-wave-synth", name: "new wave / synth", count: 9 },
    { slug: "stoner", name: "stoner", count: 0 },
  ],
  venueKinds: [
    { slug: "festival", count: 91 },
    { slug: "room", count: 57 },
    { slug: "livestream", count: 11 },
  ],
});
const bySlug = (slug: string) => lists.find((l) => l.slug === slug)!;

describe("best of: which rankings exist", () => {
  it("makes one overall, one per real decade, one per genre with concerts and one per festival or room", () => {
    expect(lists.map((l) => l.slug)).toEqual([
      "most-watched-rock-concerts",
      "most-watched-rock-concerts-1990s",
      "most-watched-rock-concerts-2020s",
      "best-live-metal-concerts",
      "best-live-new-wave-synth-concerts",
      "best-festival-rock-concerts",
      "best-rock-concerts-in-clubs-and-arenas",
    ]);
  });
  it("shows at most 50 and is strong from ten", () => {
    expect(shownIn(bySlug(ALL_SLUG))).toBe(BEST_SIZE);
    expect(bestIsStrong(bySlug("most-watched-rock-concerts-1990s"))).toBe(true);
    expect(bestIsStrong(bySlug("most-watched-rock-concerts-2020s"))).toBe(false);
    expect(bestIsStrong(bySlug("best-live-new-wave-synth-concerts"))).toBe(false);
    process.env.SITE_INDEXABLE = "true";
    expect(robotsFor(bestIsStrong(bySlug("most-watched-rock-concerts-2020s")))).toEqual({ index: false, follow: true });
  });
  it("tells which rankings a concert counts towards", () => {
    expect(bestSlugsFor({ performedYear: 1995, genreSlugs: ["metal"], venueKindSlug: "festival" })).toEqual([
      "most-watched-rock-concerts",
      "most-watched-rock-concerts-1990s",
      "best-live-metal-concerts",
      "best-festival-rock-concerts",
    ]);
    expect(bestSlugsFor({ performedYear: 1955, genreSlugs: [], venueKindSlug: "livestream" })).toEqual(["most-watched-rock-concerts"]);
  });
});

describe("best of: titles and lead", () => {
  it("writes titles the way people search, with the real number shown", () => {
    expect(bestSearchTitle(bySlug(ALL_SLUG))).toBe("Most Watched Rock Concerts · Top 50 Full Shows");
    expect(bestSearchTitle(bySlug("most-watched-rock-concerts-1990s"))).toBe("Most Watched Rock Concerts of the 1990s · Top 20 Full Shows");
    expect(bestSearchTitle(bySlug("best-live-metal-concerts"))).toBe("Best Live Metal Concerts · Top 47 Full Shows");
    expect(bestHeading(bySlug("best-live-new-wave-synth-concerts"))).toBe("Best Live New Wave / Synth Concerts");
    expect(bestHeading(bySlug("best-festival-rock-concerts"))).toBe("Best Festival Rock Concerts");
  });
  const ranked = [
    concertView({ id: 1, credits: "Metallica", viewCount: 9_000_000 }),
    concertView({ id: 2, credits: "Pixies", artists: [{ slug: "pixies", name: "Pixies", role: "MAIN", creditNote: null, hasPage: true }], venue: null, city: null, performedYear: 2004, viewCount: 12_000 }),
  ];
  it("leads with the count and the first and last concert, views next to YouTube", () => {
    expect(bestLead(bySlug("most-watched-rock-concerts-1990s"), ranked)).toBe(
      "The 2 most watched full rock concerts of the 1990s on STAGEDIVE, from Metallica at L.C. Walker Arena 1991 (9,000,000 views on YouTube) to Pixies in 2004 (12,000 views on YouTube). Ranked by views on YouTube and updated every night. Every concert plays in full on its own page.",
    );
    expect(rankedName(concertView({ venue: null, city: null, performedYear: null }))).toBe("Metallica");
  });
  it("asks only what the ranking answers", () => {
    const q = bestQuestions(bySlug(ALL_SLUG), [...ranked, concertView({ id: 3, viewCount: 10 })]);
    expect(q.map((x) => x.question)).toEqual(["What is the most watched of the full rock concerts here?", "Which band has the most concerts in this ranking?"]);
    expect(q[1].answer).toBe("Metallica, with 2 concerts in the top 3.");
  });
  it("marks the ranking's order in structured data", () => {
    const ld = itemList("Best", [{ path: "/concerts/a", name: "A" }], true) as Record<string, unknown>;
    expect(ld.itemListOrder).toBe("https://schema.org/ItemListOrderDescending");
    expect((ld.itemListElement as Record<string, unknown>[])[0].position).toBe(1);
  });
});

describe("best of: sitemap and AI assistants", () => {
  const c = (i: number, over: Partial<SitemapConcert> = {}): SitemapConcert => ({
    slug: `c${i}`,
    updatedAt: new Date(`2026-11-${String(1 + (i % 9)).padStart(2, "0")}T00:00:00Z`),
    hasSetlist: false,
    curated: false,
    writeUp: null,
    performedYear: 1995,
    venueSlug: null,
    venueKindSlug: "festival",
    tourSlug: null,
    artistSlugs: [],
    genreSlugs: i < 3 ? ["metal"] : [],
    ...over,
  });
  it("lists rankings from ten concerts and the index when one exists", () => {
    const paths = buildSitemap(Array.from({ length: 12 }, (_, i) => c(i)), []).map((e) => e.path);
    expect(paths).toContain("/best");
    expect(paths).toContain("/best/most-watched-rock-concerts");
    expect(paths).toContain("/best/most-watched-rock-concerts-1990s");
    expect(paths).toContain("/best/best-festival-rock-concerts");
    expect(paths).not.toContain("/best/best-live-metal-concerts");
    expect(buildSitemap([c(1)], []).map((e) => e.path)).not.toContain("/best");
  });
  it("gives a Markdown copy and llms entries that follow the copy rules", () => {
    const list = bySlug("most-watched-rock-concerts-1990s");
    const md = bestMarkdown(list, [concertView()]);
    expect(md.startsWith("# Most Watched Rock Concerts of the 1990s\n\nThe most watched of the full rock concerts of the 1990s on STAGEDIVE: Metallica at L.C. Walker Arena 1991")).toBe(true);
    expect(md).toContain("1. [Metallica at L.C. Walker Arena 1991](https://stagedive.example/concerts/metallica-l-c-walker-arena-1991): 2,400,000 views on YouTube, 2:22:00, setlist");
    const data = { bands: [], venues: [], genres: [], decades: [], tours: [], best: [{ slug: list.slug, title: bestHeading(list), count: 20 }, { slug: "x", title: "Thin", count: 3 }] };
    const full = llmsFullTxt({ ...data, mostWatched: [], latest: [] });
    expect(full).toContain("## Rankings by views on YouTube (1)\n\n- [Most Watched Rock Concerts of the 1990s](https://stagedive.example/best/most-watched-rock-concerts-1990s): top 20");
    expect(full).not.toContain("Thin");
    const txt = llmsTxt(data);
    expect(txt).toContain("- [Most watched](https://stagedive.example/best)");
    for (const t of [md, full, txt]) {
      expect(t).not.toMatch(BANNED);
      expect(youtubeOnlyWithViews(t)).toBe(true);
    }
  });
});
