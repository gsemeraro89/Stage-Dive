// Everything the homepage shows (brand book board 04, "homepage"), section by section. Data only: the
// page and its look are built from src/components/zine. Each section is empty, never broken, when there
// is not enough data yet; the page leaves an empty section out.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homeLead, type HomeTotals } from "./answers";
import { bestHeading, bestIsStrong, bestPath, type BestList } from "./best";
import { decadeOf, GENRES } from "./catalogue";
import { getDb } from "./db";
import { OFFICIAL_ONLY, VISIBLE } from "./filters";
import { HD_PATH, HD_WHERE, hdIsStrong } from "./hd";
import { liveAlbumViews, type LiveAlbumView } from "./live-albums";
import { cached } from "./memo";
import type { FestivalPhotoView } from "./news/festival-photos";
import { newsCoverSources } from "./news/covers";
import { listNews, type NewsListItem } from "./news/queries";
import { bandPhotosFor, type BandPhotoView } from "./photos/view";
import {
  bestCatalogue,
  bestConcerts,
  decadeIndex,
  defaultMapArtist,
  findConcertViews,
  getMap,
  hdCount,
  listArtists,
  listTours,
  songCatalogue,
  type ArtistCard,
  type ConcertView,
  type Cover,
  type MapArtist,
} from "./queries";
import { MIN_SONG_VERSIONS } from "./seo";
import { readSetlist, type SetlistView } from "./setlist/view";
import { countryName } from "./places";
import { songPath } from "./songs";
import { thumbnailSources } from "./thumbnails";

// ---------- The issue number ----------

/** Issue No.001 is the week of 16 Nov 2026 (a Monday, UTC); a new issue every Monday. */
export const FIRST_ISSUE_MONDAY = Date.UTC(2026, 10, 16);
const WEEK_MS = 7 * 86_400_000;

/** Weeks since issue 1 (0 for issue 1). Never below 0. */
export function weekNumber(now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - FIRST_ISSUE_MONDAY) / WEEK_MS));
}

/** "No.001" */
export function issueLabel(now: Date): string {
  return `No.${String(weekNumber(now) + 1).padStart(3, "0")}`;
}

/** One item per week, in turn (the gig of the week changes on Monday). */
export function pickForWeek<T>(items: T[], now: Date): T | null {
  return items.length ? items[weekNumber(now) % items.length] : null;
}

// ---------- Fixed lines (brand book board 04) ----------

/** One marker line per decade, from the homepage board. */
export const DECADE_LINES: Record<string, string> = {
  "1960s": "feedback gets invented",
  "1970s": "arenas vs. CBGB",
  "1980s": "post-punk + hardcore",
  "1990s": "grunge, riot grrrl, Britpop",
  "2000s": "garage rock comes back",
  "2010s": "festival headliner era",
  "2020s": "the new loud",
};

/** "Sort by noise": genres from the quietest to the loudest. */
export const NOISE_ORDER: readonly (typeof GENRES)[number][] = [
  "trip hop",
  "shoegaze",
  "art pop / experimental",
  "indie",
  "new wave / synth",
  "post-punk",
  "classic rock",
  "alternative",
  "garage",
  "grunge",
  "stoner",
  "emo / post-hardcore",
  "electronic rock / big beat",
  "punk",
  "hard rock",
  "metal",
];

// ---------- Owner picks (data/home-picks.json) ----------

/**
 * Hand-written by the owner, never generated: "the night that…" is a true story about one gig, so it
 * only appears when the owner has written one. The gig of the week can be pinned too.
 */
export interface HomePicks {
  /** YouTube ID of a concert to show as gig of the week instead of the weekly rotation. */
  gigOfTheWeek?: string | null;
  nightThat?: { youtubeId: string; headline: string; story: string } | null;
}

export function readHomePicks(file = join(process.cwd(), "data", "home-picks.json")): HomePicks {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as HomePicks;
    const night = raw.nightThat;
    return {
      gigOfTheWeek: typeof raw.gigOfTheWeek === "string" ? raw.gigOfTheWeek : null,
      nightThat:
        night && typeof night.youtubeId === "string" && night.headline?.trim() && night.story?.trim()
          ? { youtubeId: night.youtubeId, headline: night.headline.trim(), story: night.story.trim() }
          : null,
    };
  } catch {
    return {};
  }
}

