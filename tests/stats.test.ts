// "STAGEDIVE in numbers" (/stats): the lead, the facts, the rankings' shape, structured data, the
// Markdown copy, the llms files, the sitemap rule and the copy rules.
import { afterEach, describe, expect, it } from "vitest";
import { llmsFullTxt, llmsTxt, statsMarkdown } from "../src/lib/llms";
import { robotsFor } from "../src/lib/seo";
import { buildSitemap, type SitemapConcert } from "../src/lib/sitemap";
import {
  concertName,
  countCountries,
  hoursOf,
  lengthWords,
  mostCoveredDecade,
  rankingItems,
  RANKINGS,
  STATS_PATH,
  STATS_TITLE,
  statsFacts,
  statsIsStrong,
  statsLead,
  statsQuestions,
  topCounts,
  topSongsPerBand,
  type SiteStats,
} from "../src/lib/stats";
import { statsJsonLd } from "../src/lib/structured-data";
import { BANNED, concertView, youtubeOnlyWithViews } from "./fixtures/concert-view";

process.env.SITE_URL = "https://stagedive.example";
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

const metallica = concertView();
const coldplay = concertView({
  id: 2,
  slug: "coldplay-amman-citadel-2019",
  credits: "Coldplay",
  artists: [{ slug: "coldplay", name: "Coldplay", role: "MAIN", creditNote: null, hasPage: true }],
  venue: { slug: "amman-citadel", name: "Amman Citadel" },
  performedYear: 2019,
  viewCount: 28_750_187,
  durationSeconds: 3 * 3600 + 33 * 60 + 5,
});

const stats = (over: Partial<SiteStats> = {}): SiteStats => ({
  totals: {
    concerts: 2213,
    official: 1712,
    bootlegs: 501,
    bands: 1298,
    places: 589,
    festivals: 249,
    withSetlist: 1930,
    timedSongs: 28123,
    songs: 20282,
    seconds: 9_733_119,
    firstYear: 1968,
    lastYear: 2026,
    decades: 7,
    countries: 41,
  },
  mostWatched: [coldplay, metallica],
  decades: [
    { label: "1990s", concerts: 78, top: metallica },
    { label: "2010s", concerts: 650, top: coldplay },
    { label: "2020s", concerts: 650, top: null },
  ],
  bands: [
    { slug: "radiohead", name: "Radiohead", concerts: 23 },
    { slug: "metallica", name: "Metallica", concerts: 18 },
  ],
  places: [{ slug: "pinkpop", name: "Pinkpop", concerts: 240 }],
  longest: [coldplay],
  songs: [{ band: { slug: "metallica", name: "Metallica" }, slug: "for-whom-the-bell-tolls", title: "For Whom the Bell Tolls", versions: 52 }],
  updatedAt: new Date("2026-11-23T03:10:00Z"),
  ...over,
});

const empty = stats({
  totals: { ...stats().totals, concerts: 0, official: 0, bootlegs: 0, bands: 0, places: 0, withSetlist: 0, timedSongs: 0, songs: 0, seconds: 0, firstYear: null, lastYear: null, decades: 0, countries: 0 },
  mostWatched: [],
  decades: [],
  bands: [],
  places: [],
  longest: [],
  songs: [],
});

describe("stats: pure helpers", () => {
  it("counts countries once, whatever the spelling, the four UK nations as one", () => {
    expect(countCountries(["NL", "Netherlands", "Holland", "England", "Scotland", "United Kingdom", "UK", null, "", "US", "USA"])).toBe(3);
  });
  it("ranks by count, then A-Z, top 10", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ slug: `b${i}`, name: `Band ${String.fromCharCode(76 - i)}`, concerts: i < 3 ? 5 : 2 }));
    const top = topCounts(rows);
    expect(top).toHaveLength(10);
    expect(top.slice(0, 3).map((r) => r.concerts)).toEqual([5, 5, 5]);
    expect(top[0].name).toBe("Band J");
    expect(top[3].name).toBe("Band A");
  });
  it("keeps one song per band, from two live versions, most played first", () => {
    const songs = topSongsPerBand([
      { slug: "metallica", name: "Metallica", songs: [{ slug: "one", title: "One", versions: 40 }, { slug: "fwtbt", title: "For Whom the Bell Tolls", versions: 52 }] },
      { slug: "pixies", name: "Pixies", songs: [{ slug: "debaser", title: "Debaser", versions: 1 }] },
      { slug: "radiohead", name: "Radiohead", songs: [{ slug: "pa", title: "Paranoid Android", versions: 33 }] },
    ]);
    expect(songs.map((x) => [x.band.name, x.title, x.versions])).toEqual([
      ["Metallica", "For Whom the Bell Tolls", 52],
      ["Radiohead", "Paranoid Android", 33],
    ]);
  });
  it("picks the most covered decade (the earlier on a tie)", () => {
    expect(mostCoveredDecade(stats().decades)?.label).toBe("2010s");
    expect(mostCoveredDecade([])).toBeNull();
  });
  it("writes lengths and hours in words", () => {
    expect(lengthWords(3 * 3600 + 33 * 60 + 5)).toBe("3 hours 33 minutes");
    expect(lengthWords(3600)).toBe("1 hour");
    expect(hoursOf(9_733_119)).toBe(2703);
  });
  it("names a ranked concert by its headline band only", () => {
    const guests = concertView({
      credits: "Bródy János with Kiss Tibi & Presser Gábor",
      artists: [
        { slug: "brody-janos", name: "Bródy János", role: "MAIN", creditNote: null, hasPage: true },
        { slug: "kiss-tibi", name: "Kiss Tibi", role: "WITH", creditNote: null, hasPage: false },
      ],
      venue: { slug: "sziget-festival", name: "Sziget Festival" },
      performedYear: 2026,
    });
    expect(concertName(guests)).toBe("Bródy János at Sziget Festival 2026");
  });
});

