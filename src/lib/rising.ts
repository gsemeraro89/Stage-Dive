// "Searched this week" (owner, 26 Nov 2026: growth task). A short, hand-kept list of pages Google already
// shows us for, in positions 8 to 20, linked from the home page and the /artists, /concerts and /venues hubs
// so they climb to page one; the links also lead crawlers to pages they have been skipping.
//
// HOW THE DAILY REVIEW MAINTAINS IT (Search Console, last 7 days, Performance > Pages and Queries):
// - Add a page whose query sits in positions 8-20: { path, label, since: today }. The label is the query as
//   people type it, pointed at the page that should rank: band + "setlists" / "full concerts", or
//   "<band> live at <festival> <year>" for one concert. If Google shows a LIST page (/artists, /concerts,
//   /venues) for a band's name, link the band's own page, or its strongest concert while the band page is thin.
// - Remove an entry once its page reaches the top 5, or 4 weeks after `since` (it then drops out by itself:
//   RISING_MAX_DAYS).
// - Eight links at most are shown (MAX_RISING), in the order written here: put the best chances first.
// - Copy rules as everywhere: never "free", "archive", "upload", "full-length"; no "YouTube".
// Safe by construction: risingLinks() keeps only pages that exist and are strong enough to be indexed
// (the same rules as their robots tags and the sitemap, src/lib/seo.ts), so a stale entry never makes a
// broken link or boosts a noindex page. Pure parts tested in tests/rising.test.ts.
import { getDb } from "./db";
import { VISIBLE } from "./filters";
import { cached } from "./memo";
import { PAGE_ARTIST } from "./queries";
import { bandIsStrong, concertIsStrong, hubIsStrong } from "./seo";

export interface RisingTarget {
  /** A page on the site: /artists/<slug>, /concerts/<slug>, /venues/<slug>, /genres/<slug> or /tours/<slug>. */
  path: string;
  /** The link's words, the way people search. */
  label: string;
  /** The day it was added (YYYY-MM-DD); it drops out RISING_MAX_DAYS later. */
  since: string;
}

export interface RisingLink {
  path: string;
  label: string;
}

/** The most links shown at once. */
export const MAX_RISING = 8;
/** An entry is dropped this many days after it was added (the review re-adds it if it is still climbing). */
export const RISING_MAX_DAYS = 28;

/** Search Console, 18-26 Nov 2026. */
export const RISING: RisingTarget[] = [
  // "radiohead setlist": the band page at 16.75.
  { path: "/artists/radiohead", label: "Radiohead setlists", since: "2026-11-26" },
  // "limp bizkit": /venues/pinkpop at 10.
  { path: "/concerts/limp-bizkit-pinkpop-2001", label: "Limp Bizkit live at Pinkpop 2001", since: "2026-11-26" },
  // "pinkpop": /venues/pinkpop at 4 (kept: it carries the Limp Bizkit search).
  { path: "/venues/pinkpop", label: "Pinkpop full concerts", since: "2026-11-26" },
  // "kvelertak": the /artists list at 17.
  { path: "/artists/kvelertak", label: "Kvelertak full concerts", since: "2026-11-26" },
  // "killing joke band": the /artists list at 5.
  { path: "/artists/killing-joke", label: "Killing Joke full concerts", since: "2026-11-26" },
  // "ypsigrock": the /concerts list at 13 and /venues at 12; the festival page is thin, its concert is not.
  { path: "/concerts/the-national-ypsigrock-2019", label: "The National live at Ypsigrock 2019", since: "2026-11-26" },
  // "grandbrothers": the /artists list at 19; the band page is thin, its concert (with a setlist) is not.
  { path: "/concerts/grandbrothers-kolner-dom-2022", label: "Grandbrothers live at Kölner Dom 2022", since: "2026-11-26" },
  // "teksuo": the /artists list at 6; same as Grandbrothers.
  { path: "/concerts/teksuo-resurrection-fest-estrella-galicia-2024", label: "Teksuo live at Resurrection Fest 2024", since: "2026-11-26" },
];

/** Words the copy rules ban from visible text (CLAUDE.md). */
export const RISING_BANNED = /\bfree\b|archiv|upload|full-length|youtube/i;

/** A label that may be shown: some words, none of the banned ones. */
export function labelIsClean(label: string): boolean {
  return label.trim().length > 0 && !RISING_BANNED.test(label);
}

export type RisingKind = "artist" | "concert" | "venue" | "genre" | "tour";
const KINDS: Record<string, RisingKind> = { artists: "artist", concerts: "concert", venues: "venue", genres: "genre", tours: "tour" };

