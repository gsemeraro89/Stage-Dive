// News by topic and by band (owner, 22 Nov 2026): pages built by themselves from the articles' `topic`
// and `bandSlugs`, for the searches people type about news ("rock tours 2027", "glastonbury 2027 lineup",
// "metallica news", "is metallica touring"):
// - topic hubs: /news/tours, /news/festivals, /news/live-albums, /news/new-music, /news/reunions;
// - a band's news: /artists/<slug>/news.
// Titles, answer-first leads, the strong-page rules and the Markdown copy are here; every new article
// updates them through the page templates, the sitemap and the llms files, with no manual step.
// Copy rules as everywhere (never "free", "archive", "upload", "full-length"). Pure; tests/news-hubs.test.ts.
import { abs } from "../seo";
import { SITE_NAME } from "../site";
import { listWords, plural } from "../text";

// ---- Topic hubs ----

export interface NewsHub {
  slug: string;
  /** The article topics it lists (src/lib/news/writer.ts TOPICS). */
  topics: string[];
  /** Short name (breadcrumbs, links). */
  label: string;
  /** Whether its title and heading carry the year (hubYear). */
  yearly: boolean;
  /** The search title (the layout adds " · STAGEDIVE"). */
  title: (year: number) => string;
  /** The page heading. */
  heading: (year: number) => string;
  /** What the hub is about, opening its lead ("Rock tour news for 2027"). */
  about: (year: number) => string;
  /** The link from an article to its hub ("More tour news"). */
  more: string;
}

export const NEWS_HUBS: NewsHub[] = [
  {
    slug: "tours",
    topics: ["tour"],
    label: "Tours",
    yearly: true,
    title: (y) => `Rock Tours ${y} · Tour Dates and News`,
    heading: (y) => `Rock tours ${y}`,
    about: (y) => `Rock tour news for ${y}`,
    more: "More tour news",
  },
  {
    slug: "festivals",
    topics: ["festival"],
    label: "Festivals",
    yearly: true,
    title: (y) => `Festival Line-ups ${y} · Rock Festival News`,
    heading: (y) => `Festival line-ups ${y}`,
    about: (y) => `Festival line-up news for ${y}`,
    more: "More festival news",
  },
  {
    slug: "live-albums",
    topics: ["live-release"],
    label: "Live albums",
    yearly: false,
    title: () => "New Live Albums · Rock Live Releases News",
    heading: () => "New live albums",
    about: () => "News of new live albums and concert films",
    more: "More live album news",
  },
  {
    slug: "new-music",
    topics: ["new-music"],
    label: "New music",
    yearly: true,
    title: (y) => `New Rock Albums ${y} · New Music News`,
    heading: (y) => `New rock albums ${y}`,
    about: (y) => `News of new rock albums and songs for ${y}`,
    more: "More new music news",
  },
  {
    slug: "reunions",
    topics: ["reunion"],
    label: "Reunions",
    yearly: false,
    title: () => "Band Reunions · Rock Reunion News",
    heading: () => "Band reunions",
    about: () => "Rock reunion news",
    more: "More reunion news",
  },
];

export const NEWS_HUB_SLUGS = NEWS_HUBS.map((h) => h.slug);

/** Words an article slug may never be: the hubs and the news list's own addresses. */
export const RESERVED_NEWS_SLUGS = new Set([...NEWS_HUB_SLUGS, "page", "feed", "feed-xml"]);

export function newsHub(slug: string): NewsHub | null {
  return NEWS_HUBS.find((h) => h.slug === slug) ?? null;
}

export const newsHubPath = (slug: string) => `/news/${slug}`;

/** The hub an article belongs to, by its topic; null for topics without one ("other"). */
export function hubForTopic(topic: string): NewsHub | null {
  return NEWS_HUBS.find((h) => h.topics.includes(topic)) ?? null;
}

/** Published articles a hub needs to be indexed and listed in the sitemap. */
export const NEWS_HUB_MIN = 3;

export function newsHubIsStrong(articles: number): boolean {
  return articles >= NEWS_HUB_MIN;
}

/** Articles per hub from articles per topic. Pure. */
export function hubCounts(byTopic: Map<string, number> | Record<string, number>): Map<string, number> {
  const get = (t: string) => (byTopic instanceof Map ? byTopic.get(t) : byTopic[t]) ?? 0;
  return new Map(NEWS_HUBS.map((h) => [h.slug, h.topics.reduce((n, t) => n + get(t), 0)]));
}

/**
 * The year a hub is about: the latest year this year or next named in its newest headlines (they only
 * carry years the source gives), else the year news searches are about (next year from October on). Pure.
 */
export function hubYear(titles: string[], now = new Date()): number {
  const y = now.getUTCFullYear();
  const named = titles.flatMap((t) => [...t.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]))).filter((x) => x === y || x === y + 1);
  return named.length ? Math.max(...named) : y + (now.getUTCMonth() >= 9 ? 1 : 0);
}