describe("stats: lead and facts", () => {
  it("answers first, with thousands separators", () => {
    expect(statsLead(stats())).toBe(
      "STAGEDIVE holds 2,213 full rock concerts (1,712 official, 501 bootlegs) by 1,298 bands, from 589 festivals and venues in 41 countries, played between 1968 and 2026: " +
        "about 2,703 hours of music, 1,930 with a setlist. The most watched is Coldplay at Amman Citadel 2019, with 28,750,187 views on YouTube.",
    );
  });
  it("says nothing it does not hold", () => {
    expect(statsLead(empty)).toBe("No full rock concerts are on STAGEDIVE right now.");
    expect(statsFacts(empty)).toEqual([statsLead(empty)]);
    expect(statsQuestions(empty)).toEqual([]);
    const noYears = statsLead(stats({ totals: { ...stats().totals, firstYear: null, lastYear: null, bootlegs: 0 } }));
    expect(noYears).not.toContain("played between");
    expect(noYears).not.toContain("bootleg");
  });
  it("gives every headline fact as a sentence that stands on its own", () => {
    const facts = statsFacts(stats());
    expect(facts[0]).toBe(statsLead(stats()));
    expect(facts).toContain("The band with the most official concerts is Radiohead, with 23.");
    expect(facts).toContain("The festival or venue with the most official concerts is Pinkpop, with 240.");
    expect(facts).toContain("The most covered decade is the 2010s, with 650 official concerts.");
    expect(facts).toContain("The longest official concert is Coldplay at Amman Citadel 2019, at 3 hours 33 minutes.");
    expect(facts).toContain("The most played song live of any band is “For Whom the Bell Tolls” by Metallica, in 52 setlists.");
    expect(facts[1]).toContain("1,930 of them (87%) come with a setlist, with 28,123 songs timed");
  });
  it("has a title written the way people search", () => {
    expect(STATS_TITLE).toBe("STAGEDIVE in Numbers · Most Watched Rock Concerts, Bands and Festivals");
  });
  it("follows the copy rules", () => {
    for (const t of [STATS_TITLE, ...statsFacts(stats()), ...statsQuestions(stats()).flatMap((q) => [q.question, q.answer])]) {
      expect(t).not.toMatch(BANNED);
      expect(youtubeOnlyWithViews(t)).toBe(true);
    }
  });
});

describe("stats: rankings", () => {
  it("lists every ranking with links to our pages, empty ones left out", () => {
    const items = rankingItems(stats());
    expect(items.map(([name]) => name)).toEqual([RANKINGS.mostWatched, RANKINGS.decades, RANKINGS.bands, RANKINGS.places, RANKINGS.longest, RANKINGS.songs]);
    const byName = new Map(items);
    expect(byName.get(RANKINGS.mostWatched)).toEqual([
      { path: "/concerts/coldplay-amman-citadel-2019", name: "Coldplay at Amman Citadel 2019" },
      { path: "/concerts/metallica-l-c-walker-arena-1991", name: "Metallica at L.C. Walker Arena 1991" },
    ]);
    // A decade without an official concert to show is skipped in the list of concerts.
    expect(byName.get(RANKINGS.decades)).toHaveLength(2);
    expect(byName.get(RANKINGS.bands)?.[0]).toEqual({ path: "/artists/radiohead", name: "Radiohead" });
    expect(byName.get(RANKINGS.places)?.[0]).toEqual({ path: "/venues/pinkpop", name: "Pinkpop" });
    expect(byName.get(RANKINGS.songs)?.[0]).toEqual({ path: "/songs/metallica/for-whom-the-bell-tolls", name: "For Whom the Bell Tolls by Metallica" });
    expect(rankingItems(empty)).toEqual([]);
  });
});