// ---------- The sections ----------

export interface HomeData {
  issue: string;
  /** The big one at the top, with its setlist when it has one. */
  gigOfTheWeek: { concert: ConcertView; setlist: SetlistView | null; photo: BandPhotoView | null } | null;
  /** "Fresh off the copier": the newest gigs on the site (by when they were added, not uploaded). */
  fresh: ConcertView[];
  /** "Pick a decade": decades that have gigs, oldest first, with the board's marker line. */
  decades: { label: string; start: number; count: number; line: string | null }[];
  /** "Where it happened": the fields (festivals) and the rooms, most gigs first. */
  fields: { slug: string; name: string; city: string | null; country: string | null; count: number }[];
  rooms: { slug: string; name: string; city: string | null; country: string | null; count: number }[];
  /** "Most played": by plays on the site in the last 30 days; by YouTube views until there are plays. */
  mostPlayed: { concert: ConcertView; plays: number }[];
  mostPlayedBy: "plays" | "views";
  /** "the night that…": only when the owner wrote one. */
  nightThat: { concert: ConcertView; headline: string; story: string } | null;
  /** "Sort by noise": genres quiet to loud, with how many gigs each has (0 = not on the wall yet). */
  noise: { slug: string; name: string; count: number }[];
  /** Photos (photocopied, licensed) for the bands on this page, by band slug. */
  photos: Record<string, BandPhotoView>;
}

const mainSlug = (c: ConcertView) => c.artists.find((a) => a.role === "MAIN")?.slug ?? c.artists[0]?.slug;

