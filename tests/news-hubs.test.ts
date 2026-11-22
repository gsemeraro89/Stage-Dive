// News by topic and by band (owner, 22 Nov 2026): topic pages (/news/tours...), band news pages
// (/artists/<slug>/news), the touring and line-up answers, and how they reach the sitemap, the llms files
// and the Markdown copies by themselves. src/lib/news/hubs.ts, src/lib/answers.ts, src/lib/sitemap.ts, src/lib/llms.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LINEUP_ACTS_SHOWN, lineupQuestion, monthsBefore, touringQuestion } from "../src/lib/answers";
import { bandMarkdown, llmsFullTxt, llmsTxt } from "../src/lib/llms";
import {
  bandNewsIsStrong,
  bandNewsLead,
  bandNewsPath,
  bandNewsTitle,
  hubCounts,
  hubForTopic,
  hubYear,
  NEWS_HUB_SLUGS,
  NEWS_HUBS,
  newsHub,
  newsHubForPhrase,
  newsHubIsStrong,
  newsHubLead,
  newsHubMarkdown,
  RESERVED_NEWS_SLUGS,
  topicWords,
} from "../src/lib/news/hubs";
import { TOPICS } from "../src/lib/news/writer";
import { buildSitemap, type SitemapNews } from "../src/lib/sitemap";
import { faqPage } from "../src/lib/structured-data";
import { BANNED, youtubeOnlyWithViews } from "./fixtures/concert-view";

const NOW = new Date("2026-11-22T12:00:00Z");
const day = (s: string) => new Date(`${s}T09:00:00Z`);
const clean = (text: string) => {
  expect(text).not.toMatch(BANNED);
  expect(youtubeOnlyWithViews(text)).toBe(true);
};

