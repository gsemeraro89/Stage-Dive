// Search engines (owner, 19 Nov 2026: SEO, AEO and AI search are the main way people will find the
// site). Ported from OpenDecks/FullDJSet and adapted to concerts.
// - Which pages may be indexed: only on the live site (SITE_INDEXABLE=true), and only pages with
//   enough of their own content, so a new domain is not judged on thousands of thin pages. The rest
//   stay reachable and followed (noindex,follow). The sitemap (src/lib/sitemap.ts) uses the same
//   rules, so it never lists a page that then says "noindex".
// - Page titles and descriptions written the way people search ("Radiohead at Glastonbury 1997 ·
//   Full Concert + Setlist"), "·" as the separator; the site name is added by the layout's template.
// - Structured data lives in src/lib/structured-data.ts; answers in src/lib/answers.ts.
// Pure functions, tested in tests/seo.test.ts.
import { DOMAIN_BRAND_NAMES, genreSearchName, shortDecade } from "./keyword-targets";
import { SITE_NAME, siteUrl } from "./site";

/** True only on the live site with its final domain. The test service and local copies are never indexed. */
export function siteIsIndexable(): boolean {
  return process.env.SITE_INDEXABLE === "true";
}

/** Absolute URL of a path on the site. */
export function abs(path: string): string {
  return path.startsWith("http") ? path : `${siteUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
}

// ---- What is worth indexing ----

/** A write-up at least this long is enough original content for a concert page on its own. */
export const MIN_WRITEUP_FOR_INDEX = 400;

/** A concert page with original content worth indexing: a setlist, a hand-pick or a longer write-up. */
export function concertIsStrong(c: { hasSetlist: boolean; curated: boolean; writeUp: string | null }): boolean {
  return c.hasSetlist || c.curated || (c.writeUp?.trim().length ?? 0) >= MIN_WRITEUP_FOR_INDEX;
}

/** A venue, genre, decade or tour page needs at least this many concerts (one would repeat that concert's page). */
export const MIN_HUB_CONCERTS = 2;

export function hubIsStrong(concerts: number): boolean {
  return concerts >= MIN_HUB_CONCERTS;
}

/** A festival-year or venue-year page ("Pinkpop 1995") needs two concerts played there that year. */
export function venueYearIsStrong(concerts: number): boolean {
  return hubIsStrong(concerts);
}

/** A "best of" ranking (src/lib/best.ts) is worth indexing from this many concerts. */
export const MIN_BEST_CONCERTS = 10;

export function bestListIsStrong(concerts: number): boolean {
  return concerts >= MIN_BEST_CONCERTS;
}

/** A band page is worth indexing with two or more concerts, or one concert and a bio. */
export function bandIsStrong(b: { concerts: number; bio: string | null }): boolean {
  return b.concerts >= 2 || (b.concerts >= 1 && Boolean(b.bio?.trim()));
}

/** A song page is worth indexing from this many live versions (one would repeat that concert's setlist). */
export const MIN_SONG_VERSIONS = 2;

export function songIsStrong(versions: number): boolean {
  return versions >= MIN_SONG_VERSIONS;
}

/** A band's "songs played live" page needs this many songs, from at least two setlists. */
export const MIN_INDEX_SONGS = 5;
export const MIN_INDEX_SETLISTS = 2;

export function songIndexIsStrong(s: { songs: number; setlists: number }): boolean {
  return s.songs >= MIN_INDEX_SONGS && s.setlists >= MIN_INDEX_SETLISTS;
}

/**
 * An indexable page: indexed, links followed, with large image and full video previews in search results
 * (26 Nov 2026). Written out on every indexable page, not left to the layout: a page whose metadata says
 * `robots: undefined` replaces the layout's value with nothing, so the previews were lost on those pages.
 */
export const INDEX_ROBOTS = { index: true, follow: true, "max-image-preview": "large", "max-video-preview": -1, "max-snippet": -1 } as const;

/**
 * Robots value for a page: never index anything but the live site; there, index the page when it is
 * worth it (INDEX_ROBOTS), else keep it out of the index but let its links be followed.
 */
export function robotsFor(worthIndexing: boolean): typeof INDEX_ROBOTS | { index: false; follow: boolean } {
  if (!siteIsIndexable()) return { index: false, follow: false };
  return worthIndexing ? INDEX_ROBOTS : { index: false, follow: true };
}

/**
 * A page that is not found (src/app/not-found.tsx). Next.js already writes <meta name="robots" content="noindex">
 * on every 404; without this the root layout's default ("index, follow, max-video-preview...") was written
 * too, so a 404 carried two contradicting robots tags. `robots: null` drops the inherited one.
 */
export const NOT_FOUND_METADATA = { title: "Page Not Found", robots: null } as const;

// ---- Titles and descriptions ----

/** The home page (keyword targets: "full concert(s)", "full concert live", "full rock concerts"). */
export const HOME_TITLE = `Full Concerts Live · Full Rock Concerts and Setlists · ${SITE_NAME}`;
export const HOME_DESCRIPTION =
  "Full concerts, the whole show: full rock concerts live, entire concerts and full festival shows, by band, decade, genre and tour, with setlists you can click.";

/**
 * The other ways people type the brand, so "stage dive" is read as this site, not as a phrase; and the
 * live domain (owner, 20 Nov 2026: https://fullconcert.live) with its spoken form "Full Concert Live".
 */
export const SITE_ALTERNATE_NAMES = ["Stage Dive", "Stagedive", "STAGEDIVE", "stagedive", ...DOMAIN_BRAND_NAMES];

/** "new wave / synth" -> "New Wave / Synth" (genre names are stored lower case). */
export function titleCase(s: string): string {
  return s.replace(/(^|[\s/(-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

const hasYear = (s: string) => /\b(19|20)\d{2}\b/.test(s);

interface ConcertForTitle {
  title: string;
  credits: string;
  venue: { name: string } | null;
  city: string | null;
  performedYear: number | null;
  hasSetlist: boolean;
  /** A bootleg says so in its title (owner, 20 Nov 2026). */
  bootleg?: unknown;
}

/**
 * The search title of a concert: "Radiohead at Glastonbury 1997 · Full Concert + Setlist"; a bootleg:
 * "Nirvana at Teatro Castello 1991 · Full Concert (Bootleg) + Setlist".
 * The year is the year it was played (never the year the video went online). Without a place or a
 * year we keep the video's own title, which usually names the gig better than we can.
 */
export function concertSearchTitle(c: ConcertForTitle): string {
  const kind = `Full Concert${c.bootleg ? " (Bootleg)" : ""}${c.hasSetlist ? " + Setlist" : ""}`;
  const place = c.venue?.name ?? c.city;
  const year = c.performedYear && !(place && hasYear(place)) ? ` ${c.performedYear}` : "";
  if (place) return `${c.credits} at ${place}${year} · ${kind}`;
  if (c.performedYear) return `${c.credits} Live ${c.performedYear} · ${kind}`;
  return `${c.title || c.credits} · ${kind}`;
}

/** "Metallica · Full Concerts and Setlists" */
export function bandSearchTitle(name: string, anySetlist: boolean): string {
  return `${name} · Full Concerts${anySetlist ? " and Setlists" : ""}`;
}

/**
 * A band page's meta description. People search "<band> setlist(s)" (Search Console, 28 Nov 2026), so
 * when the band has setlists the description opens with them: "Metallica setlists and full concerts: 70
 * full concerts on STAGEDIVE, each with its setlist." and goes on with the bio (or else the page's
 * lead). Without setlists: the lead and the bio, as before. At most 300 characters.
 */
export function bandSearchDescription(
  band: { name: string; bio?: string | null },
  counts: { concerts: number; setlists: number },
  lead: string,
): string {
  if (!counts.setlists || !counts.concerts) return clip([lead, band.bio].filter(Boolean).join(" "), 300);
  const n = `${counts.concerts} full concert${counts.concerts === 1 ? "" : "s"}`;
  const which = counts.setlists === counts.concerts ? (counts.concerts === 1 ? "with its setlist" : "each with its setlist") : `${counts.setlists} with the setlist`;
  return clip(`${band.name} setlists and full concerts: ${n} on ${SITE_NAME}, ${which}. ${band.bio || lead}`, 300);
}

/** "Pinkpop · Full Concerts and Setlists" */
export function venueSearchTitle(name: string, anySetlist: boolean): string {
  return `${name} · Full Concerts${anySetlist ? " and Setlists" : ""}`;
}

/** "Pinkpop 1995 · Full Concerts and Setlists" (the year is not repeated when the name has it). */
export function venueYearSearchTitle(name: string, year: number, anySetlist: boolean): string {
  return `${venueYearName(name, year)} · Full Concerts${anySetlist ? " and Setlists" : ""}`;
}

/** "Pinkpop 1995"; a name that already carries the year ("Woodstock 1969") stays as it is. */
export function venueYearName(name: string, year: number): string {
  return name.includes(String(year)) ? name : `${name} ${year}`;
}

/**
 * "Full Grunge Concerts · Live Shows and Setlists", written the way people search a genre ("full metal
 * concert", "full trip hop concert"; src/lib/keyword-targets.ts). A double genre goes by the name people
 * type ("new wave / synth" -> "Full New Wave Concerts"); the description carries the whole name.
 */
export function genreSearchTitle(name: string, anySetlist: boolean): string {
  return `Full ${genreSearchName(name)} Concerts · Live Shows${anySetlist ? " and Setlists" : ""}`;
}

/** "Full 1990s Rock Concerts · Live 90s Rock Shows and Setlists" ("90s rock concerts" is how people search). */
export function decadeSearchTitle(label: string, anySetlist: boolean): string {
  return `Full ${label} Rock Concerts · Live ${shortDecade(label)} Rock Shows${anySetlist ? " and Setlists" : ""}`;
}

/** "Metallica · Wherever We May Roam Tour · Full Concerts" ("Tour" is added when the name lacks it). */
export function tourSearchTitle(tour: string, band: string | null): string {
  const name = /\btour\b/i.test(tour) ? tour : `${tour} Tour`;
  return `${band ? `${band} · ` : ""}${name} · Full Concerts`;
}

/** "Creep Live · Radiohead · Every Live Version" ("Live Version" while there is only one): people search "creep live". */
export function songSearchTitle(song: string, band: string, versions: number): string {
  return `${song} Live · ${band} · ${versions > 1 ? "Every Live Version" : "Live Version"}`;
}

/** "Radiohead · Songs Played Live" */
export function bandSongsSearchTitle(band: string): string {
  return `${band} · Songs Played Live`;
}

/** A description cut to fit a search result (about 160 characters), at a word, with an ellipsis. */
export function clip(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.·-]+$/, "")}…`;
}

// ---- Sharing ----

/**
 * The share picture when a page has none of its own. No pictures are generated on the server (the
 * Render server has 512 MB; OpenDecks dropped next/og for memory). The designer may replace this
 * with a 1200x630 share card in public/.
 */
export const SHARE_FALLBACK_IMAGE = "/share-card.png";

/** Open Graph images: the page's own photo or thumbnail when it has one, else the site's mark. */
export function shareImages(src?: string | null): { url: string }[] {
  return [{ url: abs(src || SHARE_FALLBACK_IMAGE) }];
}

/** The site's own name with a page name, for places that do not use the layout's title template. */
export function withSiteName(title: string): string {
  return `${title} · ${SITE_NAME}`;
}
