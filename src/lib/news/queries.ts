// Reading news for the pages: the news list, one article, a band's or a festival's latest news.
// Pictures are our own (owner rule: no image is copied from the source): the band's picture on our site
// (a frame of its concert), else the festival's, else none (the page then shares the site's card).
import { LINEUP_NEWS_MONTHS, TOURING_NEWS_MONTHS, lineupQuestion, monthsBefore, touringQuestion } from "../answers";
import { getDb } from "../db";
import { OFFICIAL_FIRST } from "../filters";
import { cached } from "../memo";
import { findConcertViews, listArtists, listVenues, type Cover } from "../queries";
import { bandNewsLead, hubCounts, hubYear, newsHub, newsHubLead } from "./hubs";

export const NEWS_PER_PAGE = 24;

const LIST_FIELDS = {
  id: true,
  slug: true,
  topic: true,
  title: true,
  lead: true,
  bandSlugs: true,
  venueSlug: true,
  venueName: true,
  publishedAt: true,
  updatedAt: true,
  sourceName: true,
} as const;

export const PUBLISHED = { status: "PUBLISHED" } as const;

/** An article's picture, and what it shows (for the alt text). */
export type NewsPicture = Cover & { of: string };

/** Our bands and festivals with a page, by slug (cached lists, src/lib/memo.ts). */
async function pages() {
  const [bands, festivals] = await Promise.all([listArtists(), listVenues()]);
  return {
    bands: new Map(bands.map((b) => [b.slug, b])),
    festivals: new Map(festivals.map((f) => [f.slug, f])),
  };
}

type Pages = Awaited<ReturnType<typeof pages>>;

/** The picture of an article: its first band's, else its festival's. Pure given the lists. */
function pictureOf(a: { bandSlugs: string[]; venueSlug: string | null }, p: Pages): NewsPicture | null {
  for (const slug of a.bandSlugs) {
    const b = p.bands.get(slug);
    if (b?.cover) return { ...b.cover, of: b.name };
  }
  const f = a.venueSlug ? p.festivals.get(a.venueSlug) : undefined;
  return f?.cover ? { ...f.cover, of: f.name } : null;
}

/** Published articles, newest first; optionally one band's or one festival's only. */
export async function listNews(opts: { page?: number; take?: number; bandSlug?: string; venueSlug?: string; topics?: string[] } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const take = opts.take ?? NEWS_PER_PAGE;
  const where = {
    ...PUBLISHED,
    ...(opts.bandSlug ? { bandSlugs: { has: opts.bandSlug } } : {}),
    ...(opts.venueSlug ? { venueSlug: opts.venueSlug } : {}),
    ...(opts.topics ? { topic: { in: opts.topics } } : {}),
  };
  const [rows, total, p] = await Promise.all([
    getDb().newsArticle.findMany({ where, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip: (page - 1) * take, take, select: LIST_FIELDS }),
    getDb().newsArticle.count({ where }),
    pages(),
  ]);
  return { articles: rows.map((r) => ({ ...r, cover: pictureOf(r, p) })), total, page, pages: Math.max(1, Math.ceil(total / take)) };
}

export type NewsListItem = Awaited<ReturnType<typeof listNews>>["articles"][number];

const ANSWER_FIELDS = { slug: true, title: true, lead: true, publishedAt: true } as const;

/**
 * A band's news for its page (owner, 22 Nov 2026): the latest few ("Latest news" block), how many there
 * are (the link to its news page) and the "Is <band> touring?" answer from its newest tour article of the
 * last six months. The tour article is read only when it is not already among the latest.
 */
export async function bandNewsBlock(slug: string, take = 3, now = new Date()) {
  const { articles, total } = await listNews({ bandSlug: slug, take });
  const since = monthsBefore(now, TOURING_NEWS_MONTHS);
  const inList = articles.find((a) => a.topic === "tour");
  const tour =
    inList && inList.publishedAt >= since
      ? inList
      : !inList && total > articles.length
        ? await getDb().newsArticle.findFirst({
            where: { ...PUBLISHED, bandSlugs: { has: slug }, topic: "tour", publishedAt: { gte: since } },
            orderBy: { publishedAt: "desc" },
            select: ANSWER_FIELDS,
          })
        : null;
  return { latest: articles, total, tour };
}

