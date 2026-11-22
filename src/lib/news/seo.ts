// Search engines, AI assistants and aggregators for the news section (CLAUDE.md "SEO, AEO and AI
// search"): titles, the strong-page rule, NewsArticle structured data, the Markdown copy, our own RSS feed
// and the Google News sitemap. Everything is built from the database rows, so a new article gets all of
// it by itself. Kept beside the news code; the site-wide files (seo.ts, structured-data.ts, sitemap.ts,
// llms.ts, robots.ts) only call into it. Pure; tested in tests/news.test.ts.
import { abs, clip, SHARE_FALLBACK_IMAGE } from "../seo";
import { SITE_NAME } from "../site";
import { plural } from "../text";

type Json = Record<string, unknown>;

// ---- Titles and leads ----

/** The news index title (the layout adds " · STAGEDIVE"). */
export const NEWS_INDEX_TITLE = "Rock News · Tours, Festival Line-ups and Live Albums";
export const NEWS_INDEX_DESCRIPTION =
  "Rock, metal, punk and indie news about the bands and festivals on STAGEDIVE: tours, festival line-ups, live albums, reunions and anniversaries, with the full concerts to watch.";

/** "Pixies: European tour dates for 2027 · STAGEDIVE News" (used as an absolute title). */
export function newsSearchTitle(headline: string): string {
  return `${headline} · ${SITE_NAME} News`;
}

/** The index page's answer-first lead, naming the bands and festivals in the newest stories. Pure. */
export function newsIndexLead(names: string[]): string {
  const list = names.slice(0, 4);
  return `The latest news about the bands and festivals on ${SITE_NAME}: tours, festival line-ups, live albums, reunions and anniversaries${
    list.length ? `, with ${list.join(", ")} among the latest` : ""
  }, each with the full concerts to watch here.`;
}

/** "Watch Pixies' full concerts" / "Watch Metallica's 12 full concerts". Pure. */
export function watchLine(name: string, concerts: number): string {
  const own = /s$/i.test(name) ? `${name}'` : `${name}'s`;
  return concerts > 1 ? `Watch ${own} ${plural(concerts, "full concert")}` : `Watch ${own} full concert`;
}

// ---- What is worth indexing ----

/** Our own words needed for an article to be indexed (lead + body). */
export const MIN_NEWS_WORDS = 60;

/** A news article worth indexing: published and at least 60 words of our own. Pure. */
export function newsIsStrong(a: { lead: string; body: string }): boolean {
  return `${a.lead} ${a.body}`.split(/\s+/).filter(Boolean).length >= MIN_NEWS_WORDS;
}

// ---- Structured data ----

export interface NewsForJsonLd {
  slug: string;
  title: string;
  lead: string;
  publishedAt: Date;
  updatedAt: Date;
  sourceUrl: string | null;
  sourceName: string | null;
}

/**
 * schema.org NewsArticle: written and published by STAGEDIVE, based on the press item it links to,
 * about our bands (MusicGroup) and festival (Festival) with their pages. Only facts on the page.
 */
export function newsArticleJsonLd(
  a: NewsForJsonLd,
  opts: { image?: string | null; bands?: { slug: string; name: string }[]; festival?: { slug: string; name: string } | null } = {},
): Json {
  const url = abs(`/news/${a.slug}`);
  const org = { "@type": "Organization", "@id": `${abs("/")}#organization`, name: SITE_NAME, url: abs("/"), logo: { "@type": "ImageObject", url: abs(SHARE_FALLBACK_IMAGE) } };
  const about = [
    ...(opts.bands ?? []).map((b) => ({ "@type": "MusicGroup", name: b.name, url: abs(`/artists/${b.slug}`) })),
    ...(opts.festival ? [{ "@type": "Festival", name: opts.festival.name, url: abs(`/venues/${opts.festival.slug}`) }] : []),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${url}#article`,
    headline: a.title.slice(0, 110),
    description: a.lead,
    url,
    mainEntityOfPage: url,
    datePublished: a.publishedAt.toISOString(),
    dateModified: a.updatedAt.toISOString(),
    image: [abs(opts.image || SHARE_FALLBACK_IMAGE)],
    inLanguage: "en",
    author: org,
    publisher: org,
    ...(a.sourceUrl ? { isBasedOn: { "@type": "NewsArticle", url: a.sourceUrl, ...(a.sourceName ? { publisher: { "@type": "Organization", name: a.sourceName } } : {}) } } : {}),
    ...(about.length ? { about } : {}),
  };
}

