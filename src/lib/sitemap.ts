// The list of pages search engines should index (sitemap.xml), also used by IndexNow
// (scripts/indexnow.ts). Only pages worth indexing are listed, by the same rules as the pages' own
// robots tags (src/lib/seo.ts), so Google is never sent to a page that then says "noindex".
// Everything comes from the database: a new concert, a new setlist or a new bio puts its page (and
// the band, venue, venue-year, genre, decade, tour, song and "best of" pages it strengthens) in the
// sitemap by itself.
// buildSitemap is pure (tests/sitemap.test.ts); sitemapEntries reads the database.
import { decadeOf, parseDecade } from "./catalogue";
import { getDb } from "./db";
import { VISIBLE } from "./filters";
import { PAGE_ARTIST, songCatalogue } from "./queries";
import { bandIsStrong, concertIsStrong, hubIsStrong, songIndexIsStrong, songIsStrong } from "./seo";
import { bandSongsPath, songPath } from "./songs";
import { bestIsStrong, bestPath, bestSlugsFor } from "./best";
import { HD_PATH, hdIsStrong } from "./hd";
import { newsIsStrong } from "./news/seo";

export interface SitemapEntry {
  path: string;
  lastModified?: Date;
  priority: number;
  changeFrequency: "daily" | "weekly" | "monthly";
}

/** What the sitemap needs to know about one visible concert. */
export interface SitemapConcert {
  slug: string;
  updatedAt: Date;
  hasSetlist: boolean;
  curated: boolean;
  writeUp: string | null;
  performedYear: number | null;
  venueSlug: string | null;
  /** "festival", "room"... (the "best of" rankings by kind of place). */
  venueKindSlug?: string | null;
  tourSlug: string | null;
  /** Every band credited (headline or guest), as on the band pages. */
  artistSlugs: string[];
  genreSlugs: string[];
  /** A bootleg: indexed by the same strong-page rule as any concert, but never counted in the rankings. */
  bootleg?: boolean;
  /** YouTube reports the video in HD (the /hd page, src/lib/hd.ts). */
  hd?: boolean;
}

/** A band with a page (a headline concert of its own). */
export interface SitemapBand {
  slug: string;
  updatedAt: Date;
  bio: string | null;
}

/** A band's songs played live (src/lib/songs.ts, src/lib/queries.ts songCatalogue). */
export interface SitemapSongBand {
  slug: string;
  setlists: number;
  songs: { slug: string; versions: number; updatedAt: Date }[];
}

/** A published news article (src/lib/news): listed when it has enough words of our own. */
export interface SitemapNews {
  slug: string;
  updatedAt: Date;
  lead: string;
  body: string;
}

/** The pages that are always listed (the index pages). */
export const FIXED_PAGES: SitemapEntry[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/concerts", priority: 0.9, changeFrequency: "daily" },
  { path: "/artists", priority: 0.9, changeFrequency: "daily" },
  { path: "/venues", priority: 0.7, changeFrequency: "weekly" },
  { path: "/genres", priority: 0.7, changeFrequency: "weekly" },
  { path: "/decades", priority: 0.7, changeFrequency: "weekly" },
  { path: "/tours", priority: 0.6, changeFrequency: "weekly" },
];

const later = (a: Date | undefined, b: Date) => (!a || b > a ? b : a);

/** Count concerts per key and keep the newest change. */
function tally(concerts: SitemapConcert[], keys: (c: SitemapConcert) => (string | null)[]) {
  const out = new Map<string, { count: number; updated?: Date }>();
  for (const c of concerts)
    for (const k of new Set(keys(c)))
      if (k) {
        const e = out.get(k) ?? { count: 0 };
        out.set(k, { count: e.count + 1, updated: later(e.updated, c.updatedAt) });
      }
  return out;
}

