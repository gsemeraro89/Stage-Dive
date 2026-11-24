// AI and search crawlers (owner, 24 Nov 2026: see which AI bots read which pages). Ported from
// OpenDecks, with two STAGEDIVE additions: the type of page each hit read, and counting in memory
// so the database (Neon, billed by compute time) is written in batches, not on every request.
// Everything here is pure and tested (tests/crawlers.test.ts); the database part is
// src/lib/crawler-hits.ts.

/** [name shown in the counts, pattern in the User-Agent]. First match wins. AI assistants first. */
export const CRAWLERS: [string, RegExp][] = [
  ["OAI-SearchBot", /OAI-SearchBot/i],
  ["ChatGPT-User", /ChatGPT-User/i],
  ["GPTBot", /GPTBot/i],
  ["Claude-SearchBot", /Claude-SearchBot/i],
  ["Claude-User", /Claude-User/i],
  ["ClaudeBot", /ClaudeBot|anthropic-ai/i],
  ["PerplexityBot", /PerplexityBot/i],
  ["Perplexity-User", /Perplexity-User/i],
  ["Google-Extended", /Google-Extended/i],
  ["Applebot-Extended", /Applebot-Extended/i],
  ["Applebot", /Applebot/i],
  ["Meta-ExternalAgent", /meta-externalagent|meta-externalfetcher|FacebookBot/i],
  ["Amazonbot", /Amazonbot/i],
  ["DuckAssistBot", /DuckAssistBot/i],
  ["MistralAI-User", /MistralAI-User/i],
  ["Bytespider", /Bytespider/i],
  ["CCBot", /CCBot/i],
  ["cohere-ai", /cohere-ai|cohere-training/i],
  ["YouBot", /YouBot/i],
  ["Googlebot", /Googlebot/i],
  ["Bingbot", /bingbot/i],
  ["DuckDuckBot", /DuckDuckBot/i],
  ["YandexBot", /YandexBot/i],
];

/** Crawlers that work for AI assistants (the rest are search engines). */
export const SEARCH_BOTS = new Set(["Googlebot", "Bingbot", "DuckDuckBot", "YandexBot"]);
export const AI_BOTS = new Set(CRAWLERS.map(([n]) => n).filter((n) => !SEARCH_BOTS.has(n)));

const ANY = new RegExp(CRAWLERS.map(([, r]) => r.source).join("|"), "i");

/** The crawler's name, or null for a person's browser. */
export function crawlerOf(userAgent: string | null | undefined): string | null {
  if (!userAgent || !ANY.test(userAgent)) return null;
  return CRAWLERS.find(([, r]) => r.test(userAgent))?.[0] ?? null;
}

export const PAGE_KINDS = ["concert", "artist", "venue", "news", "song", "list", "md", "llms", "sitemap", "robots", "other"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

/** Lists and hubs: the home page, the concert list, best-of, decades, genres, tours, HD, map, photos. */
const LIST_PATH = /^\/(concerts|artists|venues|songs|best|decades|genres|tours|hd|map|photos)(\/.*)?$/;

/** The type of page a crawler read, by its path (before Next's rewrites, so ".md" copies are seen as such). */
export function pageKindOf(pathname: string): PageKind {
  const path = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (path === "/robots.txt") return "robots";
  if (path === "/llms.txt" || path === "/llms-full.txt") return "llms";
  if (/^\/([a-z0-9-]*-)?sitemap(-[a-z0-9-]+)?(\.xml)?$|^\/sitemap\/.+\.xml$/.test(path)) return "sitemap";
  if (path.endsWith(".md") || path === "/md" || path.startsWith("/md/")) return "md";
  if (/^\/concerts\/[^/]+$/.test(path)) return "concert";
  if (/^\/artists\/[^/]+(\/.*)?$/.test(path)) return "artist";
  if (/^\/venues\/[^/]+(\/.*)?$/.test(path)) return "venue";
  if (path === "/news" || path.startsWith("/news/")) return "news";
  if (/^\/songs\/[^/]+(\/.*)?$/.test(path)) return "song";
  if (path === "/" || LIST_PATH.test(path)) return "list";
  return "other";
}

// ---- Counting in memory, written in batches ----

/** One row of crawler_hits waiting to be written: the hits since the last write. */
export type PendingHit = {
  day: string; // YYYY-MM-DD (UTC)
  bot: string;
  hits: number;
  kinds: Partial<Record<PageKind, number>>;
  lastPath: string;
  lastAt: Date;
};

export type HitCounter = {
  pending: Map<string, PendingHit>;
  /** When the counts were last taken for writing (ms since epoch). */
  lastFlushAt: number;
  /** Hits not counted because the map was full (should stay 0: there are ~25 bots). */
  dropped: number;
};

/** At most one write every 5 minutes (Neon is billed by compute time). */
export const FLUSH_INTERVAL_MS = 5 * 60 * 1000;
/** Cap on (day, bot) rows held in memory between writes. */
export const MAX_PENDING = 200;
/** Paths are cut to this length. */
const MAX_PATH = 300;

export function newHitCounter(now = Date.now()): HitCounter {
  return { pending: new Map(), lastFlushAt: now, dropped: 0 };
}

/** Counts one hit in memory. Returns false when it was dropped because the map is full. */
export function addHit(counter: HitCounter, bot: string, pathname: string, now: Date, max = MAX_PENDING): boolean {
  const day = now.toISOString().slice(0, 10);
  const key = `${day}|${bot}`;
  let row = counter.pending.get(key);
  if (!row) {
    if (counter.pending.size >= max) {
      counter.dropped++;
      return false;
    }
    row = { day, bot, hits: 0, kinds: {}, lastPath: "", lastAt: now };
    counter.pending.set(key, row);
  }
  const kind = pageKindOf(pathname);
  row.hits++;
  row.kinds[kind] = (row.kinds[kind] ?? 0) + 1;
  if (now >= row.lastAt) {
    row.lastAt = now;
    row.lastPath = pathname.slice(0, MAX_PATH);
  }
  return true;
}

/** Whether it is time to write: something to write and the interval has passed since the last write. */
export function flushDue(counter: HitCounter, now: number, interval = FLUSH_INTERVAL_MS): boolean {
  return counter.pending.size > 0 && now - counter.lastFlushAt >= interval;
}

/** Milliseconds until the next write may happen. */
export function msUntilFlush(counter: HitCounter, now: number, interval = FLUSH_INTERVAL_MS): number {
  return Math.max(0, counter.lastFlushAt + interval - now);
}

/** Takes everything waiting to be written and empties the counter. */
export function takeBatch(counter: HitCounter, now: number): PendingHit[] {
  const rows = [...counter.pending.values()];
  counter.pending.clear();
  counter.lastFlushAt = now;
  counter.dropped = 0;
  return rows;
}