describe("topic pages", () => {
  it("cover the news topics, each once, with titles shaped like searches", () => {
    const covered = NEWS_HUBS.flatMap((h) => h.topics);
    expect(new Set(covered).size).toBe(covered.length);
    for (const t of covered) expect(TOPICS as readonly string[]).toContain(t);
    expect(hubForTopic("tour")?.slug).toBe("tours");
    expect(hubForTopic("festival")?.slug).toBe("festivals");
    expect(hubForTopic("live-release")?.slug).toBe("live-albums");
    expect(hubForTopic("other")).toBeNull();
    expect(newsHub("tours")!.title(2027)).toBe("Rock Tours 2027 · Tour Dates and News");
    expect(newsHub("festivals")!.title(2027)).toBe("Festival Line-ups 2027 · Rock Festival News");
    expect(newsHub("live-albums")!.title(2027)).toBe("New Live Albums · Rock Live Releases News");
    expect(newsHub("nope")).toBeNull();
    for (const h of NEWS_HUBS) {
      expect(h.title(2027)).toContain(" · ");
      clean(`${h.title(2027)} ${h.heading(2027)} ${h.about(2027)} ${h.more}`);
    }
  });

  it("take their year from the headlines (this year or next), else from the date", () => {
    expect(hubYear(["Muse European Tour 2027: Dates", "Pixies Tour 2026: More Dates"], NOW)).toBe(2027);
    expect(hubYear(["Pixies Tour 2026: More Dates", "Muse 1999 Reissue"], NOW)).toBe(2026);
    // Nothing usable: next year from October on, this year before.
    expect(hubYear(["Muse Tour: Dates", "Live 2031 Dates"], NOW)).toBe(2027);
    expect(hubYear([], new Date("2026-05-01T00:00:00Z"))).toBe(2026);
  });

  it("are indexed from three articles", () => {
    expect(newsHubIsStrong(2)).toBe(false);
    expect(newsHubIsStrong(3)).toBe(true);
    expect(hubCounts({ tour: 2, festival: 4, other: 9 }).get("tours")).toBe(2);
    expect(hubCounts(new Map([["festival", 4]])).get("festivals")).toBe(4);
    expect(hubCounts({}).get("reunions")).toBe(0);
  });

  it("open with an answer from the articles we hold", () => {
    const hub = newsHub("tours")!;
    const latest = [{ title: "Muse European Tour 2027: Dates and Cities", publishedAt: day("2026-11-20") }];
    const lead = newsHubLead(hub, 2027, latest, 7, ["Muse", "Pixies", "Muse", "", "Metallica", "Blur", "Pulp", "Suede", "Hellfest"]);
    expect(lead).toBe(
      "Rock tour news for 2027 on STAGEDIVE: 7 stories about Muse, Pixies, Metallica, Blur, Pulp and 2 more, newest first, each with the full concerts to watch here. Latest, 20 November 2026: Muse European Tour 2027: Dates and Cities.",
    );
    expect(newsHubLead(hub, 2027, latest, 1, ["Muse"])).toContain("1 story about Muse");
    expect(newsHubLead(hub, 2027, [], 0, [])).toMatch(/^No tours news on STAGEDIVE yet/);
    clean(lead);
  });

  it("have a Markdown copy with the articles and the bands' and festivals' concerts", () => {
    const hub = newsHub("festivals")!;
    const md = newsHubMarkdown(
      hub,
      2027,
      "Festival line-up news for 2027 on STAGEDIVE.",
      [{ slug: "glastonbury-2027-line-up", title: "Glastonbury 2027 Line-up: First Acts", lead: "Glastonbury named its first acts.", publishedAt: day("2026-11-20") }],
      [{ slug: "muse", name: "Muse", concerts: 3 }],
      [{ slug: "glastonbury", name: "Glastonbury Festival", concerts: 12 }],
    );
    expect(md).toMatch(/^# Festival line-ups 2027\n/);
    expect(md).toContain("- [Glastonbury 2027 Line-up: First Acts](http://localhost:3000/news/glastonbury-2027-line-up) (2026-11-20): Glastonbury named its first acts.");
    expect(md).toContain("- [Muse](http://localhost:3000/artists/muse): 3 full concerts");
    expect(md).toContain("- [Glastonbury Festival](http://localhost:3000/venues/glastonbury): 12 full concerts");
    expect(md).toContain("Page: http://localhost:3000/news/festivals");
    clean(md);
  });

  it("are never an article's address, and their Markdown copies are routed before the articles'", () => {
    for (const s of NEWS_HUB_SLUGS) expect(RESERVED_NEWS_SLUGS.has(s)).toBe(true);
    expect(RESERVED_NEWS_SLUGS.has("page")).toBe(true);
    const config = readFileSync("next.config.ts", "utf8");
    const hubRule = config.match(/\/news\/:hub\(([^)]+)\)/)?.[1].split("|") ?? [];
    expect(hubRule.sort()).toEqual([...NEWS_HUB_SLUGS].sort());
    expect(config.indexOf("/md/news-hubs/")).toBeLessThan(config.indexOf('destination: "/md/news/:slug"'));
    for (const s of NEWS_HUB_SLUGS) expect(() => readFileSync(`src/app/news/${s}/page.tsx`, "utf8")).not.toThrow();
  });

  it("are where news searches land (keyword research)", () => {
    expect(newsHubForPhrase("rock tours 2027")).toBe("/news/tours");
    expect(newsHubForPhrase("festival lineups 2027")).toBe("/news/festivals");
    expect(newsHubForPhrase("new live album 2027")).toBe("/news/live-albums");
    expect(newsHubForPhrase("new rock albums")).toBe("/news/new-music");
    expect(newsHubForPhrase("band reunions")).toBe("/news/reunions");
    expect(newsHubForPhrase("rock news today")).toBe("/news");
  });
});