/** A band's touring answer, from its news block (null when there is no recent tour article). */
export function bandNewsQuestions(name: string, block: { tour: Parameters<typeof touringQuestion>[1] }, now = new Date()) {
  return [touringQuestion(name, block.tour, now)].filter((q) => q !== null);
}

/**
 * A festival's news for its page: the latest few and the line-up answer from its newest festival
 * (line-up) article of the last twelve months, with the acts the source names.
 */
export async function venueNewsBlock(slug: string, take = 3, now = new Date()) {
  const { articles, total } = await listNews({ venueSlug: slug, take });
  const lineup =
    total > 0
      ? await getDb().newsArticle.findFirst({
          where: { ...PUBLISHED, venueSlug: slug, topic: "festival", publishedAt: { gte: monthsBefore(now, LINEUP_NEWS_MONTHS) } },
          orderBy: { publishedAt: "desc" },
          select: { ...ANSWER_FIELDS, artists: true },
        })
      : null;
  return { latest: articles, total, lineup };
}

/** A festival's line-up answer, from its news block. */
export function venueNewsQuestions(name: string, block: { lineup: Parameters<typeof lineupQuestion>[1] }, now = new Date()) {
  return [lineupQuestion(name, block.lineup, now)].filter((q) => q !== null);
}

/** Published articles per topic (the size of each topic page): one small grouped read, kept a few minutes. */
export const newsTopicCounts = cached("newsTopicCounts", async (): Promise<Map<string, number>> => {
  const rows = await getDb().newsArticle.groupBy({ by: ["topic"], where: PUBLISHED, _count: { _all: true } });
  return new Map(rows.map((r) => [r.topic, r._count._all]));
});

/** Published articles per topic page (hub slug). */
export async function newsHubCounts(): Promise<Map<string, number>> {
  return hubCounts(await newsTopicCounts());
}

/** Articles listed on a topic page (one page, newest first). */
export const HUB_TAKE = 40;

/** The bands and festivals named in a list of articles that have a page here, in the articles' order. */
function linkedPages(articles: { bandSlugs: string[]; venueSlug: string | null }[], p: Pages) {
  const bands = [...new Set(articles.flatMap((a) => a.bandSlugs))]
    .map((s) => p.bands.get(s))
    .filter((b) => b !== undefined)
    .map((b) => ({ slug: b.slug, name: b.name, concerts: b.concerts }));
  const festivals = [...new Set(articles.map((a) => a.venueSlug).filter((s): s is string => Boolean(s)))]
    .map((s) => p.festivals.get(s))
    .filter((f) => f !== undefined)
    .map((f) => ({ slug: f.slug, name: f.name, concerts: f.concerts }));
  return { bands, festivals };
}

/** A topic page (/news/tours...): its year, answer-first lead, articles and the bands and festivals in them. */
export async function getNewsHub(slug: string, now = new Date()) {
  const hub = newsHub(slug);
  if (!hub) return null;
  const [{ articles, total }, p] = await Promise.all([listNews({ topics: hub.topics, take: HUB_TAKE }), pages()]);
  const { bands, festivals } = linkedPages(articles, p);
  const year = hubYear(articles.slice(0, 10).map((a) => a.title), now);
  const names = articles.flatMap((a) => [...a.bandSlugs.map((s) => p.bands.get(s)?.name ?? ""), a.venueName ?? ""]);
  return { hub, year, lead: newsHubLead(hub, year, articles, total, names), articles, total, bands, festivals };
}

export type NewsHubPage = NonNullable<Awaited<ReturnType<typeof getNewsHub>>>;

/** Articles listed on a band's news page. */
export const BAND_NEWS_TAKE = 50;