/** "3 November 2026". Pure. */
export function newsDay(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

interface LeadArticle {
  title: string;
  publishedAt: Date;
}

/** Names shown in a lead: at most five, then "and N more". */
function namesLine(names: string[]): string {
  const unique = [...new Set(names.filter(Boolean))];
  if (!unique.length) return "";
  const shown = unique.slice(0, 5);
  return unique.length > shown.length ? `${shown.join(", ")} and ${unique.length - shown.length} more` : listWords(shown);
}

/**
 * The hub's answer-first lead, from the articles we hold: what it covers, who is in it, how many stories
 * and the newest one. Pure.
 */
export function newsHubLead(hub: NewsHub, year: number, latest: LeadArticle[], total: number, names: string[]): string {
  if (!total || !latest.length) return `No ${hub.label.toLowerCase()} news on ${SITE_NAME} yet. Every story about the bands and festivals on the site is on the news page.`;
  const who = namesLine(names);
  return `${hub.about(year)} on ${SITE_NAME}: ${plural(total, "story", "stories")}${who ? ` about ${who}` : ""}, newest first, each with the full concerts to watch here. Latest, ${newsDay(latest[0].publishedAt)}: ${latest[0].title}.`;
}

/** The hub a news search should land on (src/lib/keywords.ts), from its words. Pure. */
export function newsHubForPhrase(p: string): string {
  if (/\btour|\btouring\b/.test(p)) return newsHubPath("tours");
  if (/\bline ?ups?\b|\bfestivals?\b/.test(p)) return newsHubPath("festivals");
  if (/\blive (album|albums|record|release)\b|\bconcert film\b/.test(p)) return newsHubPath("live-albums");
  if (/\bnew ((rock|metal|punk|indie) )?(album|albums|single|singles|song|songs|music|record|ep)\b/.test(p)) return newsHubPath("new-music");
  if (/\breunion|\breunite/.test(p)) return newsHubPath("reunions");
  return "/news";
}

// ---- A band's news ----

export const bandNewsPath = (slug: string) => `/artists/${slug}/news`;

/** Published articles a band's news page needs to be indexed and listed in the sitemap. */
export const BAND_NEWS_MIN = 2;

export function bandNewsIsStrong(articles: number): boolean {
  return articles >= BAND_NEWS_MIN;
}

/** "Metallica News · Tours, Albums and Live Shows" (the layout adds " · STAGEDIVE"). */
export function bandNewsTitle(name: string): string {
  return `${name} News · Tours, Albums and Live Shows`;
}

const TOPIC_WORDS: Record<string, string> = {
  tour: "tours and concert dates",
  festival: "festival line-ups",
  "live-release": "live albums and concert films",
  reunion: "reunions",
  anniversary: "anniversaries",
  "new-music": "new music",
  "line-up-change": "line-up changes",
};

/** "tours and concert dates, live albums and concert films and new music", most frequent first. Pure. */
export function topicWords(topics: string[]): string {
  const counts = new Map<string, number>();
  for (const t of topics) if (TOPIC_WORDS[t]) counts.set(t, (counts.get(t) ?? 0) + 1);
  return listWords([...counts].sort((a, b) => b[1] - a[1]).map(([t]) => TOPIC_WORDS[t]));
}

/** The band news page's answer-first lead, from the articles we hold. Pure. */
export function bandNewsLead(name: string, latest: (LeadArticle & { topic: string })[], total: number): string {
  if (!total || !latest.length) return `No news about ${name} on ${SITE_NAME} yet.`;
  const about = topicWords(latest.map((a) => a.topic));
  return `The latest ${name} news on ${SITE_NAME}: ${plural(total, "story", "stories")}${about ? ` about ${about}` : ""}, newest first. Latest, ${newsDay(latest[0].publishedAt)}: ${latest[0].title}.`;
}

// ---- Markdown copy of a hub (/news/<hub>.md) ----

export function newsHubMarkdown(
  hub: NewsHub,
  year: number,
  lead: string,
  articles: { slug: string; title: string; lead: string; publishedAt: Date }[],
  bands: { slug: string; name: string; concerts: number }[],
  festivals: { slug: string; name: string; concerts: number }[],
): string {
  return [
    `# ${hub.heading(year)}`,
    "",
    lead,
    "",
    ...(articles.length
      ? ["## News", "", ...articles.flatMap((a) => [`- [${a.title}](${abs(`/news/${a.slug}`)}) (${a.publishedAt.toISOString().slice(0, 10)}): ${a.lead}`]), ""]
      : []),
    ...(bands.length || festivals.length
      ? [
          `## Full concerts on ${SITE_NAME}`,
          "",
          ...bands.map((b) => `- [${b.name}](${abs(`/artists/${b.slug}`)}): ${plural(b.concerts, "full concert")}`),
          ...festivals.map((f) => `- [${f.name}](${abs(`/venues/${f.slug}`)}): ${plural(f.concerts, "full concert")}`),
          "",
        ]
      : []),
    `Page: ${abs(newsHubPath(hub.slug))}`,
    "",
  ].join("\n");
}