describe("band news pages", () => {
  it("have a search title and an answer-first lead from the articles", () => {
    expect(bandNewsTitle("Metallica")).toBe("Metallica News · Tours, Albums and Live Shows");
    expect(bandNewsPath("metallica")).toBe("/artists/metallica/news");
    const lead = bandNewsLead(
      "Metallica",
      [
        { title: "Metallica Tour 2027: Stadium Dates", topic: "tour", publishedAt: day("2026-11-21") },
        { title: "Metallica Live Album: Seattle", topic: "live-release", publishedAt: day("2026-10-01") },
        { title: "Metallica Tour 2026: More Dates", topic: "tour", publishedAt: day("2026-09-01") },
        { title: "Metallica Merch", topic: "other", publishedAt: day("2026-08-01") },
      ],
      4,
    );
    expect(lead).toBe(
      "The latest Metallica news on STAGEDIVE: 4 stories about tours and concert dates and live albums and concert films, newest first. Latest, 21 November 2026: Metallica Tour 2027: Stadium Dates.",
    );
    expect(bandNewsLead("Metallica", [], 0)).toBe("No news about Metallica on STAGEDIVE yet.");
    expect(topicWords(["other"])).toBe("");
    clean(lead);
  });
  it("are indexed from two articles", () => {
    expect(bandNewsIsStrong(1)).toBe(false);
    expect(bandNewsIsStrong(2)).toBe(true);
  });
});

describe("answers from our news", () => {
  const tour = { slug: "metallica-tour-2027", title: "Metallica Tour 2027: Stadium Dates", lead: "Metallica will play 20 stadiums in Europe in 2027", publishedAt: day("2026-11-01") };
  it("answer 'Is <band> touring?' from a tour article of the last six months only", () => {
    const qa = touringQuestion("Metallica", tour, NOW)!;
    expect(qa).toEqual({
      question: "Is Metallica touring?",
      answer: "The latest tour news about Metallica on STAGEDIVE, from 1 November 2026: Metallica will play 20 stadiums in Europe in 2027.",
      link: { href: "/news/metallica-tour-2027", text: "Metallica Tour 2027: Stadium Dates" },
    });
    expect(touringQuestion("Metallica", { ...tour, publishedAt: day("2026-05-01") }, NOW)).toBeNull();
    expect(touringQuestion("Metallica", null, NOW)).toBeNull();
    // FAQPage carries the visible question and answer.
    expect(faqPage([qa])).toMatchObject({ "@type": "FAQPage", mainEntity: [{ name: "Is Metallica touring?" }] });
    clean(qa.answer);
  });
  it("answer the festival line-up with the year of the headline and the acts named", () => {
    const article = {
      slug: "glastonbury-2027-line-up",
      title: "Glastonbury 2027 Line-up: First Acts Announced",
      lead: "Glastonbury named its first acts for June.",
      publishedAt: day("2026-11-10"),
      artists: ["Muse", "Pulp", "Muse", ...Array.from({ length: 14 }, (_, i) => `Act ${i + 1}`)],
    };
    const qa = lineupQuestion("Glastonbury Festival", article, NOW)!;
    expect(qa.question).toBe("What is the Glastonbury Festival 2027 line-up?");
    expect(qa.answer).toMatch(/^The latest line-up news about Glastonbury Festival on STAGEDIVE, from 10 November 2026: Glastonbury named its first acts for June\. Acts named: Muse, Pulp, Act 1/);
    expect(qa.answer).toContain(`Act ${LINEUP_ACTS_SHOWN - 2} and 4 more.`);
    expect(qa.link?.href).toBe("/news/glastonbury-2027-line-up");
    expect(lineupQuestion("Hellfest", { ...article, title: "Hellfest Line-up: Headliners", artists: [] }, NOW)?.question).toBe("What is the latest Hellfest line-up news?");
    expect(lineupQuestion("Hellfest", { ...article, publishedAt: day("2025-10-01") }, NOW)).toBeNull();
    clean(qa.answer);
  });
  it("count months back", () => {
    expect(monthsBefore(NOW, 6).toISOString()).toBe("2026-05-22T12:00:00.000Z");
  });
});