export function buildSitemap(concerts: SitemapConcert[], bands: SitemapBand[], songBands: SitemapSongBand[] = [], news: SitemapNews[] = []): SitemapEntry[] {
  const strongNews = news.filter(newsIsStrong);
  const byBand = tally(concerts, (c) => c.artistSlugs);
  const hubs = (keys: (c: SitemapConcert) => (string | null)[], path: (k: string) => string, priority: number, changeFrequency: SitemapEntry["changeFrequency"]) =>
    [...tally(concerts, keys)]
      .filter(([, v]) => hubIsStrong(v.count))
      .map(([k, v]): SitemapEntry => ({ path: path(k), lastModified: v.updated, priority, changeFrequency }));

  // Rankings are official concerts only (owner, 20 Nov 2026), as on the pages (src/lib/queries.ts bestCatalogue).
  const best = [...tally(concerts.filter((c) => !c.bootleg), bestSlugsFor)]
    .filter(([, v]) => bestIsStrong(v))
    .map(([k, v]): SitemapEntry => ({ path: bestPath(k), lastModified: v.updated, priority: 0.6, changeFrequency: "daily" }));
  // Full concerts in HD: official ones only, as on the page; listed from ten.
  const hd = concerts.filter((c) => c.hd && !c.bootleg);
  if (hdIsStrong(hd.length)) {
    best.push({ path: HD_PATH, lastModified: hd.reduce<Date | undefined>((d, c) => later(d, c.updatedAt), undefined), priority: 0.6, changeFrequency: "daily" });
  }
  if (best.length) best.unshift({ path: "/best", lastModified: best.reduce<Date | undefined>((d, e) => later(d, e.lastModified!), undefined), priority: 0.7, changeFrequency: "daily" });
  return [
    ...FIXED_PAGES,
    ...bands
      .filter((b) => bandIsStrong({ concerts: byBand.get(b.slug)?.count ?? 0, bio: b.bio }))
      .map((b): SitemapEntry => ({ path: `/artists/${b.slug}`, lastModified: later(byBand.get(b.slug)?.updated, b.updatedAt), priority: 0.8, changeFrequency: "weekly" })),
    ...hubs((c) => [c.venueSlug], (k) => `/venues/${k}`, 0.7, "weekly"),
    // Festival and venue years ("Pinkpop 1995"), from two concerts that year (src/lib/venue-years.ts).
    ...hubs((c) => [c.venueSlug && c.performedYear ? `${c.venueSlug}/${c.performedYear}` : null], (k) => `/venues/${k}`, 0.6, "monthly"),
    ...hubs((c) => c.genreSlugs, (k) => `/genres/${k}`, 0.7, "weekly"),
    ...hubs((c) => [c.performedYear && parseDecade(decadeOf(c.performedYear)) !== null ? decadeOf(c.performedYear) : null], (k) => `/decades/${k}`, 0.6, "weekly"),
    ...hubs((c) => [c.tourSlug], (k) => `/tours/${k}`, 0.6, "monthly"),
    // "Best of" rankings from ten concerts (src/lib/best.ts); views change every night.
    ...best,
    ...concerts
      .filter(concertIsStrong)
      .map((c): SitemapEntry => ({ path: `/concerts/${c.slug}`, lastModified: c.updatedAt, priority: 0.7, changeFrequency: "monthly" })),
    // Songs played live: a band's songs page from 5 songs and 2 setlists, a song page from 2 live versions.
    ...songBands
      .filter((b) => songIndexIsStrong({ songs: b.songs.length, setlists: b.setlists }))
      .map((b): SitemapEntry => ({
        path: bandSongsPath(b.slug),
        lastModified: new Date(Math.max(...b.songs.map((s) => s.updatedAt.getTime()))),
        priority: 0.6,
        changeFrequency: "weekly",
      })),
    ...songBands.flatMap((b) =>
      b.songs
        .filter((s) => songIsStrong(s.versions))
        .map((s): SitemapEntry => ({ path: songPath(b.slug, s.slug), lastModified: s.updatedAt, priority: 0.5, changeFrequency: "monthly" })),
    ),
    // News (owner, 21 Nov 2026): the list and every article with enough words of our own.
    ...(strongNews.length
      ? [{ path: "/news", lastModified: strongNews.reduce<Date | undefined>((d, n) => later(d, n.updatedAt), undefined), priority: 0.8, changeFrequency: "daily" as const }]
      : []),
    ...strongNews.map((n): SitemapEntry => ({ path: `/news/${n.slug}`, lastModified: n.updatedAt, priority: 0.6, changeFrequency: "monthly" })),
  ];
}

/** Concerts whose write-up decides whether they are strong: no setlist and not hand-picked (concertIsStrong). */
export const WRITE_UP_DECIDES = { setlistSource: null, curated: false } as const;

/** Every page worth indexing, read from the database. */
export async function sitemapEntries(): Promise<SitemapEntry[]> {
  const db = getDb();
  const [concerts, writeUps, bands, songBands, news] = await Promise.all([
    db.concert.findMany({
      where: VISIBLE,
      select: {
        id: true,
        slug: true,
        updatedAt: true,
        setlistSource: true,
        curated: true,
        performedYear: true,
        sourceKind: true,
        definition: true,
        venue: { select: { slug: true } },
        venueKind: { select: { slug: true } },
        tour: { select: { slug: true } },
        credits: { select: { artist: { select: { slug: true } } } },
        genres: { select: { genre: { select: { slug: true } } } },
      },
    }),
    // The write-up only decides for concerts with no setlist and no hand-pick (concertIsStrong): only theirs
    // is read (22 Nov 2026: every write-up on each rebuild was a large share of the sitemap's data transfer).
    db.concert.findMany({ where: { ...VISIBLE, ...WRITE_UP_DECIDES }, select: { id: true, writeUp: true } }),
    db.artist.findMany({ where: PAGE_ARTIST, select: { slug: true, updatedAt: true, bio: true } }),
    songCatalogue(),
    db.newsArticle.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true, lead: true, body: true } }),
  ]);
  const writeUpOf = new Map(writeUps.map((w) => [w.id, w.writeUp]));
  return buildSitemap(
    concerts.map((c) => ({
      slug: c.slug,
      updatedAt: c.updatedAt,
      // The setlist and its source are written together (src/lib/setlist/lookup.ts).
      hasSetlist: c.setlistSource !== null,
      curated: c.curated,
      writeUp: writeUpOf.get(c.id) ?? null,
      performedYear: c.performedYear,
      venueSlug: c.venue?.slug ?? null,
      venueKindSlug: c.venueKind?.slug ?? null,
      tourSlug: c.tour?.slug ?? null,
      artistSlugs: c.credits.map((a) => a.artist.slug),
      genreSlugs: c.genres.map((g) => g.genre.slug),
      bootleg: c.sourceKind === "FAN_PRO_SHOT",
      hd: c.definition === "hd",
    })),
    bands,
    songBands,
    news,
  );
}
