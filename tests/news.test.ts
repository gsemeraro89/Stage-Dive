// News (owner, 21 Nov 2026): only items about our bands and festivals go to Claude; the writer's answer
// is checked before it goes live; the monthly budget holds; the pages carry their SEO. src/lib/news.
import { afterEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client";
import { articleText, parseFeed, plainText } from "../src/lib/news/feeds";
import { baseSlug, DEFAULT_NEWS_BUDGET_USD, fitsBudget, ITEM_ESTIMATE_USD, newsBudgetFromEnv, reviewReasons, runPressNews, storyEntities } from "../src/lib/news/job";
import { festivalNames, isRiskyName, newsMatcher, type NewsEntity } from "../src/lib/news/match";
import {
  newsArticleJsonLd,
  newsIndexLead,
  newsIsStrong,
  newsMarkdown,
  newsRssXml,
  newsSearchTitle,
  newsSitemapWindow,
  newsSitemapXml,
  NEWS_INDEX_DESCRIPTION,
  NEWS_INDEX_TITLE,
  watchLine,
} from "../src/lib/news/seo";
import { NEWS_BANNED, searchShapedTitle, sourceProblems, withoutUnsourcedYears, writtenProblems, type Checked, type NewsPasses, type Written } from "../src/lib/news/writer";
import { buildSitemap } from "../src/lib/sitemap";
import { llmsFullTxt, llmsTxt } from "../src/lib/llms";
import { BANNED, youtubeOnlyWithViews } from "./fixtures/concert-view";

const env = { url: process.env.SITE_URL, budget: process.env.NEWS_BUDGET_USD };
afterEach(() => {
  for (const [k, v] of [["SITE_URL", env.url], ["NEWS_BUDGET_USD", env.budget]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const band = (name: string, slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), aka: string | null = null): NewsEntity => ({ kind: "band", slug, name, aka });
const fest = (name: string, slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-")): NewsEntity => ({ kind: "festival", slug, name });

const OURS: NewsEntity[] = [
  band("Muse"),
  band("Ghost"),
  band("Tool"),
  band("Bush"),
  band("Rush"),
  band("Television"),
  band("Pulp"),
  band("Blur"),
  band("IDLES"),
  band("Metallica"),
  band("The Cure"),
  band("Guns N' Roses"),
  band("Motörhead", "motorhead"),
  band("Rage Against the Machine"),
  fest("Hellfest"),
  fest("Download Festival"),
  fest("Sziget Festival"),
  fest("Wacken Open Air"),
  fest("Rock in Rio"),
  fest("Primavera Sound"),
  fest("Lollapalooza Festival, Treptower Park", "lollapalooza-berlin"),
  fest("Stagecoach 2026 (Mustang Stage)", "stagecoach"),
];
const matcher = newsMatcher(OURS);
const names = (title: string, summary = "", categories: string[] = []) => {
  const m = matcher.find({ title, summary, categories });
  return [...m.bands, ...m.festivals].map((e) => e.name);
};

describe("matcher: one-word and common band names", () => {
  it("knows which names are risky", () => {
    expect(isRiskyName("Muse")).toBe(true);
    expect(isRiskyName("The Cure")).toBe(true);
    expect(isRiskyName("U2")).toBe(true);
    expect(isRiskyName("Rage Against the Machine")).toBe(false);
    expect(isRiskyName("Pearl Jam")).toBe(false);
  });

  it("takes a short name written as the band writes it, with a music word nearby", () => {
    expect(names("Muse announce 2027 European stadium tour")).toEqual(["Muse"]);
    expect(names("Ghost share new single from upcoming album")).toEqual(["Ghost"]);
    expect(names("Tool confirm UK tour dates for next summer")).toEqual(["Tool"]);
    expect(names("Bush to headline London show in March")).toEqual(["Bush"]);
    expect(names("The Cure release live album from their 2024 show")).toEqual(["The Cure"]);
    expect(names("IDLES drummer talks about the band's next record")).toEqual(["IDLES"]);
  });

  it("does not take the everyday word", () => {
    expect(names("Why every songwriter needs a muse")).toEqual([]);
    expect(names("This tool helps guitarists tune faster")).toEqual([]);
    expect(names("The cure for stage fright, according to drummers")).toEqual([]);
    expect(names("idles in the van: a tour diary")).toEqual([]);
  });

  it("does not take the capitalised word without a music word nearby", () => {
    expect(names("Ghost sightings reported in an old castle")).toEqual([]);
    expect(names("Rush hour traffic delays commuters")).toEqual([]);
    expect(names("Muse. A new exhibition opens at the Louvre")).toEqual([]);
  });

  it("does not take a name its blocker rules out", () => {
    expect(names("Bush administration papers released, rock fans react")).toEqual([]);
    expect(names("Television series about a punk band gets a second season")).toEqual([]);
    expect(names("Pulp Fiction soundtrack reissued on vinyl")).toEqual([]);
    expect(names("Ghost of Tsushima sequel has a metal soundtrack")).toEqual([]);
  });

  it("takes a short name when the item's own category is that band", () => {
    expect(names("A new chapter begins", "Plans for next year were shared today.", ["Blur"])).toEqual(["Blur"]);
    expect(names("A new chapter begins", "", ["blur"])).toEqual(["Blur"]);
  });

  it("takes a one-word name only as written, even a distinctive one", () => {
    expect(names("Metallica add second Paris show")).toEqual(["Metallica"]);
    expect(names("metallica add second Paris show")).toEqual([]);
  });

  it("takes a longer name in any case, accents and apostrophes folded", () => {
    expect(names("Motorhead live album gets a release date")).toEqual(["Motörhead"]);
    expect(names("Guns N’ Roses announce Latin American tour")).toEqual(["Guns N' Roses"]);
    expect(names("rage against the machine reunion shows confirmed")).toEqual(["Rage Against the Machine"]);
  });

  it("does not match a name inside another word", () => {
    expect(names("Metallicats is a cat café with a rock playlist")).toEqual([]);
    expect(names("Toolbox: the band essentials for touring")).toEqual([]);
  });

  it("orders what it found by where it appears, headline first", () => {
    expect(names("Metallica and Ghost added to Hellfest 2027 line-up")).toEqual(["Metallica", "Ghost", "Hellfest"]);
  });
});

describe("matcher: festivals", () => {
  it("makes the short names the press uses", () => {
    expect(festivalNames("Sziget Festival")).toEqual(expect.arrayContaining(["Sziget Festival", "Sziget"]));
    expect(festivalNames("Lollapalooza Festival, Treptower Park")).toEqual(expect.arrayContaining(["Lollapalooza"]));
    expect(festivalNames("Stagecoach 2026 (Mustang Stage)")).toEqual(expect.arrayContaining(["Stagecoach"]));
    expect(festivalNames("Coachella Valley Music and Arts Festival")).toEqual(expect.arrayContaining(["Coachella"]));
    expect(festivalNames("Wacken Open Air")).toEqual(expect.arrayContaining(["Wacken"]));
  });

  it("takes a festival name with a festival word nearby", () => {
    expect(names("Hellfest 2027: first headliners announced")).toEqual(["Hellfest"]);
    expect(names("Download announce first wave of 2027 line-up")).toEqual(["Download Festival"]);
    expect(names("Sziget reveals dates and tickets for next edition")).toEqual(["Sziget Festival"]);
    expect(names("Wacken sells out in record time, festival says")).toEqual(["Wacken Open Air"]);
    expect(names("Rock in Rio confirms its 2026 dates")).toEqual(["Rock in Rio"]);
  });

  it("does not take the everyday word", () => {
    expect(names("Fans can download the new single now")).toEqual([]);
    expect(names("Download the band's new app")).toEqual([]);
    expect(names("Primavera in Italy: a spring of guitars")).toEqual([]);
  });
});

describe("feeds", () => {
  it("reads RSS items with their categories", () => {
    const xml = `<rss><channel><item><title><![CDATA[Muse announce tour &amp; album]]></title><link>https://press.example/muse</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>The band will play <b>20</b> dates.</p>]]></description><category>Muse</category><category><![CDATA[Tour Dates]]></category></item><item><title>No link</title></item></channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "Muse announce tour & album", url: "https://press.example/muse", summary: "The band will play 20 dates.", categories: ["Muse", "Tour Dates"] });
    expect(items[0].publishedAt?.toISOString()).toBe("2026-11-20T10:00:00.000Z");
  });

  it("reads Atom entries", () => {
    const xml = `<feed><entry><title>Ghost tour</title><link href="https://press.example/ghost"/><updated>2026-11-20T10:00:00Z</updated><summary>Dates.</summary><category term="Ghost"/></entry></feed>`;
    expect(parseFeed(xml)[0]).toMatchObject({ url: "https://press.example/ghost", categories: ["Ghost"] });
  });

  it("turns HTML into plain text and keeps an article's paragraphs", () => {
    expect(plainText("A &#8217;B&#x27; <i>C</i> D&rsquo;")).toBe("A ’B' C D’");
    const html = `<nav><p>Menu menu menu menu menu menu menu menu menu menu</p></nav><article>${"<p>Paragraph with enough words to count as text in the article body here.</p>".repeat(6)}</article>`;
    expect(articleText(html)).not.toContain("Menu");
  });
});

describe("budget", () => {
  it("defaults to $5 a month and reads NEWS_BUDGET_USD", () => {
    expect(DEFAULT_NEWS_BUDGET_USD).toBe(5);
    expect(newsBudgetFromEnv(undefined)).toBe(5);
    expect(newsBudgetFromEnv("")).toBe(5);
    expect(newsBudgetFromEnv("abc")).toBe(5);
    expect(newsBudgetFromEnv("0")).toBe(5);
    expect(newsBudgetFromEnv("12")).toBe(12);
  });

  it("sends an item only when its estimate still fits", () => {
    expect(fitsBudget(0, 5)).toBe(true);
    expect(fitsBudget(5 - ITEM_ESTIMATE_USD, 5)).toBe(true);
    expect(fitsBudget(4.999, 5)).toBe(false);
  });
});

describe("slugs", () => {
  it("come from the headline, short and never empty", () => {
    expect(baseSlug("Motörhead: Live album from Hammersmith 1981")).toBe("motorhead-live-album-from-hammersmith-1981");
    expect(baseSlug("!!!")).toBe("news");
    expect(baseSlug("a ".repeat(80)).length).toBeLessThanOrEqual(90);
    expect(baseSlug("a ".repeat(80))).not.toMatch(/-$/);
  });
});

const body = (words: number) => Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
const written = (over: Partial<Written> = {}): Written => ({
  isNews: true,
  reason: "",
  topic: "tour",
  about: ["Muse"],
  duplicateOf: 0,
  sensitive: false,
  title: "Muse: European stadium tour in 2027",
  lead: "Muse will play stadiums across Europe in 2027.",
  body: body(70),
  artists: ["Muse"],
  ...over,
});

describe("writer checks", () => {
  it("bans the owner's words, hype words and exclamation marks", () => {
    for (const w of ["free", "archive", "archival", "upload", "uploaded", "full-length", "YouTube", "legendary", "Wow!"]) expect(w).toMatch(NEWS_BANNED);
    expect("Muse play a freestyle set at the festival").not.toMatch(NEWS_BANNED);
    expect(writtenProblems(written({ body: `${body(60)} Their new full-length album follows.` }))).toContain("banned word or exclamation mark");
    expect(writtenProblems(written())).toEqual([]);
  });

  it("catches short bodies, self-reference and dashes", () => {
    expect(writtenProblems(written({ body: body(10) }))).toContain("body has 10 words");
    expect(writtenProblems(written({ body: `${body(60)} Stay tuned for more.` }))).toContain("talks about the source instead of the news");
    expect(writtenProblems(written({ title: "Muse - a tour" }))).toContain("dash used as a separator");
  });

  it("checks years and names against the source, and drops a year the source does not give", () => {
    const src = "Headline: Muse announce European tour\n\nSummary: Muse will tour in 2027 with Royal Blood.";
    expect(sourceProblems(written({ artists: ["Muse", "Royal Blood"] }), src)).toEqual([]);
    expect(sourceProblems(written({ lead: "In 2028 Muse tour.", artists: ["Muse", "Biffy Clyro"] }), src)).toEqual(["year 2028 is not in the source", "Biffy Clyro is not named in the source"]);
    expect(withoutUnsourcedYears("Muse 2025: European tour", src)).toBe("Muse: European tour");
    expect(withoutUnsourcedYears("Muse: tour in 2027", src)).toBe("Muse: tour in 2027");
  });

  it("sends sensitive, unsupported or copied articles to review", () => {
    const src = "Headline: Muse tour 2027 Muse";
    const ok: Checked = { supported: true, problems: [], copied: false };
    expect(reviewReasons(written(), src, ok)).toEqual([]);
    expect(reviewReasons(written({ sensitive: true }), src, ok)[0]).toMatch(/sensitive/);
    expect(reviewReasons(written(), src, { supported: false, problems: ["date differs"], copied: false })).toEqual(["date differs"]);
    expect(reviewReasons(written(), src, { supported: false, problems: [], copied: false })).toEqual(["fact check: not supported"]);
    expect(reviewReasons(written(), src, { supported: true, problems: [], copied: true })).toEqual(["copies the source"]);
    expect(reviewReasons(written(), src, null)).toEqual(["fact check gave no answer"]);
  });

  it("keeps the bands and festival the story is about", () => {
    const m = { bands: [band("Muse"), band("Metallica")], festivals: [fest("Hellfest")] };
    expect(storyEntities(m, ["Hellfest", "Metallica"])).toEqual({ bands: [band("Metallica")], festival: fest("Hellfest") });
    expect(storyEntities(m, [])).toEqual({ bands: m.bands, festival: fest("Hellfest") });
  });
});

// ---- The job, with a fake database, fake feeds and a fake writer ----

type Row = Record<string, unknown>;
function fakeDb(opts: { spent?: number } = {}) {
  const seen: Row[] = opts.spent ? [{ url: "old", decision: "written", costUsd: opts.spent, createdAt: new Date() }] : [];
  const articles: Row[] = [];
  const db = {
    artist: { findMany: async () => [{ slug: "muse", name: "Muse", aka: null }, { slug: "metallica", name: "Metallica", aka: null }] },
    venue: { findMany: async () => [{ slug: "hellfest", name: "Hellfest" }] },
    newsSeen: {
      aggregate: async () => ({ _sum: { costUsd: seen.reduce((s, r) => s + (r.costUsd as number), 0) } }),
      findMany: async ({ where }: { where: { url: { in: string[] } } }) => seen.filter((r) => where.url.in.includes(r.url as string)),
      create: async ({ data }: { data: Row }) => seen.push({ costUsd: 0, createdAt: new Date(), ...data }),
      upsert: async ({ create }: { create: Row }) => seen.push({ createdAt: new Date(), ...create }),
      deleteMany: async () => ({ count: 0 }),
    },
    newsArticle: {
      findMany: async () => [],
      findUnique: async ({ where }: { where: { slug: string } }) => articles.find((a) => a.slug === where.slug) ?? null,
      create: async ({ data }: { data: Row }) => articles.push(data),
    },
  };
  return { db: db as unknown as PrismaClient, seen, articles };
}

const NOW = new Date("2026-11-21T12:00:00Z");
const rss = (items: { title: string; url: string; summary?: string; date?: string }[]) =>
  `<rss><channel>${items.map((i) => `<item><title>${i.title}</title><link>${i.url}</link><pubDate>${i.date ?? "Sat, 21 Nov 2026 08:00:00 GMT"}</pubDate><description>${i.summary ?? ""}</description></item>`).join("")}</channel></rss>`;
const FEED_XML = rss([
  { title: "Muse announce European stadium tour for 2027", url: "https://press.example/muse-tour", summary: "Muse will play stadiums in 2027." },
  { title: "Metallica and Hellfest: a sensitive story", url: "https://press.example/sad", summary: "Metallica headline Hellfest in 2027." },
  { title: "A pop star releases a perfume", url: "https://press.example/pop" },
  { title: "Old Muse tour news", url: "https://press.example/old", date: "Mon, 01 Jan 2024 08:00:00 GMT" },
]);
const fetcher = (async (url: string) => {
  if (url === "https://press.example/feed") return new Response(FEED_XML);
  if (url === "https://press.example/dead") return new Response("gone", { status: 404 });
  return new Response("<html><p>short</p></html>");
}) as typeof fetch;
const FEEDS = [
  { name: "Press", url: "https://press.example/feed" },
  { name: "Dead", url: "https://press.example/dead" },
];

class FakeWriter implements NewsPasses {
  calls: string[] = [];
  async write(item: { title: string }) {
    this.calls.push(`write:${item.title}`);
    if (item.title.startsWith("Muse")) return { answer: written(), usd: 0.002 };
    return { answer: written({ title: "Hellfest 2027: Metallica to headline", about: ["Metallica", "Hellfest"], artists: ["Metallica"], sensitive: true }), usd: 0.002 };
  }
  async check(item: { title: string }) {
    this.calls.push(`check:${item.title}`);
    return { answer: { supported: true, problems: [], copied: false }, usd: 0.001 };
  }
}

describe("news job", () => {
  it("sends only fresh items about ours, publishes what passes and holds the rest for review", async () => {
    const { db, seen, articles } = fakeDb();
    const writer = new FakeWriter();
    const r = await runPressNews(db, { feeds: FEEDS, fetcher, writer, now: NOW, budgetUsd: 5 });
    expect(r.feedErrors).toEqual(["Dead (https://press.example/dead): HTTP 404"]);
    expect(r.items).toBe(4);
    expect(r.tooOld).toBe(1);
    expect(r.noMatch).toBe(1);
    expect(r.sentToClaude).toBe(2);
    expect(writer.calls.filter((c) => c.startsWith("write"))).toHaveLength(2);
    expect(r.published).toEqual(["Muse: European stadium tour in 2027"]);
    expect(r.review).toEqual(["Hellfest 2027: Metallica to headline"]);
    expect(r.costUsd).toBeCloseTo(0.006);
    const muse = articles.find((a) => a.title === "Muse: European stadium tour in 2027")!;
    expect(muse).toMatchObject({ status: "PUBLISHED", bandSlugs: ["muse"], venueSlug: null, sourceName: "Press", sourceUrl: "https://press.example/muse-tour", slug: "muse-european-stadium-tour-in-2027", topic: "tour", subject: "muse", subjectKind: "band" });
    const sad = articles.find((a) => a.status === "REVIEW")!;
    expect(sad).toMatchObject({ bandSlugs: ["metallica"], venueSlug: "hellfest", venueName: "Hellfest" });
    expect(sad.checkNote).toMatch(/sensitive/);
    expect(seen.map((s) => s.decision).sort()).toEqual(["no-match", "review", "written"]);
  });

  it("a dry run reads and matches but writes nothing and pays nothing", async () => {
    const { db, seen, articles } = fakeDb();
    const writer = new FakeWriter();
    const r = await runPressNews(db, { feeds: FEEDS, fetcher, writer, now: NOW, dryRun: true });
    expect(r).toMatchObject({ sentToClaude: 0, costUsd: 0 });
    expect((r as { wouldSend: string[] }).wouldSend).toHaveLength(2);
    expect(writer.calls).toEqual([]);
    expect(seen).toEqual([]);
    expect(articles).toEqual([]);
  });

  it("skips items that are not news by their headline, for free (quiz, lists, interviews)", async () => {
    const { db, seen } = fakeDb();
    const writer = new FakeWriter();
    const quizFeed = rss([
      { title: "Muse quiz: How much do you know about the band?", url: "https://press.example/quiz" },
      { title: "Muse announce European stadium tour for 2027", url: "https://press.example/muse-tour" },
    ]);
    const f = (async () => new Response(quizFeed)) as unknown as typeof fetch;
    const dry = await runPressNews(db, { feeds: [FEEDS[0]], fetcher: f, writer, now: NOW, dryRun: true });
    expect(dry.notNewsByTitle).toBe(1);
    expect((dry as { wouldSend: string[] }).wouldSend).toEqual(["Muse | Press | Muse announce European stadium tour for 2027"]);
    expect((dry as { skippedByTitle: string[] }).skippedByTitle).toEqual(["quiz | Press | Muse quiz: How much do you know about the band?"]);
    await runPressNews(db, { feeds: [FEEDS[0]], fetcher: f, writer, now: NOW, budgetUsd: 5 });
    expect(writer.calls.filter((c) => c.startsWith("write"))).toEqual(["write:Muse announce European stadium tour for 2027"]);
    expect(seen.find((s) => s.url === "https://press.example/quiz")?.decision).toBe("not-news-title");
  });

  it("stops when the month's budget is spent", async () => {
    const { db, articles } = fakeDb({ spent: 4.995 });
    const writer = new FakeWriter();
    const r = await runPressNews(db, { feeds: FEEDS, fetcher, writer, now: NOW, budgetUsd: 5 });
    expect(r.stoppedByBudget).toBe(true);
    expect(writer.calls).toEqual([]);
    expect(articles).toEqual([]);
  });

  it("uses NEWS_BUDGET_USD when no budget is given", async () => {
    process.env.NEWS_BUDGET_USD = "1";
    const { db } = fakeDb({ spent: 0.995 });
    const r = await runPressNews(db, { feeds: FEEDS, fetcher, writer: new FakeWriter(), now: NOW });
    expect(r.budgetUsd).toBe(1);
    expect(r.stoppedByBudget).toBe(true);
  });

  it("does not write an item that is not news or about another act", async () => {
    const { db, articles, seen } = fakeDb();
    const writer: NewsPasses = {
      write: async () => ({ answer: written({ isNews: false, reason: "a film called Muse" }), usd: 0.001 }),
      check: async () => ({ answer: null, usd: 0 }),
    };
    const r = await runPressNews(db, { feeds: [FEEDS[0]], fetcher, writer, now: NOW, budgetUsd: 5 });
    expect(r.notNews).toBe(2);
    expect(articles).toEqual([]);
    expect(seen.filter((s) => s.decision === "not-news")).toHaveLength(2);
  });
});

// ---- Pages: SEO, AEO, feeds and sitemaps ----

const article = {
  slug: "muse-european-stadium-tour-in-2027",
  title: "Muse: European stadium tour in 2027",
  lead: "Muse will play stadiums across Europe in 2027.",
  body: body(70),
  paragraphs: [body(40), body(30)],
  publishedAt: new Date("2026-11-21T08:00:00Z"),
  updatedAt: new Date("2026-11-21T09:00:00Z"),
  sourceName: "Press & Co",
  sourceUrl: "https://press.example/muse-tour",
};

describe("news SEO", () => {
  it("titles say the headline and the section the way people search", () => {
    expect(newsSearchTitle("Muse: European stadium tour in 2027")).toBe("Muse: European stadium tour in 2027 · STAGEDIVE News");
    // Over 65 characters: only the suffix gives way, the headline is never cut.
    const long = "Deep Purple Tour 2026 Postponed: All Remaining Dates Cancelled";
    const mid = "Glastonbury 2027 Line-up: First Acts and Headliners"; // 51 characters
    expect(newsSearchTitle(mid)).toBe(`${mid} · STAGEDIVE`);
    expect(newsSearchTitle(long)).toBe(long);
    expect(newsSearchTitle("Glastonbury 2027 Line-up: First Acts").length).toBeLessThanOrEqual(65);
    expect(NEWS_INDEX_TITLE).toContain("·");
    expect(newsIndexLead(["Muse", "Hellfest"])).toMatch(/^The latest news about the bands and festivals on STAGEDIVE/);
    expect(newsIndexLead([])).not.toContain("among");
  });

  it("indexes an article with 60 words of our own", () => {
    expect(newsIsStrong({ lead: "One two three.", body: body(57) })).toBe(true);
    expect(newsIsStrong({ lead: "One two.", body: body(20) })).toBe(false);
  });

  it("links readers into the catalogue", () => {
    expect(watchLine("Muse", 4)).toBe("Watch Muse's 4 full concerts");
    expect(watchLine("Guns N' Roses", 2)).toBe("Watch Guns N' Roses' 2 full concerts");
    expect(watchLine("Metallica", 12)).toBe("Watch Metallica's 12 full concerts");
    expect(watchLine("Metallica", 1)).toBe("Watch Metallica's full concert");
  });

  it("NewsArticle structured data names us as publisher, the source as basis, and our pages as subjects", () => {
    process.env.SITE_URL = "https://stagedive.example";
    const j = newsArticleJsonLd(article, { image: "https://i.ytimg.com/vi/x/hqdefault.jpg", bands: [{ slug: "muse", name: "Muse" }], festival: { slug: "hellfest", name: "Hellfest" } });
    expect(j).toMatchObject({
      "@type": "NewsArticle",
      headline: article.title,
      url: "https://stagedive.example/news/muse-european-stadium-tour-in-2027",
      datePublished: "2026-11-21T08:00:00.000Z",
      publisher: { name: "STAGEDIVE" },
      isBasedOn: { url: "https://press.example/muse-tour" },
      about: [
        { "@type": "MusicGroup", url: "https://stagedive.example/artists/muse" },
        { "@type": "Festival", url: "https://stagedive.example/venues/hellfest" },
      ],
    });
    expect(newsArticleJsonLd(article).image).toEqual(["https://stagedive.example/share-card.png"]);
  });

  it("the Markdown copy carries the text, the source and the links, within the copy rules", () => {
    process.env.SITE_URL = "https://stagedive.example";
    const md = newsMarkdown(article, [{ slug: "muse", name: "Muse", concerts: 3 }], { slug: "hellfest", name: "Hellfest", concerts: 5 });
    expect(md).toContain("# Muse: European stadium tour in 2027");
    expect(md).toContain("Source: [Press & Co](https://press.example/muse-tour)");
    expect(md).toContain("[Watch Muse's 3 full concerts](https://stagedive.example/artists/muse)");
    expect(md).toContain("https://stagedive.example/venues/hellfest");
    expect(md).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(md)).toBe(true);
    expect(NEWS_INDEX_DESCRIPTION).not.toMatch(BANNED);
    expect(newsIndexLead(["Muse"])).not.toMatch(BANNED);
  });

  it("our RSS feed is valid-looking and escaped", () => {
    process.env.SITE_URL = "https://stagedive.example";
    const xml = newsRssXml([{ ...article, title: "Guns N' Roses & friends <live>" }]);
    expect(xml).toContain("<title>Guns N&apos; Roses &amp; friends &lt;live&gt;</title>");
    expect(xml).toContain("<link>https://stagedive.example/news/muse-european-stadium-tour-in-2027</link>");
    expect(xml).toContain("<pubDate>Sat, 21 Nov 2026 08:00:00 GMT</pubDate>");
    expect(xml).toContain('rel="self"');
  });

  it("the news sitemap lists the last 48 hours only", () => {
    const now = new Date("2026-11-21T12:00:00Z");
    const at = (h: number) => ({ slug: `a${h}`, title: "T", publishedAt: new Date(now.getTime() - h * 3_600_000) });
    expect(newsSitemapWindow([at(1), at(47), at(49), at(200)], now).map((a) => a.slug)).toEqual(["a1", "a47"]);
    const xml = newsSitemapXml([{ slug: "a", title: "Rock & roll", publishedAt: now }]);
    expect(xml).toContain("<news:name>STAGEDIVE</news:name>");
    expect(xml).toContain("<news:title>Rock &amp; roll</news:title>");
    expect(xml).toContain("<news:publication_date>2026-11-21T12:00:00.000Z</news:publication_date>");
  });

  it("the main sitemap lists /news and strong articles only", () => {
    const at = new Date("2026-11-21T00:00:00Z");
    const paths = buildSitemap([], [], [], [
      { slug: "strong", updatedAt: at, lead: "Lead.", body: body(70) },
      { slug: "thin", updatedAt: at, lead: "Lead.", body: body(10) },
    ]).map((e) => e.path);
    expect(paths).toContain("/news");
    expect(paths).toContain("/news/strong");
    expect(paths).not.toContain("/news/thin");
    expect(buildSitemap([], [], [], []).map((e) => e.path)).not.toContain("/news");
  });

  it("llms files list the news when there is some", () => {
    process.env.SITE_URL = "https://stagedive.example";
    const data = { bands: [], venues: [], genres: [], decades: [], tours: [], news: [{ slug: "a", title: "Muse: tour", publishedAt: article.publishedAt }] };
    expect(llmsTxt(data)).toContain("[News](https://stagedive.example/news)");
    expect(llmsTxt({ ...data, news: [] })).not.toContain("[News]");
    const full = llmsFullTxt({ ...data, mostWatched: [], latest: [] });
    expect(full).toContain("## Latest news");
    expect(full).toContain("- [Muse: tour](https://stagedive.example/news/a) (2026-11-21)");
    expect(llmsTxt(data)).not.toMatch(BANNED);
  });
});

describe("search-shaped headlines (owner, 22 Nov 2026)", () => {
  it("keeps a headline that already leads with the band or festival", () => {
    expect(searchShapedTitle("Deep Purple Tour 2026 Postponed: All Remaining Dates Cancelled", ["Deep Purple"])).toBe(
      "Deep Purple Tour 2026 Postponed: All Remaining Dates Cancelled",
    );
    expect(searchShapedTitle("Glastonbury 2027 Line-up: First Acts Announced", ["Glastonbury Festival"])).toBe("Glastonbury 2027 Line-up: First Acts Announced");
    expect(searchShapedTitle("Offspring New Live Album: Just the Punk Stuff", ["The Offspring"])).toBe("Offspring New Live Album: Just the Punk Stuff");
    expect(searchShapedTitle("AC/DC Tour Dates: Europe", ["AC/DC"])).toBe("AC/DC Tour Dates: Europe");
  });
  it("puts the band first when the headline left it out, and tidies it", () => {
    expect(searchShapedTitle("tour dates for 2027.", ["Pixies"])).toBe("Pixies: Tour dates for 2027");
    expect(searchShapedTitle("  “New Live Album:  just the punk stuff” ", ["The Offspring"])).toBe("The Offspring: New Live Album: Just the punk stuff");
    // A name used later in the headline stays where it is.
    expect(searchShapedTitle("New Album From Muse: Dates", ["Muse"])).toBe("New Album From Muse: Dates");
    // A name inside another word does not count.
    expect(searchShapedTitle("Museum Shows Announced", ["Muse"])).toBe("Muse: Museum Shows Announced");
    expect(searchShapedTitle("Hellfest 2027 Line-up: first headliners", [])).toBe("Hellfest 2027 Line-up: First headliners");
  });
  it("is asked of the model in the prompt", async () => {
    const { WrittenSchema } = await import("../src/lib/news/writer");
    expect(WrittenSchema.shape.title.description).toMatch(/band or festival first/);
  });
});