// ---- Markdown copy (/news/<slug>.md) ----

export function newsMarkdown(
  a: { slug: string; title: string; lead: string; paragraphs: string[]; publishedAt: Date; sourceName: string | null; sourceUrl: string | null },
  bands: { slug: string; name: string; concerts: number }[],
  festival: { slug: string; name: string; concerts: number } | null,
): string {
  return [
    `# ${a.title}`,
    "",
    `Published ${a.publishedAt.toISOString().slice(0, 10)} by ${SITE_NAME}.`,
    "",
    `> ${a.lead}`,
    "",
    ...a.paragraphs.flatMap((p) => [p, ""]),
    ...(a.sourceUrl ? [`Source: [${a.sourceName ?? new URL(a.sourceUrl).hostname}](${a.sourceUrl})`, ""] : []),
    ...(bands.length || festival
      ? [
          "## Watch on " + SITE_NAME,
          "",
          ...bands.map((b) => `- [${watchLine(b.name, b.concerts)}](${abs(`/artists/${b.slug}`)})`),
          ...(festival ? [`- [Full concerts from ${festival.name}](${abs(`/venues/${festival.slug}`)}): ${plural(festival.concerts, "full concert")}`] : []),
          "",
        ]
      : []),
    `Page: ${abs(`/news/${a.slug}`)}`,
    "",
  ].join("\n");
}

// ---- Feeds and sitemaps ----

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Our own news as RSS 2.0 (/news/feed.xml), newest first, for feed readers and aggregators. Pure. */
export function newsRssXml(articles: { slug: string; title: string; lead: string; publishedAt: Date }[], now = new Date()): string {
  const link = abs("/news");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${xml(`${SITE_NAME} News`)}</title>`,
    `<link>${xml(link)}</link>`,
    `<description>${xml(NEWS_INDEX_DESCRIPTION)}</description>`,
    "<language>en</language>",
    `<lastBuildDate>${(articles[0]?.publishedAt ?? now).toUTCString()}</lastBuildDate>`,
    `<atom:link href="${xml(abs("/news/feed.xml"))}" rel="self" type="application/rss+xml"/>`,
    ...articles.map((a) => {
      const url = abs(`/news/${a.slug}`);
      return `<item><title>${xml(a.title)}</title><link>${xml(url)}</link><guid isPermaLink="true">${xml(url)}</guid><pubDate>${a.publishedAt.toUTCString()}</pubDate><description>${xml(clip(a.lead, 300))}</description></item>`;
    }),
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
}

/** Google News sitemaps list articles of the last two days only. */
export const NEWS_SITEMAP_HOURS = 48;

/** The articles a news sitemap may list: published within the last 48 hours, at most 1,000. Pure. */
export function newsSitemapWindow<T extends { publishedAt: Date }>(articles: T[], now = new Date()): T[] {
  const since = now.getTime() - NEWS_SITEMAP_HOURS * 3_600_000;
  return articles.filter((a) => a.publishedAt.getTime() >= since && a.publishedAt.getTime() <= now.getTime() + 3_600_000).slice(0, 1000);
}

/** A Google News sitemap (https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap). Pure. */
export function newsSitemapXml(articles: { slug: string; title: string; publishedAt: Date }[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
    ...articles.map(
      (a) =>
        `<url><loc>${xml(abs(`/news/${a.slug}`))}</loc><news:news><news:publication><news:name>${xml(SITE_NAME)}</news:name><news:language>en</news:language></news:publication><news:publication_date>${a.publishedAt.toISOString()}</news:publication_date><news:title>${xml(a.title)}</news:title></news:news></url>`,
    ),
    "</urlset>",
    "",
  ].join("\n");
}