describe("band Markdown copy", () => {
  const band = { name: "Metallica", slug: "metallica", bio: null, origin: null, bornYear: null, label: null, aka: null };
  it("lists the band's latest news and the touring answer with its link", () => {
    const touring = touringQuestion("Metallica", { slug: "metallica-tour-2027", title: "Metallica Tour 2027: Stadium Dates", lead: "Twenty stadiums.", publishedAt: day("2026-11-01") }, NOW)!;
    const md = bandMarkdown(band, [], [], [], { latest: [{ slug: "metallica-tour-2027", title: "Metallica Tour 2027: Stadium Dates", publishedAt: day("2026-11-01") }], total: 3, questions: [touring] });
    expect(md).toContain("## News\n\n- [Metallica Tour 2027: Stadium Dates](http://localhost:3000/news/metallica-tour-2027) (2026-11-01)");
    expect(md).toContain("Every Metallica news story (3): http://localhost:3000/artists/metallica/news");
    expect(md).toContain("### Is Metallica touring?");
    expect(md).toContain("Read: [Metallica Tour 2027: Stadium Dates](http://localhost:3000/news/metallica-tour-2027)");
    clean(md);
  });
  it("says nothing about news when there is none", () => {
    const md = bandMarkdown(band, [], []);
    expect(md).not.toContain("## News");
    expect(md).not.toContain("touring");
  });
});

describe("sitemap and llms files", () => {
  const n = (slug: string, topic: string, bandSlugs: string[] = [], updated = "2026-11-20"): SitemapNews => ({
    slug,
    topic,
    bandSlugs,
    updatedAt: day(updated),
    lead: "Lead.",
    body: "word ".repeat(80),
  });
  const bands = [
    { slug: "metallica", updatedAt: day("2026-01-01"), bio: "A band." },
    { slug: "muse", updatedAt: day("2026-01-01"), bio: "A band." },
  ];
  it("list a topic page from three articles and a band's news page from two", () => {
    const news = [n("a", "tour", ["metallica"], "2026-11-21"), n("b", "tour", ["metallica", "muse"]), n("c", "tour"), n("d", "festival", ["muse"]), n("e", "festival", ["ghost"]), n("f", "festival", ["ghost"])];
    const entries = buildSitemap([], bands, [], news);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("/news/tours");
    expect(paths).toContain("/news/festivals");
    expect(paths).not.toContain("/news/live-albums");
    expect(paths).toContain("/artists/metallica/news");
    expect(paths).toContain("/artists/muse/news");
    // A band without a page here gets no news page.
    expect(paths).not.toContain("/artists/ghost/news");
    expect(entries.find((e) => e.path === "/news/tours")?.lastModified).toEqual(day("2026-11-21"));
    expect(buildSitemap([], bands, [], news.slice(0, 2)).map((e) => e.path)).not.toContain("/news/tours");
    expect(buildSitemap([], bands, [], [n("a", "tour", ["muse"])]).map((e) => e.path)).not.toContain("/artists/muse/news");
  });
  it("name the strong topic pages and the band news pages", () => {
    const data = { bands: [], venues: [], genres: [], decades: [], tours: [], news: [{ slug: "a", title: "Muse Tour 2027: Dates", publishedAt: day("2026-11-20") }], newsHubs: hubCounts({ tour: 4, festival: 1 }) };
    const txt = llmsTxt(data);
    expect(txt).toContain("- [News: tours](http://localhost:3000/news/tours): 4 stories, newest first (Markdown copy at http://localhost:3000/news/tours.md)");
    expect(txt).not.toContain("/news/festivals");
    expect(txt).toContain("`/artists/<band>/news`");
    const full = llmsFullTxt({ ...data, mostWatched: [], latest: [] });
    expect(full).toContain("## News by topic\n\n- [Tours](http://localhost:3000/news/tours): 4 stories");
    clean(txt);
    clean(full);
  });
});