async function gigOfTheWeek(now: Date, picks: HomePicks) {
  let concert: ConcertView | null = null;
  if (picks.gigOfTheWeek) [concert = null] = await findConcertViews({ where: { youtubeId: picks.gigOfTheWeek }, take: 1 });
  if (!concert) {
    // Weekly rotation over the bands, A–Z; each band's best gig: one with a setlist first, then the longest.
    const bands = await getDb().artist.findMany({
      where: { credits: { some: { role: "MAIN", concert: VISIBLE } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const band = pickForWeek(bands, now);
    if (!band) return null;
    const withSetlist = await findConcertViews({
      where: { credits: { some: { artistId: band.id, role: "MAIN" } }, setlistSource: { not: null } },
      orderBy: [{ durationSeconds: "desc" }, { id: "asc" }],
      take: 1,
    });
    [concert = null] = withSetlist.length
      ? withSetlist
      : await findConcertViews({ where: { credits: { some: { artistId: band.id, role: "MAIN" } } }, orderBy: [{ durationSeconds: "desc" }, { id: "asc" }], take: 1 });
  }
  if (!concert) return null;
  const stored = await getDb().concert.findUnique({ where: { id: concert.id }, select: { setlist: true, setlistSource: true } });
  return { concert, setlist: readSetlist(stored?.setlist, stored?.setlistSource ?? null) };
}

/** Venue-kind slugs: festivals are "the fields"; rooms, livestreams and TV studios are "the rooms". */
const PLACE_KINDS = { festival: ["festival"], room: ["room", "livestream", "tv-studio"] } as const;

async function places(kind: "festival" | "room", take: number) {
  const venues = await getDb().venue.findMany({
    where: { concerts: { some: { ...VISIBLE, venueKind: { slug: { in: [...PLACE_KINDS[kind]] } } } } },
    select: { slug: true, name: true, city: true, country: true, _count: { select: { concerts: { where: VISIBLE } } } },
  });
  return venues
    .map((v) => ({ slug: v.slug, name: v.name, city: v.city, country: countryName(v.country), count: v._count.concerts }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, take);
}

async function mostPlayed(now: Date, take: number): Promise<{ list: { concert: ConcertView; plays: number }[]; by: "plays" | "views" }> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const counted = await getDb().play.groupBy({
    by: ["concertId"],
    where: { startedAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { concertId: "desc" } },
    take: take * 2,
  });
  if (counted.length >= take) {
    const views = new Map((await findConcertViews({ where: { id: { in: counted.map((c) => c.concertId) } } })).map((v) => [v.id, v]));
    const list = counted.flatMap((c) => (views.has(c.concertId) ? [{ concert: views.get(c.concertId)!, plays: c._count._all }] : [])).slice(0, take);
    if (list.length >= take) return { list, by: "plays" };
  }
  const byViews = await findConcertViews({ where: {}, orderBy: [{ viewCount: "desc" }, { id: "asc" }], take });
  return { list: byViews.map((concert) => ({ concert, plays: 0 })), by: "views" };
}

async function noise() {
  const genres = await getDb().genre.findMany({
    select: { slug: true, name: true, _count: { select: { concerts: { where: { concert: VISIBLE } } } } },
  });
  const byName = new Map(genres.map((g) => [g.name, g]));
  return NOISE_ORDER.flatMap((name) => {
    const g = byName.get(name);
    return g ? [{ slug: g.slug, name: g.name, count: g._count.concerts }] : [];
  });
}

async function homeDataUncached(now: Date = new Date()): Promise<HomeData> {
  const picks = readHomePicks();
  const [gig, fresh, decades, fields, rooms, played, genres] = await Promise.all([
    gigOfTheWeek(now, picks),
    findConcertViews({ where: {}, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 6 }),
    decadeIndex(),
    places("festival", 6),
    places("room", 6),
    mostPlayed(now, 5),
    noise(),
  ]);
  let nightThat: HomeData["nightThat"] = null;
  if (picks.nightThat) {
    const [c] = await findConcertViews({ where: { youtubeId: picks.nightThat.youtubeId }, take: 1 });
    if (c) nightThat = { concert: c, headline: picks.nightThat.headline, story: picks.nightThat.story };
  }
  const slugs = [gig?.concert, ...fresh, ...played.list.map((p) => p.concert), nightThat?.concert]
    .filter((c): c is ConcertView => Boolean(c))
    .map(mainSlug)
    .filter((s): s is string => Boolean(s));
  const photos = await bandPhotosFor(slugs);
  const gigSlug = gig ? mainSlug(gig.concert) : undefined;
  return {
    issue: issueLabel(now),
    gigOfTheWeek: gig ? { ...gig, photo: (gigSlug && photos.get(gigSlug)) || null } : null,
    fresh,
    decades: decades.map((d) => ({ ...d, line: DECADE_LINES[d.label] ?? null })),
    fields,
    rooms,
    mostPlayed: played.list,
    mostPlayedBy: played.by,
    nightThat,
    noise: genres,
    photos: Object.fromEntries(photos),
  };
}

/** Cached for a few minutes (src/lib/memo.ts), like the other lists. */
export const homeData = cached("homeData", homeDataUncached);

/** Every field (festival) or room with a visible gig, with town and count, most gigs first. Cached. */
export const listPlaces = cached("listPlaces", (kind: "festival" | "room") => places(kind, 10_000));

export { decadeOf };

// =====================================================================================================
// The new homepage (owner, 24 Nov 2026: "the best of the site"). Data only, for the designer's two
// directions: homepageData() returns every section in one cached call. The old homeData() above keeps
// the current page working until the new one replaces it.
// Every section can be empty (a new or small catalogue): the page leaves an empty section out.
// YouTube rules: only visible concerts (findConcertViews and VISIBLE everywhere), official concerts before
// bootlegs in every list, bootlegs marked (ConcertView.bootleg) and kept out of the "best of" rankings.
// Database reads stay lean (Neon bills compute and transfer): the shared cached lists are reused
// (listArtists, decadeIndex, listTours, bestCatalogue, hdCount, songCatalogue, newsCoverSources), the
// rest reads only the columns it shows, and the whole result is cached (src/lib/memo.ts).
// =====================================================================================================

/** Site totals for the hero and the lead sentence (homeLead in src/lib/answers.ts). */
export interface SiteTotals extends HomeTotals {
  /** Visible concerts, official and bootlegs. */
  concerts: number;
  official: number;
  bootlegs: number;
  /** Bands with a page of their own (a visible concert they headline). */
  bands: number;
  /** Visible concerts with a setlist. */
  withSetlist: number;
  /** Festivals and venues with a visible concert, and the split. */
  places: number;
  festivals: number;
  venues: number;
}

/**
 * A picture for a band or a place. Rules (design/DESIGN.md section 6): a photo (licensed Commons photo,
 * already photocopied) may be cropped and always shows its credit, linked to `photo.sourcePage`; a concert
 * picture (`kind: "concert"`) is a YouTube thumbnail shown whole and untouched, or a channel avatar when
 * `cover.portrait` is true (square, shown whole).
 */
export type HomePicture =
  | { kind: "band-photo"; photo: BandPhotoView }
  | { kind: "festival-photo"; photo: FestivalPhotoView }
  | { kind: "concert"; cover: Cover };

export interface HomeBand {
  slug: string;
  name: string;
  href: string;
  /** Visible concerts with this band (official and bootlegs). */
  concerts: number;
  picture: HomePicture | null;
}

export interface HomePlace {
  slug: string;
  name: string;
  href: string;
  /** "festival" when any of its concerts was played at a festival, else "venue" (club, hall, arena, studio). */
  kind: "festival" | "venue";
  city: string | null;
  country: string | null;
  concerts: number;
  /** First and last year played; null when no concert there has a year. */
  years: { from: number; to: number } | null;
  picture: HomePicture | null;
}

export interface HomeRanking {
  slug: string;
  href: string;
  /** "Most Watched Rock Concerts of the 1990s" */
  heading: string;
  /** Short name: "All time", "The 1990s", "Festival shows". */
  label: string;
  /** Concerts in the full ranking (it shows at most BEST_SIZE). */
  count: number;
  /** The top five, most watched first. Official only. */
  concerts: ConcertView[];
}

export interface HomeShelf {
  /** "/hd", "/concerts?source=bootleg"; null when there is no page listing the whole shelf yet. */
  href: string | null;
  /** How many the whole shelf has. */
  count: number;
  concerts: ConcertView[];
}

export interface HomeLiveAlbum {
  /** The album as MusicBrainz names it, its year, and its MusicBrainz page. */
  title: string;
  year: number | null;
  url: string;
  /** Our concert that the album records. */
  concert: ConcertView;
}

export interface HomepageData {
  issue: string;
  /** AEO: the answer-first lead sentence, from the totals (empty when there is no concert yet). */
  lead: string;
  hero: {
    gig: { concert: ConcertView; setlist: SetlistView | null; photo: BandPhotoView | null } | null;
    totals: SiteTotals;
  };
  /** Bands with the most concerts. */
  legends: HomeBand[];
  /** Festivals and venues with the most concerts. */
  places: HomePlace[];
  /** Newest concerts added, official first. */
  fresh: ConcertView[];
  /** Three "best of" rankings, top five each: all time, one decade (changes weekly), festival shows. */
  bestOf: HomeRanking[];
  /** The front-page story (the newest with a picture, as on /news) and the next three. */
  news: { href: "/news"; lead: NewsListItem | null; more: NewsListItem[] };
  shelves: {
    /** Official concerts in HD, most watched first. */
    hd: HomeShelf;
    /** Bootlegs ("From the fans"), most watched first. */
    fans: HomeShelf;
    /** Concerts released as a live album (MusicBrainz), most watched first. */
    liveAlbums: { href: null; count: number; albums: HomeLiveAlbum[] };
  };
  waysIn: {
    decades: { label: string; href: string; count: number; line: string | null }[];
    genres: { slug: string; name: string; href: string; count: number }[];
    tours: { slug: string; name: string; href: string; band: { slug: string; name: string } | null; count: number }[];
    songs: { title: string; href: string; band: { slug: string; name: string }; versions: number }[];
  };
  /** "Find your next band": today's band and its wall (null when it cannot be read), and the genre order. */
  nextBand: { wall: { centre: ArtistCard; artists: MapArtist[] } | null; noise: { slug: string; name: string; count: number }[] };
}

export const LEGENDS_SIZE = 12;
export const PLACES_SIZE = 10;
export const FRESH_SIZE = 8;
export const RANKING_TOP = 5;
export const SHELF_SIZE = 6;
export const NEWS_MORE = 3;
export const WAYS_IN = { genres: 8, tours: 6, songs: 8 } as const;

// ---------- Pure helpers (tests/homepage.test.ts) ----------

/** Concert counts per place from a groupBy over (venue, kind): count, festival or not, year span. Pure. */
export function foldPlaces(
  rows: { venueId: number | null; venueKindId: number | null; count: number; minYear: number | null; maxYear: number | null }[],
  festivalKindIds: Set<number>,
): Map<number, { concerts: number; festival: boolean; years: { from: number; to: number } | null }> {
  const out = new Map<number, { concerts: number; festival: boolean; years: { from: number; to: number } | null }>();
  for (const r of rows) {
    if (r.venueId === null) continue;
    const p = out.get(r.venueId) ?? { concerts: 0, festival: false, years: null };
    p.concerts += r.count;
    if (r.venueKindId !== null && festivalKindIds.has(r.venueKindId)) p.festival = true;
    if (r.minYear !== null && r.maxYear !== null)
      p.years = p.years ? { from: Math.min(p.years.from, r.minYear), to: Math.max(p.years.to, r.maxYear) } : { from: r.minYear, to: r.maxYear };
    out.set(r.venueId, p);
  }
  return out;
}

/**
 * The three rankings on the homepage, from those worth showing (bestIsStrong): all time, one decade (a
 * different one each week, like the gig of the week) and festival shows. A missing one is replaced by the
 * next strong ranking (genres first), so there are three whenever three exist. Pure.
 */
export function pickRankings(lists: BestList[], now: Date, take = 3): BestList[] {
  const strong = lists.filter(bestIsStrong);
  const wanted = [
    strong.find((l) => l.kind === "all"),
    pickForWeek(
      strong.filter((l) => l.kind === "decade"),
      now,
    ),
    strong.find((l) => l.kind === "place" && l.key === "festival"),
  ].filter((l): l is BestList => Boolean(l));
  const rest = [...strong.filter((l) => l.kind === "genre"), ...strong].filter((l) => !wanted.includes(l));
  return [...new Set([...wanted, ...rest])].slice(0, take);
}

/** The most played songs on the site (versions with a setlist), from the song catalogue; only songs with a page worth showing. Pure. */
export function topSongs(
  catalogue: { slug: string; name: string; songs: { slug: string; title: string; versions: number }[] }[],
  take: number,
): HomepageData["waysIn"]["songs"] {
  return catalogue
    .flatMap((b) => b.songs.filter((s) => s.versions >= MIN_SONG_VERSIONS).map((s) => ({ title: s.title, href: songPath(b.slug, s.slug), band: { slug: b.slug, name: b.name }, versions: s.versions })))
    .sort((a, b) => b.versions - a.versions || a.band.name.localeCompare(b.band.name) || a.title.localeCompare(b.title))
    .slice(0, take);
}

/** Front-page story and the next ones from a news list: the list's lead (newest with a picture), else the newest. Pure. */
export function frontPage<T extends { id: number; isLead?: boolean }>(articles: T[], more: number): { lead: T | null; more: T[] } {
  const lead = articles.find((a) => a.isLead) ?? articles[0] ?? null;
  return { lead, more: articles.filter((a) => a !== lead).slice(0, more) };
}

// ---------- Database reads ----------

async function siteTotals() {
  const db = getDb();
  const [bySource, withSetlist] = await Promise.all([
    db.concert.groupBy({ by: ["sourceKind"], where: VISIBLE, _count: { _all: true } }),
    db.concert.count({ where: { ...VISIBLE, setlistSource: { not: null } } }),
  ]);
  const official = bySource.find((r) => r.sourceKind === "OFFICIAL")?._count._all ?? 0;
  const bootlegs = bySource.find((r) => r.sourceKind === "FAN_PRO_SHOT")?._count._all ?? 0;
  return { official, bootlegs, concerts: official + bootlegs, withSetlist };
}

/** Every place with a visible concert: counts, kind and years from one grouped read; names for all (a few kB). */
async function placeIndex() {
  const db = getDb();
  const [groups, kinds] = await Promise.all([
    db.concert.groupBy({
      by: ["venueId", "venueKindId"],
      where: { ...VISIBLE, venueId: { not: null } },
      _count: { _all: true },
      _min: { performedYear: true },
      _max: { performedYear: true },
    }),
    db.venueKind.findMany({ where: { slug: "festival" }, select: { id: true } }),
  ]);
  const folded = foldPlaces(
    groups.map((g) => ({ venueId: g.venueId, venueKindId: g.venueKindId, count: g._count._all, minYear: g._min.performedYear, maxYear: g._max.performedYear })),
    new Set(kinds.map((k) => k.id)),
  );
  return folded;
}

async function topPlaces(folded: Awaited<ReturnType<typeof placeIndex>>, festivalPhotos: Map<string, FestivalPhotoView>, take: number): Promise<HomePlace[]> {
  const db = getDb();
  const venues = await db.venue.findMany({ where: { id: { in: [...folded.keys()] } }, select: { id: true, slug: true, name: true, city: true, country: true } });
  const top = venues
    .map((v) => ({ ...v, ...folded.get(v.id)! }))
    .sort((a, b) => b.concerts - a.concerts || a.name.localeCompare(b.name))
    .slice(0, take);
  // Each place's most watched concert, official first (only for the places without a photo).
  const needThumb = top.filter((p) => !festivalPhotos.has(p.slug)).map((p) => p.id);
  const thumbs = needThumb.length
    ? await db.concert.findMany({
        where: { ...VISIBLE, venueId: { in: needThumb } },
        distinct: ["venueId"],
        orderBy: [{ venueId: "asc" }, { sourceKind: "asc" }, { viewCount: "desc" }, { id: "asc" }],
        select: { venueId: true, youtubeId: true, thumbnailUrl: true },
      })
    : [];
  const thumbBy = new Map(thumbs.map((t) => [t.venueId, t]));
  return top.map((p) => {
    const photo = festivalPhotos.get(p.slug);
    const t = thumbBy.get(p.id);
    const picture: HomePicture | null = photo
      ? { kind: "festival-photo", photo }
      : t
        ? { kind: "concert", cover: { youtubeId: t.youtubeId, thumbnail: thumbnailSources(t.youtubeId, t.thumbnailUrl), portrait: false } }
        : null;
    return {
      slug: p.slug,
      name: p.name,
      href: `/venues/${p.slug}`,
      kind: p.festival ? ("festival" as const) : ("venue" as const),
      city: p.city,
      country: countryName(p.country),
      concerts: p.concerts,
      years: p.years,
      picture,
    };
  });
}

/** Concerts released as live albums (MusicBrainz, tied to our concert only when certain): count and the most watched. */
async function liveAlbumShelf(take: number): Promise<{ count: number; albums: HomeLiveAlbum[] }> {
  const db = getDb();
  const albums = await db.artistLiveAlbum.findMany({ select: { artistId: true, mbid: true, title: true, year: true } });
  if (!albums.length) return { count: 0, albums: [] };
  const artistIds = [...new Set(albums.map((a) => a.artistId))];
  const concerts = await db.concert.findMany({
    where: { ...VISIBLE, credits: { some: { artistId: { in: artistIds }, role: "MAIN" } } },
    select: { id: true, slug: true, performedYear: true, viewCount: true, sourceKind: true, venue: { select: { name: true } }, credits: { where: { role: "MAIN" }, select: { artistId: true } } },
  });
  const matched: { album: LiveAlbumView; concertId: number; official: boolean; views: number }[] = [];
  for (const artistId of artistIds) {
    const own = concerts.filter((c) => c.credits.some((x) => x.artistId === artistId));
    const views = liveAlbumViews(
      albums.filter((a) => a.artistId === artistId),
      own,
    );
    for (const v of views) {
      const c = v.concert && own.find((o) => o.slug === v.concert!.slug);
      if (c) matched.push({ album: v, concertId: c.id, official: c.sourceKind === "OFFICIAL", views: c.viewCount });
    }
  }
  // Official first, then most watched; one album per concert.
  const seen = new Set<number>();
  const unique = matched
    .sort((a, b) => Number(b.official) - Number(a.official) || b.views - a.views || a.concertId - b.concertId)
    .filter((m) => !seen.has(m.concertId) && Boolean(seen.add(m.concertId)));
  const shown = unique.slice(0, take);
  const views = new Map((await findConcertViews({ where: { id: { in: shown.map((m) => m.concertId) } } })).map((v) => [v.id, v]));
  return {
    count: unique.length,
    albums: shown.flatMap((m) => {
      const concert = views.get(m.concertId);
      return concert ? [{ title: m.album.title, year: m.album.year, url: m.album.url, concert }] : [];
    }),
  };
}

async function homepageDataUncached(now: Date = new Date()): Promise<HomepageData> {
  const picks = readHomePicks();
  const [gig, totals, artists, folded, sources, fresh, catalogue, hdTotal, hd, fans, liveAlbums, news, decades, genres, tours, songs, wall] = await Promise.all([
    gigOfTheWeek(now, picks),
    siteTotals(),
    listArtists(),
    placeIndex(),
    newsCoverSources(),
    findConcertViews({ where: {}, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: FRESH_SIZE }),
    bestCatalogue(),
    hdCount(),
    findConcertViews({ where: { AND: [OFFICIAL_ONLY, HD_WHERE] }, orderBy: [{ viewCount: "desc" }, { id: "asc" }], take: SHELF_SIZE }),
    findConcertViews({ where: { sourceKind: "FAN_PRO_SHOT" }, orderBy: [{ viewCount: "desc" }, { id: "asc" }], take: SHELF_SIZE }),
    liveAlbumShelf(SHELF_SIZE),
    listNews({ take: 1 + NEWS_MORE }),
    decadeIndex(),
    noise(),
    listTours(),
    songCatalogue().catch(() => []),
    // An extra: if the wall cannot be read, the page goes out without it.
    defaultMapArtist(now)
      .then((slug) => (slug ? getMap(slug) : null))
      .catch(() => null),
  ]);

  const rankings = pickRankings(catalogue, now);
  const rankedConcerts = await Promise.all(rankings.map((l) => bestConcerts(l, RANKING_TOP)));

  const legendRows = [...artists].sort((a, b) => b.concerts - a.concerts || a.name.localeCompare(b.name)).slice(0, LEGENDS_SIZE);
  const gigSlug = gig ? mainSlug(gig.concert) : undefined;
  const [photos, places] = await Promise.all([
    bandPhotosFor([...legendRows.map((a) => a.slug), ...(gigSlug ? [gigSlug] : [])]),
    topPlaces(folded, sources.festivalPhotos, PLACES_SIZE),
  ]);

  const placeTotals = [...folded.values()];
  const siteTotal: SiteTotals = {
    ...totals,
    bands: artists.length,
    places: placeTotals.length,
    festivals: placeTotals.filter((p) => p.festival).length,
    venues: placeTotals.filter((p) => !p.festival).length,
  };

  return {
    issue: issueLabel(now),
    lead: homeLead(siteTotal),
    hero: { gig: gig ? { ...gig, photo: (gigSlug && photos.get(gigSlug)) || null } : null, totals: siteTotal },
    legends: legendRows.map((a) => {
      const photo = photos.get(a.slug);
      return {
        slug: a.slug,
        name: a.name,
        href: `/artists/${a.slug}`,
        concerts: a.concerts,
        picture: photo ? { kind: "band-photo" as const, photo } : a.cover ? { kind: "concert" as const, cover: a.cover } : null,
      };
    }),
    places,
    fresh,
    bestOf: rankings
      .map((l, i) => ({ slug: l.slug, href: bestPath(l.slug), heading: bestHeading(l), label: l.label, count: l.count, concerts: rankedConcerts[i] }))
      .filter((r) => r.concerts.length > 0),
    news: { href: "/news", ...frontPage(news.articles, NEWS_MORE) },
    shelves: {
      hd: { href: hdIsStrong(hdTotal) ? HD_PATH : null, count: hdTotal, concerts: hd },
      fans: { href: `/concerts?source=bootleg`, count: totals.bootlegs, concerts: fans },
      liveAlbums: { href: null, ...liveAlbums },
    },
    waysIn: {
      decades: decades.map((d) => ({ label: d.label, href: `/decades/${d.label}`, count: d.count, line: DECADE_LINES[d.label] ?? null })),
      genres: genres
        .filter((g) => g.count > 0)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, WAYS_IN.genres)
        .map((g) => ({ ...g, href: `/genres/${g.slug}` })),
      tours: [...tours]
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, WAYS_IN.tours)
        .map((t) => ({ slug: t.slug, name: t.name, href: `/tours/${t.slug}`, band: t.artist ?? null, count: t.count })),
      songs: topSongs(songs, WAYS_IN.songs),
    },
    nextBand: { wall, noise: genres },
  };
}

/** Everything the new homepage shows, in one call; cached (src/lib/memo.ts) on top of the page's revalidate = 600. */
export const homepageData = cached("homepageData", homepageDataUncached);