/** A band's news page (/artists/<slug>/news): the band, its news, the lead and the touring answer. */
export async function getBandNews(slug: string, now = new Date()) {
  const p = await pages();
  const band = p.bands.get(slug);
  if (!band) return null;
  const { articles, total } = await listNews({ bandSlug: slug, take: BAND_NEWS_TAKE });
  if (!total) return null;
  const since = monthsBefore(now, TOURING_NEWS_MONTHS);
  const tour = articles.find((a) => a.topic === "tour" && a.publishedAt >= since) ?? null;
  return {
    band: { slug: band.slug, name: band.name, concerts: band.concerts, cover: band.cover ?? null },
    articles,
    total,
    lead: bandNewsLead(band.name, articles, total),
    touring: touringQuestion(band.name, tour, now),
  };
}

/** One published article, with its bands and festival linked to our pages, and related news. */
export async function getNewsArticle(slug: string) {
  const a = await getDb().newsArticle.findUnique({ where: { slug } });
  if (!a || a.status !== "PUBLISHED") return null;
  const p = await pages();
  const bands = a.bandSlugs
    .map((s) => p.bands.get(s))
    .filter((b) => b !== undefined)
    .map((b) => ({ slug: b.slug, name: b.name, concerts: b.concerts }));
  const f = a.venueSlug ? p.festivals.get(a.venueSlug) : undefined;
  const festival = f ? { slug: f.slug, name: f.name, concerts: f.concerts } : null;
  const related = [...(a.bandSlugs.length ? [{ bandSlugs: { hasSome: a.bandSlugs } }] : []), ...(a.venueSlug ? [{ venueSlug: a.venueSlug }] : [])];
  const more = related.length
    ? await getDb().newsArticle.findMany({ where: { ...PUBLISHED, id: { not: a.id }, OR: related }, orderBy: { publishedAt: "desc" }, take: 4, select: LIST_FIELDS })
    : [];
  // A few of their concerts to watch here (news drives people into the catalogue): official first, most watched.
  const concertsFor = (where: object) => findConcertViews({ where, orderBy: [OFFICIAL_FIRST, { viewCount: "desc" }, { id: "asc" }], take: 3 });
  const [bandConcerts, festivalConcerts] = await Promise.all([
    Promise.all(bands.map((b) => concertsFor({ credits: { some: { role: "MAIN", artist: { slug: b.slug } } } }))),
    festival ? concertsFor({ venue: { slug: festival.slug } }) : Promise.resolve([]),
  ]);
  const short = (c: Awaited<ReturnType<typeof concertsFor>>[number]) => ({
    slug: c.slug,
    credits: c.credits,
    venue: c.venue?.name ?? c.city ?? null,
    year: c.performedYear,
  });
  return {
    article: { ...a, paragraphs: paragraphs(a.body) },
    bands: bands.map((b, i) => ({ ...b, watch: bandConcerts[i].map(short) })),
    festival: festival ? { ...festival, watch: festivalConcerts.map(short) } : null,
    cover: pictureOf(a, p),
    more,
  };
}

export type NewsPage = NonNullable<Awaited<ReturnType<typeof getNewsArticle>>>;

/** A body's paragraphs (separated by a blank line). Pure. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** The newest published articles for the feeds, sitemaps and llms files (light fields). */
export async function latestNews(opts: { take?: number; since?: Date } = {}) {
  return getDb().newsArticle.findMany({
    where: { ...PUBLISHED, ...(opts.since ? { publishedAt: { gte: opts.since } } : {}) },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: opts.take ?? 50,
    select: { slug: true, title: true, lead: true, body: true, publishedAt: true, updatedAt: true, sourceName: true, sourceUrl: true, bandSlugs: true, venueSlug: true },
  });
}

/** The newest published headlines only (the llms files): no text read. */
export async function latestHeadlines(take = 50) {
  return getDb().newsArticle.findMany({ where: PUBLISHED, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take, select: { slug: true, title: true, publishedAt: true } });
}