describe("stats: structured data", () => {
  const [dataset, ...lists] = statsJsonLd(stats());
  it("is a Dataset with its creator, date, method and Markdown copy, and no licence", () => {
    expect(dataset["@type"]).toBe("Dataset");
    expect(dataset.name).toBe("STAGEDIVE in Numbers");
    expect(dataset.url).toBe("https://stagedive.example/stats");
    expect(dataset.dateModified).toBe("2026-11-23");
    expect(dataset.temporalCoverage).toBe("1968/2026");
    expect(dataset.creator).toMatchObject({ "@type": "Organization", name: "STAGEDIVE", url: "https://stagedive.example/" });
    expect(dataset.distribution).toEqual({ "@type": "DataDownload", encodingFormat: "text/markdown", contentUrl: "https://stagedive.example/stats.md" });
    expect(String(dataset.description)).toContain("2,213 full rock concerts");
    expect(dataset).not.toHaveProperty("license");
  });
  it("has one ItemList per ranking, ranked except the decades", () => {
    expect(lists.map((l) => l.name)).toEqual(rankingItems(stats()).map(([name]) => name));
    expect(lists.every((l) => l["@type"] === "ItemList")).toBe(true);
    expect(lists.find((l) => l.name === RANKINGS.mostWatched)?.itemListOrder).toBe("https://schema.org/ItemListOrderDescending");
    expect(lists.find((l) => l.name === RANKINGS.decades)).not.toHaveProperty("itemListOrder");
  });
  it("follows the copy rules", () => {
    const json = JSON.stringify(statsJsonLd(stats()));
    expect(json).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(json)).toBe(true);
  });
});

describe("stats: Markdown copy and llms files", () => {
  const md = statsMarkdown(stats());
  it("gives the figures, every ranking with links, the method and questions", () => {
    expect(md.startsWith("# STAGEDIVE in Numbers\n\nLast updated 2026-11-23. Source: https://stagedive.example/stats.")).toBe(true);
    expect(md).toContain("- STAGEDIVE holds 2,213 full rock concerts");
    expect(md).toContain("1. [Coldplay at Amman Citadel 2019](https://stagedive.example/concerts/coldplay-amman-citadel-2019): 28,750,187 views on YouTube");
    expect(md).toContain("- [The 2010s](https://stagedive.example/decades/2010s): 650 official concerts (the most covered decade); most watched: [Coldplay at Amman Citadel 2019]");
    expect(md).toContain("1. [Radiohead](https://stagedive.example/artists/radiohead): 23 official concerts");
    expect(md).toContain("1. [Pinkpop](https://stagedive.example/venues/pinkpop): 240 official concerts");
    expect(md).toContain("1. [For Whom the Bell Tolls by Metallica](https://stagedive.example/songs/metallica/for-whom-the-bell-tolls): in 52 setlists");
    expect(md).toContain("## How these numbers are made");
    expect(md).toContain("### Which band has the most full concerts on STAGEDIVE?\n\nRadiohead, with 23 official concerts.");
    expect(md).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(md)).toBe(true);
  });
  const data = { bands: [], venues: [], genres: [], decades: [], tours: [] };
  it("is listed in llms.txt and llms-full.txt from ten official concerts", () => {
    expect(llmsTxt({ ...data, stats: 10 })).toContain("- [STAGEDIVE in Numbers](https://stagedive.example/stats): figures to quote with a source");
    expect(llmsFullTxt({ ...data, stats: 10, mostWatched: [], latest: [] })).toContain("## In numbers\n\n- [STAGEDIVE in Numbers](https://stagedive.example/stats)");
    expect(llmsTxt({ ...data, stats: 9 })).not.toContain("/stats");
    expect(llmsFullTxt({ ...data, mostWatched: [], latest: [] })).not.toContain("/stats");
  });
});

describe("stats: indexing", () => {
  const concert = (i: number, over: Partial<SitemapConcert> = {}): SitemapConcert => ({
    slug: `c${i}`,
    updatedAt: new Date(`2026-11-${String(10 + i).padStart(2, "0")}T00:00:00Z`),
    hasSetlist: true,
    curated: false,
    writeUp: null,
    performedYear: 1990 + i,
    venueSlug: null,
    tourSlug: null,
    artistSlugs: [],
    genreSlugs: [],
    ...over,
  });
  it("is in the sitemap from ten official concerts (bootlegs do not count)", () => {
    const ten = Array.from({ length: 10 }, (_, i) => concert(i));
    const entry = buildSitemap(ten, []).find((e) => e.path === STATS_PATH);
    expect(entry).toMatchObject({ path: "/stats", lastModified: new Date("2026-11-19T00:00:00Z") });
    const nine = [...ten.slice(0, 9), concert(9, { bootleg: true })];
    expect(buildSitemap(nine, []).map((e) => e.path)).not.toContain(STATS_PATH);
  });
  it("is indexed on the live site from ten official concerts, noindex,follow below", () => {
    process.env.SITE_INDEXABLE = "true";
    expect(robotsFor(statsIsStrong(10))).toBeUndefined();
    expect(robotsFor(statsIsStrong(9))).toEqual({ index: false, follow: true });
  });
});
