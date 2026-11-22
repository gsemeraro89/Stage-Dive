// Press feeds for the news section (owner, 21 Nov 2026: news only about the music we cover).
// Public RSS/Atom feeds of the rock, metal, punk and indie press (data/news-feeds.json). We read the
// headline and the short summary only (the article page when it can be read, for the fact check), keep
// the items about our bands and festivals (match.ts) and write our own short article that links back.
// Ported from OpenDecks/FullDJSet (src/lib/news/feeds.ts). Pure parts tested in tests/news.test.ts.
import feedFile from "../../../data/news-feeds.json";

export interface Feed {
  /** Shown as the source on the article ("Source: Blabbermouth"). */
  name: string;
  url: string;
  active?: boolean;
}

/** Every feed of data/news-feeds.json, switched off ones too (the admin op news-feeds checks them all). */
export const ALL_FEEDS: Feed[] = (feedFile.feeds as Feed[]).map(({ name, url, active }) => ({ name, url, active }));
/** The feeds to read: data/news-feeds.json, active ones only. */
export const FEEDS: Feed[] = ALL_FEEDS.filter((f) => f.active !== false);

export interface FeedItem {
  title: string;
  url: string;
  publishedAt: Date | null;
  /** The feed's summary as plain text, cut to 1,500 characters. */
  summary: string;
  /** The full text when the feed carries it (WordPress content:encoded), cut to 6,000 characters. */
  content: string;
  /** The item's categories/tags as the feed gives them ("Metallica", "Tour Dates"). */
  categories: string[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…" };

/** HTML or XML text to plain text: CDATA, tags and entities removed, spaces collapsed. Pure. */
export function plainText(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : null;
}

/** Items of an RSS 2.0 or Atom feed, in the feed's order. Pure. */
export function parseFeed(xml: string): FeedItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const items: FeedItem[] = [];
  for (const b of blocks) {
    const title = plainText(tag(b, "title") ?? "");
    let url = plainText(tag(b, "link") ?? "");
    if (!url) url = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "";
    if (!url) url = plainText(tag(b, "guid") ?? "");
    const date = tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date");
    const parsed = date ? new Date(plainText(date)) : null;
    const summary = plainText(tag(b, "description") ?? tag(b, "summary") ?? tag(b, "content") ?? "").slice(0, 1500);
    const content = plainText(tag(b, "content:encoded") ?? "").slice(0, 6000);
    const categories = [
      ...[...b.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)].map((m) => plainText(m[1])),
      ...[...b.matchAll(/<category[^>]*\bterm="([^"]+)"[^>]*\/?>/gi)].map((m) => plainText(m[1])),
    ].filter(Boolean);
    if (!title || !/^https?:\/\//.test(url)) continue;
    items.push({ title, url: url.trim(), publishedAt: parsed && !isNaN(parsed.getTime()) ? parsed : null, summary, content, categories });
  }
  return items;
}

const USER_AGENT = "StagediveNewsBot/1.0 (+https://fullconcert.live/news)";

/** One feed's items; an unreachable or broken feed gives an error instead of throwing. */
export async function readFeed(feed: Feed, fetcher: typeof fetch = fetch): Promise<{ items: FeedItem[]; error?: string }> {
  try {
    const res = await fetcher(feed.url, { headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { items: [], error: `HTTP ${res.status}` };
    const items = parseFeed(await res.text());
    return items.length ? { items } : { items, error: "no items (not a feed?)" };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** The article page's own text (paragraphs only), for writing and checking facts. Cut to 6,000 characters. */
export async function readArticle(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  try {
    const res = await fetcher(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, signal: AbortSignal.timeout(20_000), redirect: "follow" });
    if (!res.ok) return "";
    return articleText(await res.text());
  } catch {
    return "";
  }
}

/** The text of a page's <p> paragraphs (inside <article> when that holds the text). Pure. */
export function articleText(html: string): string {
  const paras = (scope: string) => (scope.match(/<p[\s>][\s\S]*?<\/p>/gi) ?? []).map(plainText).filter((p) => p.length > 40).join("\n");
  const article = html.match(/<article[\s>][\s\S]*?<\/article>/i)?.[0];
  const inArticle = article ? paras(article) : "";
  return (inArticle.length >= 300 ? inArticle : paras(html)).slice(0, 6000);
}
