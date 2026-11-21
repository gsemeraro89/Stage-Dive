// Reading news for the pages: the news list, one article, a band's or a festival's latest news.
// Pictures are our own (owner rule: no image is copied from the source): the band's picture on our site
// (a frame of its concert), else the festival's, else none (the page then shares the site's card).
import { getDb } from "../db";
import { OFFICIAL_FIRST } from "../filters";
import { findConcertViews, listArtists, listVenues, type Cover } from "../queries";

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
export async function listNews(opts: { page?: number; take?: number; bandSlug?: string; venueSlug?: string } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const take = opts.take ?? NEWS_PER_PAGE;
  const where = {
    ...PUBLISHED,
    ...(opts.bandSlug ? { bandSlugs: { has: opts.bandSlug } } : {}),
    ...(opts.venueSlug ? { venueSlug: opts.venueSlug } : {}),
  };
  const [rows, total, p] = await Promise.all([
    getDb().newsArticle.findMany({ where, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip: (page - 1) * take, take, select: LIST_FIELDS }),
    getDb().newsArticle.count({ where }),
    pages(),
  ]);
  return { articles: rows.map((r) => ({ ...r, cover: pictureOf(r, p) })), total, page, pages: Math.max(1, Math.ceil(total / take)) };
}

export type NewsListItem = Awaited<ReturnType<typeof listNews>>["articles"][number];

/** The latest news of one band (its page's "Latest news" block). */
export async function bandNews(slug: string, take = 3) {
  return (await listNews({ bandSlug: slug, take })).articles;
}

/** The latest news of one festival (its page's "Latest news" block). */
export async function venueNews(slug: string, take = 3) {
  return (await listNews({ venueSlug: slug, take })).articles;
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