/** "/artists/radiohead" -> { kind: "artist", slug: "radiohead" }; anything else (a list, a sub-page, a full URL) -> null. */
export function parseRisingPath(path: string): { kind: RisingKind; slug: string } | null {
  const m = /^\/([a-z]+)\/([a-z0-9][a-z0-9-]*)$/.exec(path);
  const kind = m && KINDS[m[1]];
  return kind ? { kind, slug: m[2] } : null;
}

/** True while an entry is younger than RISING_MAX_DAYS (an entry with a date that cannot be read is dropped). */
export function isFresh(since: string, today: Date): boolean {
  const start = Date.parse(`${since}T00:00:00Z`);
  if (Number.isNaN(start)) return false;
  return today.getTime() - start < RISING_MAX_DAYS * 86_400_000;
}

/**
 * The links to show: entries that are fresh, have a clean label and a page that exists and is strong (`strong`,
 * read from the database), once each, in the written order, MAX_RISING at most.
 */
export function pickRising(targets: RisingTarget[], strong: Set<string>, today: Date, max = MAX_RISING): RisingLink[] {
  const seen = new Set<string>();
  const out: RisingLink[] = [];
  for (const t of targets) {
    if (out.length >= max) break;
    if (seen.has(t.path) || !strong.has(t.path) || !labelIsClean(t.label) || !isFresh(t.since, today)) continue;
    seen.add(t.path);
    out.push({ path: t.path, label: t.label.trim() });
  }
  return out;
}

/**
 * Which of these paths lead to a page that exists and is worth indexing, by the rules the pages use for their
 * own robots tag: a band from two concerts or one and a bio, a concert with a setlist, a hand-pick or a long
 * write-up, a venue, genre or tour from two concerts. One small query per kind, for the listed slugs only.
 */
export async function strongPaths(paths: string[]): Promise<Set<string>> {
  const slugs: Record<RisingKind, string[]> = { artist: [], concert: [], venue: [], genre: [], tour: [] };
  for (const p of paths) {
    const t = parseRisingPath(p);
    if (t) slugs[t.kind].push(t.slug);
  }
  const db = getDb();
  const visibleCount = { select: { concerts: { where: VISIBLE } } };
  const [artists, concerts, venues, genres, tours] = await Promise.all([
    slugs.artist.length
      ? db.artist.findMany({
          where: { slug: { in: slugs.artist }, ...PAGE_ARTIST },
          select: { slug: true, bio: true, _count: { select: { credits: { where: { concert: VISIBLE } } } } },
        })
      : [],
    slugs.concert.length
      ? db.concert.findMany({ where: { ...VISIBLE, slug: { in: slugs.concert } }, select: { slug: true, setlistSource: true, curated: true, writeUp: true } })
      : [],
    slugs.venue.length ? db.venue.findMany({ where: { slug: { in: slugs.venue } }, select: { slug: true, _count: visibleCount } }) : [],
    slugs.genre.length
      ? db.genre.findMany({ where: { slug: { in: slugs.genre } }, select: { slug: true, _count: { select: { concerts: { where: { concert: VISIBLE } } } } } })
      : [],
    slugs.tour.length ? db.tour.findMany({ where: { slug: { in: slugs.tour } }, select: { slug: true, _count: visibleCount } }) : [],
  ]);
  return new Set([
    ...artists.filter((a) => bandIsStrong({ concerts: a._count.credits, bio: a.bio })).map((a) => `/artists/${a.slug}`),
    ...concerts
      .filter((c) => concertIsStrong({ hasSetlist: c.setlistSource !== null, curated: c.curated, writeUp: c.writeUp }))
      .map((c) => `/concerts/${c.slug}`),
    ...venues.filter((v) => hubIsStrong(v._count.concerts)).map((v) => `/venues/${v.slug}`),
    ...genres.filter((g) => hubIsStrong(g._count.concerts)).map((g) => `/genres/${g.slug}`),
    ...tours.filter((t) => hubIsStrong(t._count.concerts)).map((t) => `/tours/${t.slug}`),
  ]);
}

/** The "Searched this week" links as they stand (cached like other page data, src/lib/memo.ts). */
export const risingLinks = cached("rising-links", async (): Promise<RisingLink[]> => {
  const fresh = RISING.filter((t) => isFresh(t.since, new Date()));
  return pickRising(fresh, await strongPaths(fresh.map((t) => t.path)), new Date());
});
