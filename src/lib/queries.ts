// All database reads for the pages. Every query only returns concerts that may be shown and embedded.
import { getDb } from "./db";
import { buildOrderBy, buildWhere, VISIBLE, type ConcertFilters } from "./filters";
import { formatCredits } from "./format";
import { thumbnailSources, type ThumbnailSources } from "./thumbnails";
import { cached } from "./memo";
import { decadeOf, parseDecade } from "./catalogue";
import { pickForDay } from "./rotation";
import { artistSlugsIn, linkArtists, readSetlist, type SetlistView } from "./setlist/view";
import { buildQueue, relatedByGenre } from "./upnext";
import { layoutMap } from "./similarity/layout";
import { nameKey } from "./collector/musicbrainz";
import { concertNotes, type ConcertNote, type SiblingConcert } from "./concert-notes";
import { bandSongs, setlistCount, setlistSongs, songLinker, type SongConcert } from "./songs";
import { MIN_SONG_VERSIONS, venueYearName } from "./seo";
import { venueYearPath, type VenueYear, type VenueYearLink } from "./venue-years";
import { BEST_SIZE, bestHeading, bestIsStrong, bestLists, shownIn, type BestList } from "./best";

/**
 * Artists that have their own page (owner rule, 13 Nov 2026): only artists with a concert of their own
 * on the site. A guest ("with") never gets a page from someone else's concert, however well known:
 * the name stays plain text in that concert's credits, out of lists, the map and suggestions.
 */
export const PAGE_ARTIST = { credits: { some: { role: "MAIN" as const, concert: VISIBLE } } };

const concertInclude = {
  credits: {
    include: { artist: { include: { _count: { select: { credits: { where: { role: "MAIN" as const, concert: VISIBLE } } } } } } },
    orderBy: { position: "asc" as const },
  },
  venue: true,
  venueKind: true,
  tour: true,
  channel: true,
  genres: { include: { genre: true }, orderBy: { genre: { sortOrder: "asc" as const } } },
};

async function findConcerts(args: { where: object; orderBy?: object | object[]; take?: number }) {
  // The setlist is only read by the concert page (getConcertPage), never for lists.
  return getDb().concert.findMany({ ...args, include: concertInclude, omit: { setlist: true } });
}
type ConcertRow = Awaited<ReturnType<typeof findConcerts>>[number];

/** Everything a page needs to show one concert. Plain data, safe to pass to client components. */
export interface ConcertView {
  id: number;
  youtubeId: string;
  slug: string;
  title: string;
  /** "NTO", "NTO with Sofiane Pamart" */
  credits: string;
  /** hasPage false: a guest shown as plain text, without a link (owner rule, 13 Nov 2026). */
  artists: { slug: string; name: string; role: "MAIN" | "WITH"; creditNote: string | null; hasPage: boolean }[];
  venue: { slug: string; name: string } | null;
  city: string | null;
  country: string | null;
  venueKind: { slug: string; name: string } | null;
  genres: { slug: string; name: string }[];
  /** Year the concert was played, and the exact day when known. */
  performedYear: number | null;
  performedOn: Date | null;
  tour: { slug: string; name: string } | null;
  durationSeconds: number;
  viewCount: number;
  publishedAt: Date;
  channel: { name: string; isOfficial: boolean };
  writeUp: string | null;
  thumbnail: ThumbnailSources;
  /** A setlist is stored (the setlist itself is only read by the concert page). */
  hasSetlist: boolean;
  /** Hand-picked by the owner. */
  curated: boolean;
}

export function toConcertView(concert: ConcertRow): ConcertView {
  return {
    id: concert.id,
    youtubeId: concert.youtubeId,
    slug: concert.slug,
    title: concert.title,
    credits: formatCredits(concert.credits),
    artists: concert.credits.map((c) => ({
      slug: c.artist.slug,
      name: c.artist.name,
      role: c.role,
      creditNote: c.creditNote,
      hasPage: c.role === "MAIN" || c.artist._count.credits > 0,
    })),
    venue: concert.venue ? { slug: concert.venue.slug, name: concert.venue.name } : null,
    city: concert.city,
    country: concert.country,
    venueKind: concert.venueKind ? { slug: concert.venueKind.slug, name: concert.venueKind.name } : null,
    genres: concert.genres.map((g) => ({ slug: g.genre.slug, name: g.genre.name })),
    performedYear: concert.performedYear,
    performedOn: concert.performedOn,
    tour: concert.tour ? { slug: concert.tour.slug, name: concert.tour.name } : null,
    durationSeconds: concert.durationSeconds,
    viewCount: concert.viewCount,
    publishedAt: concert.publishedAt,
    channel: { name: concert.channel.name, isOfficial: concert.channel.isOfficial },
    writeUp: concert.writeUp,
    thumbnail: thumbnailSources(concert.youtubeId, concert.thumbnailUrl),
    // The setlist and its source are written together (src/lib/setlist/lookup.ts setlistFields).
    hasSetlist: concert.setlistSource !== null,
    curated: concert.curated,
  };
}

function toCandidate(concert: ConcertRow) {
  return {
    id: concert.id,
    artistIds: concert.credits.map((c) => c.artistId),
    genreIds: concert.genres.map((g) => g.genreId),
    publishedAt: concert.publishedAt,
    viewCount: concert.viewCount,
    row: concert,
  };
}

// ---- Lists ----

export async function listConcerts(filters: ConcertFilters, take = 60): Promise<{ concerts: ConcertView[]; total: number }> {
  const where = buildWhere(filters);
  const [rows, total] = await Promise.all([
    findConcerts({ where, orderBy: buildOrderBy(filters.sort), take }),
    getDb().concert.count({ where }),
  ]);
  return { concerts: rows.map(toConcertView), total };
}

async function latestConcertsUncached(take: number): Promise<ConcertView[]> {
  return (await findConcerts({ where: VISIBLE, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], take })).map(toConcertView);
}

/** Visible concerts with these YouTube IDs, in the order given (hand-picked home pictures). Missing ones are skipped. */
export async function concertsByYoutubeIds(ids: string[]): Promise<ConcertView[]> {
  if (!ids.length) return [];
  const rows = await findConcerts({ where: { AND: [VISIBLE, { youtubeId: { in: [...new Set(ids)] } }] } });
  const byId = new Map(rows.map((r) => [r.youtubeId, toConcertView(r)]));
  return ids.map((id) => byId.get(id)).filter((s): s is ConcertView => Boolean(s));
}

// ---- Decades and tours (BRIEF section 1: browse by decade and tour) ----

/** Visible concerts played in a decade (1980 = 1980-1989), oldest first. */
export async function getDecadePage(start: number) {
  const rows = await findConcerts({
    where: { AND: [VISIBLE, { performedYear: { gte: start, lte: start + 9 } }] },
    orderBy: [{ performedYear: "asc" }, { performedOn: "asc" }, { id: "asc" }],
  });
  return { start, label: decadeOf(start), concerts: rows.map(toConcertView) };
}

/** Decades that have visible concerts, with counts, oldest first. Empty if the database cannot be reached. */
async function decadeIndexUncached(): Promise<{ start: number; label: string; count: number }[]> {
  try {
    const rows = await getDb().concert.groupBy({
      by: ["performedYear"],
      where: { AND: [VISIBLE, { performedYear: { not: null } }] },
      _count: { _all: true },
    });
    const counts = new Map<number, number>();
    for (const r of rows) {
      const start = Math.floor(r.performedYear! / 10) * 10;
      counts.set(start, (counts.get(start) ?? 0) + r._count._all);
    }
    return [...counts.entries()].sort(([a], [b]) => a - b).map(([start, count]) => ({ start, label: decadeOf(start), count }));
  } catch {
    return [];
  }
}

/** Tours with at least one visible concert, with their band and how many concerts. */
async function listToursUncached() {
  const tours = await getDb().tour.findMany({
    where: { concerts: { some: VISIBLE } },
    include: { artist: { select: { slug: true, name: true } }, _count: { select: { concerts: { where: VISIBLE } } } },
    orderBy: { name: "asc" },
  });
  return tours.map((t) => ({ slug: t.slug, name: t.name, artist: t.artist, count: t._count.concerts }));
}

export async function getTourPage(slug: string) {
  const tour = await getDb().tour.findUnique({ where: { slug }, include: { artist: { select: { slug: true, name: true } } } });
  if (!tour) return null;
  const rows = await findConcerts({
    where: { ...VISIBLE, tourId: tour.id },
    orderBy: [{ performedYear: "asc" }, { performedOn: "asc" }, { id: "asc" }],
  });
  return { tour, concerts: rows.map(toConcertView) };
}

async function mostWatchedConcertsUncached(take: number): Promise<ConcertView[]> {
  return (await findConcerts({ where: VISIBLE, orderBy: [{ viewCount: "desc" }, { id: "asc" }], take })).map(toConcertView);
}

/** Options for the home page filters, each with how many visible concerts it has. Empty ones are left out. */
async function filterOptionsUncached() {
  const db = getDb();
  const concerts = { where: VISIBLE };
  const [genres, venueKinds, venues, artists] = await Promise.all([
    db.genre.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { concerts: { where: { concert: VISIBLE } } } } } }),
    db.venueKind.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { concerts } } } }),
    db.venue.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { concerts } } } }),
    db.artist.findMany({ where: PAGE_ARTIST, orderBy: { name: "asc" }, include: { _count: { select: { credits: { where: { concert: VISIBLE } } } } } }),
  ]);
  const pick = <T extends { slug: string; name: string }>(rows: T[], count: (r: T) => number) =>
    rows.map((r) => ({ slug: r.slug, name: r.name, count: count(r) })).filter((r) => r.count > 0);
  return {
    genres: pick(genres, (g) => g._count.concerts),
    venueKinds: pick(venueKinds, (s) => s._count.concerts),
    venues: pick(venues, (v) => v._count.concerts),
    artists: pick(artists, (a) => a._count.credits),
  };
}

// ---- Single pages ----

/** The light fields "Up next" needs to rank concerts: no titles, thumbnails or names. */
const candidateSelect = {
  id: true,
  publishedAt: true,
  viewCount: true,
  credits: { select: { artistId: true } },
  genres: { select: { genreId: true } },
} as const;

type LightCandidate = { id: number; artistIds: number[]; genreIds: number[]; publishedAt: Date; viewCount: number };

/**
 * What can follow a concert: only concerts by its artists or by similar artists, or concerts sharing one of its
 * genres, and only their light fields (17 Nov 2026: loading the whole catalogue on every click made
 * concert pages slow once it passed a thousand concerts). Same ranking as before (buildQueue).
 */
async function queueCandidates(current: { id: number; artistIds: number[]; genreIds: number[] }, similar: number[]) {
  const artistIds = [...new Set([...current.artistIds, ...similar])];
  const or: object[] = [];
  if (artistIds.length) or.push({ credits: { some: { artistId: { in: artistIds } } } });
  if (current.genreIds.length) or.push({ genres: { some: { genreId: { in: current.genreIds } } } });
  if (!or.length) return [];
  const rows = await getDb().concert.findMany({
    where: { AND: [VISIBLE, { id: { not: current.id } }, { OR: or }] },
    select: candidateSelect,
  });
  return rows.map(
    (r): LightCandidate => ({
      id: r.id,
      artistIds: r.credits.map((c) => c.artistId),
      genreIds: r.genres.map((g) => g.genreId),
      publishedAt: r.publishedAt,
      viewCount: r.viewCount,
    }),
  );
}

/** Full rows for the chosen concerts, in the given order. */
async function concertViewsInOrder(ids: number[]): Promise<ConcertView[]> {
  if (!ids.length) return [];
  const rows = await findConcerts({ where: { AND: [VISIBLE, { id: { in: [...new Set(ids)] } }] } });
  const byId = new Map(rows.map((r) => [r.id, toConcertView(r)]));
  return ids.map((id) => byId.get(id)).filter((s): s is ConcertView => Boolean(s));
}

export async function getConcertPage(slug: string) {
  const [row] = await findConcerts({ where: { ...VISIBLE, slug }, take: 1 });
  if (!row) return null;
  const current = toCandidate(row);
  const artistIds = new Set(current.artistIds);
  const similar = await similarArtistIds(current.artistIds);
  const pool = await queueCandidates(current, similar);
  const self: LightCandidate = { id: current.id, artistIds: current.artistIds, genreIds: current.genreIds, publishedAt: current.publishedAt, viewCount: current.viewCount };
  const queueIds = buildQueue(self, [self, ...pool], undefined, similar);
  const relatedIds = relatedByGenre(self, [self, ...pool], 6, similar);
  const moreIds = queueIds.filter((c) => c.artistIds.some((id) => artistIds.has(id))).slice(0, 6);
  const views = new Map(
    (await concertViewsInOrder([...queueIds, ...relatedIds].map((c) => c.id))).map((v) => [v.id, v]),
  );
  const pick = (list: LightCandidate[]) => list.map((c) => views.get(c.id)).filter((v): v is ConcertView => Boolean(v));
  // Only the concert page carries the setlist (lists stay light). Artists we have a page for
  // (with at least one visible concert) become links.
  const stored = await getDb().concert.findUnique({ where: { id: row.id }, select: { setlist: true } });
  const raw = readSetlist(stored?.setlist, row.setlistSource);
  const slugs = artistSlugsIn(raw);
  const known = slugs.length
    ? await getDb().artist.findMany({ where: { slug: { in: slugs }, credits: { some: { concert: VISIBLE } } }, select: { slug: true } })
    : [];
  const concert = toConcertView(row);
  const setlist = linkArtists(raw, new Set(known.map((a) => a.slug))) as SetlistView | null;
  // Concert notes (src/lib/concert-notes.ts): the headline band's other concerts and the decade.
  const band = concert.artists.find((a) => a.role === "MAIN" && a.hasPage) ?? null;
  const mainCredit = row.credits.find((c) => c.role === "MAIN");
  const [siblings, decadeCount] = await Promise.all([
    mainCredit ? bandConcertsWithSongs(mainCredit.artistId) : Promise.resolve([]),
    row.performedYear
      ? getDb().concert.count({ where: { AND: [VISIBLE, { performedYear: { gte: Math.floor(row.performedYear / 10) * 10, lte: Math.floor(row.performedYear / 10) * 10 + 9 } }] } })
      : Promise.resolve(0),
  ]);
  // Each song of the setlist links to its song page (src/lib/songs.ts), filed as the band's other setlists file it.
  // Only songs with two versions or more are linked from the setlist (owner, 19 Nov 2026).
  const linkSong = band ? songLinker(band.slug, siblings.map((s) => s.songs ?? []), MIN_SONG_VERSIONS) : () => null;
  const songLinks: Record<string, string> = {};
  for (const t of setlist?.tracks ?? []) {
    const href = t.unidentified ? null : linkSong(t.title);
    if (href) songLinks[t.title] = href;
  }
  // "More from Pinkpop 1995": the other concerts played at the same place in the same year.
  const sameYear =
    row.venueId && row.performedYear
      ? (
          await findConcerts({
            where: { ...VISIBLE, venueId: row.venueId, performedYear: row.performedYear, id: { not: row.id } },
            orderBy: [{ performedOn: "asc" }, { id: "asc" }],
          })
        ).map(toConcertView)
      : [];
  const venueYear: VenueYearLink<ConcertView> | null =
    concert.venue && concert.performedYear && sameYear.length
      ? {
          name: venueYearName(concert.venue.name, concert.performedYear),
          path: venueYearPath(concert.venue.slug, concert.performedYear),
          count: sameYear.length + 1,
          others: sameYear,
        }
      : null;
  const notes: ConcertNote[] = concertNotes({
    concert,
    band: band ? { slug: band.slug, name: band.name } : null,
    siblings,
    setlist,
    decade: row.performedYear ? { label: decadeOf(row.performedYear), count: decadeCount } : null,
  });
  return {
    concert,
    setlist,
    /** Setlist title -> its song page. */
    songLinks,
    notes,
    /** The other concerts from the same place and year, and that year's page (null when there are none). */
    venueYear,
    /** "You might also like": similar artists with a concert to play (never one with this concert's artists). */
    similarCards: (await artistCards(similar.slice(0, 12), current.artistIds)).slice(0, 4),
    queue: pick(queueIds),
    moreFromArtist: pick(moreIds),
    related: pick(relatedIds),
  };
}

/**
 * Every visible concert a band headlines, with the song titles of its setlist (light fields only).
 * Feeds the concert notes and the band's "most played live" answer.
 */
export async function bandConcertsWithSongs(artistId: number): Promise<SiblingConcert[]> {
  const rows = await getDb().concert.findMany({
    where: { ...VISIBLE, credits: { some: { artistId, role: "MAIN" } } },
    select: {
      id: true,
      slug: true,
      viewCount: true,
      performedYear: true,
      setlist: true,
      setlistSource: true,
      venue: { select: { slug: true, name: true } },
      tour: { select: { slug: true, name: true } },
    },
    orderBy: [{ performedYear: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => {
    const view = readSetlist(r.setlist, r.setlistSource);
    return {
      id: r.id,
      slug: r.slug,
      viewCount: r.viewCount,
      performedYear: r.performedYear,
      venue: r.venue,
      tour: r.tour,
      // Songs only: medleys split, solos, intros, jams and notes left out (src/lib/songs.ts setlistSongs).
      songs: view ? setlistSongs(view.tracks).map((s) => s.title) : null,
    };
  });
}

// ---- Songs played live (src/lib/songs.ts) ----

/** The fields a song page needs from a concert, with its setlist. */
const songConcertSelect = {
  id: true,
  slug: true,
  title: true,
  youtubeId: true,
  thumbnailUrl: true,
  performedYear: true,
  performedOn: true,
  durationSeconds: true,
  viewCount: true,
  updatedAt: true,
  city: true,
  country: true,
  setlist: true,
  setlistSource: true,
  venue: { select: { slug: true, name: true } },
  venueKind: { select: { slug: true, name: true } },
  tour: { select: { slug: true, name: true } },
} as const;

function toSongConcert(r: {
  id: number;
  slug: string;
  title: string;
  youtubeId: string;
  thumbnailUrl: string | null;
  performedYear: number | null;
  performedOn: Date | null;
  durationSeconds: number;
  viewCount: number;
  updatedAt: Date;
  city: string | null;
  country: string | null;
  setlist: unknown;
  setlistSource: string | null;
  venue: { slug: string; name: string } | null;
  venueKind: { slug: string; name: string } | null;
  tour: { slug: string; name: string } | null;
}): SongConcert {
  const { setlist, setlistSource, ...rest } = r;
  return { ...rest, tracks: readSetlist(setlist, setlistSource)?.tracks ?? [] };
}

/**
 * Everything a band's song pages need: the band, its headline concerts with their setlists, and every
 * song worked out from them (src/lib/songs.ts). Null when the band has no page.
 */
async function bandSongDataUncached(slug: string) {
  const artist = await getDb().artist.findFirst({ where: { slug, ...PAGE_ARTIST }, select: { id: true, slug: true, name: true, aka: true } });
  if (!artist) return null;
  const rows = await getDb().concert.findMany({
    where: { ...VISIBLE, setlistSource: { not: null }, credits: { some: { artistId: artist.id, role: "MAIN" } } },
    select: songConcertSelect,
    orderBy: [{ performedYear: "asc" }, { id: "asc" }],
  });
  const concerts = rows.map(toSongConcert);
  const band = { slug: artist.slug, name: artist.name };
  return { band, songs: bandSongs({ names: [artist.name, artist.aka].filter((n): n is string => Boolean(n)) }, concerts), setlists: setlistCount(concerts) };
}

/** Every band with songs played live, and its songs (sitemap, llms-full.txt). */
async function songCatalogueUncached() {
  const rows = await getDb().concert.findMany({
    where: { ...VISIBLE, setlistSource: { not: null } },
    select: { ...songConcertSelect, credits: { where: { role: "MAIN" }, select: { artist: { select: { slug: true, name: true, aka: true } } } } },
    orderBy: [{ performedYear: "asc" }, { id: "asc" }],
  });
  const byBand = new Map<string, { band: { slug: string; name: string; aka: string | null }; concerts: SongConcert[] }>();
  for (const { credits, ...row } of rows)
    for (const { artist } of credits) {
      const e = byBand.get(artist.slug) ?? { band: artist, concerts: [] };
      e.concerts.push(toSongConcert(row));
      byBand.set(artist.slug, e);
    }
  return [...byBand.values()]
    .map(({ band, concerts }) => ({
      slug: band.slug,
      name: band.name,
      setlists: setlistCount(concerts),
      songs: bandSongs({ names: [band.name, band.aka].filter((n): n is string => Boolean(n)) }, concerts).map((s) => ({
        slug: s.slug,
        title: s.title,
        versions: s.versions.length,
        updatedAt: s.updatedAt,
      })),
    }))
    .filter((b) => b.songs.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The play queue after a concert, by YouTube ID. Used by the player. */
export async function getQueue(youtubeId: string): Promise<ConcertView[] | null> {
  const row = await getDb().concert.findFirst({ where: { AND: [VISIBLE, { youtubeId }] }, select: candidateSelect });
  if (!row) return null;
  const self: LightCandidate = {
    id: row.id,
    artistIds: row.credits.map((c) => c.artistId),
    genreIds: row.genres.map((g) => g.genreId),
    publishedAt: row.publishedAt,
    viewCount: row.viewCount,
  };
  const similar = await similarArtistIds(self.artistIds);
  const pool = await queueCandidates(self, similar);
  return concertViewsInOrder(buildQueue(self, [self, ...pool], undefined, similar).map((c) => c.id));
}

// ---- Similar artists (phase 4) ----

/**
 * Artists most like the given ones, best first, from the weekly similarity job.
 * For a concert with several artists, each candidate keeps its best score. The given artists are left out.
 */
export async function similarArtistIds(artistIds: number[]): Promise<number[]> {
  if (!artistIds.length) return [];
  const rows = await getDb().artistSimilarity.findMany({
    where: { artistId: { in: artistIds }, similarId: { notIn: artistIds } },
    select: { similarId: true, score: true },
  });
  const best = new Map<number, number>();
  for (const r of rows) best.set(r.similarId, Math.max(best.get(r.similarId) ?? 0, r.score));
  return [...best].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
}

/** Everything shown about a suggested artist. Only artists with a playable concert are returned. */
export interface ArtistCard {
  slug: string;
  name: string;
  origin: string | null;
  bornYear: number | null;
  style: string | null;
  genres: { slug: string; name: string }[];
  concerts: number;
  cover: Cover | null;
  mostWatched: ConcertView;
  latest: ConcertView;
}

/**
 * Cards for the given artists, in the given order. Artists without a visible concert are skipped.
 * Concerts with any of `excludeArtistIds` are left out, so a suggestion never plays the current artist.
 */
export async function artistCards(ids: number[], excludeArtistIds: number[] = []): Promise<ArtistCard[]> {
  if (!ids.length) return [];
  const [artists, rows] = await Promise.all([
    getDb().artist.findMany({ where: { id: { in: ids }, ...PAGE_ARTIST } }),
    findConcerts({ where: { ...VISIBLE, credits: { some: { artistId: { in: ids } } } } }),
  ]);
  const cards: ArtistCard[] = [];
  for (const id of ids) {
    const artist = artists.find((a) => a.id === id);
    const own = rows.filter(
      (r) => r.credits.some((c) => c.artistId === id) && !r.credits.some((c) => excludeArtistIds.includes(c.artistId)),
    );
    if (!artist || !own.length) continue;
    const latest = [...own].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || a.id - b.id)[0];
    const mostWatched = [...own].sort((a, b) => b.viewCount - a.viewCount || a.id - b.id)[0];
    const genreCount = new Map<string, { slug: string; name: string; n: number; order: number }>();
    for (const r of own)
      for (const g of r.genres) {
        const e = genreCount.get(g.genre.slug) ?? { slug: g.genre.slug, name: g.genre.name, n: 0, order: g.genre.sortOrder };
        e.n++;
        genreCount.set(g.genre.slug, e);
      }
    cards.push({
      slug: artist.slug,
      name: artist.name,
      origin: artist.origin,
      bornYear: artist.bornYear,
      style: artist.style,
      genres: [...genreCount.values()].sort((a, b) => b.n - a.n || a.order - b.order).map(({ slug, name }) => ({ slug, name })),
      concerts: own.length,
      cover: artistCover(artist, [...own].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || a.id - b.id)),
      mostWatched: toConcertView(mostWatched),
      latest: toConcertView(latest),
    });
  }
  return cards;
}

/** "You might also like" for whatever is playing: similar artists with a concert to play next. */
export async function recommendationsFor(youtubeId: string, limit = 4): Promise<ArtistCard[] | null> {
  const concert = await getDb().concert.findFirst({ where: { ...VISIBLE, youtubeId }, select: { credits: { select: { artistId: true } } } });
  if (!concert) return null;
  const playing = concert.credits.map((c) => c.artistId);
  const ids = await similarArtistIds(playing);
  return (await artistCards(ids.slice(0, limit * 3), playing)).slice(0, limit);
}

/** IDs a band is known by elsewhere, for structured data (sameAs). Only what the jobs have stored. */
async function bandIds(artist: { id: number; name: string; youtubeChannelId: string | null }) {
  const [lookup, photoCheck] = await Promise.all([
    getDb().artistLookup.findUnique({ where: { nameKey: nameKey(artist.name) }, select: { mbid: true } }),
    getDb().bandPhotoCheck.findUnique({ where: { artistId: artist.id }, select: { wikidataId: true } }),
  ]);
  return { mbid: lookup?.mbid ?? null, wikidataId: photoCheck?.wikidataId ?? null, youtubeChannelId: artist.youtubeChannelId };
}

export async function getArtistPage(slug: string) {
  const db = getDb();
  const artist = await db.artist.findFirst({ where: { slug, ...PAGE_ARTIST } });
  if (!artist) return null;
  const [rows, songs, ids] = await Promise.all([
    findConcerts({
      where: { ...VISIBLE, credits: { some: { artistId: artist.id } } },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    }),
    bandConcertsWithSongs(artist.id),
    bandIds(artist),
  ]);
  /** Song titles of each of the band's setlists (answers: "most played live"). */
  const setlists = songs.map((s) => s.songs).filter((x): x is string[] => Boolean(x?.length));
  // Similar artists: from the similarity job; the profile's hand-written list only when the job has none yet.
  const computed = await similarArtistIds([artist.id]);
  if (computed.length) {
    const cards = (await artistCards(computed.slice(0, 16), [artist.id])).slice(0, 8);
    const similar = cards.map((c) => ({ slug: c.slug, name: c.name, concerts: c.concerts, cover: c.cover }));
    return { artist, concerts: rows.map(toConcertView), raw: rows, similar, similarCards: cards, setlists, ids };
  }
  // Only names we actually have a page (and concerts) for.
  const similarRows = artist.similarNames.length
    ? await db.artist.findMany({
        where: { name: { in: artist.similarNames }, ...PAGE_ARTIST },
        include: { _count: { select: { credits: { where: { concert: VISIBLE } } } }, credits: newestCredit },
      })
    : [];
  const similar = artist.similarNames
    .map((name) => similarRows.find((a) => a.name === name))
    .filter((a) => a !== undefined)
    .map((a) => ({ slug: a.slug, name: a.name, concerts: a._count.credits, cover: artistCover(a, a.credits.map((c) => c.concert)) }));
  return { artist, concerts: rows.map(toConcertView), raw: rows, similar, similarCards: [] as ArtistCard[], setlists, ids };
}

export async function getVenuePage(slug: string) {
  const venue = await getDb().venue.findUnique({ where: { slug } });
  if (!venue) return null;
  const rows = await findConcerts({ where: { ...VISIBLE, venueId: venue.id }, orderBy: [{ publishedAt: "desc" }, { id: "asc" }] });
  return { venue, concerts: rows.map(toConcertView) };
}

// ---- Festival and venue years ("Pinkpop 1995", src/lib/venue-years.ts) ----

/** Every concert played at a place in one year, in the order they were played. Null when there is none. */
export async function getVenueYearPage(slug: string, year: number) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;
  const venue = await getDb().venue.findUnique({ where: { slug } });
  if (!venue) return null;
  const [rows, years] = await Promise.all([
    findConcerts({
      where: { ...VISIBLE, venueId: venue.id, performedYear: year },
      orderBy: [{ performedOn: "asc" }, { id: "asc" }],
    }),
    getDb().concert.groupBy({
      by: ["performedYear"],
      where: { ...VISIBLE, venueId: venue.id, performedYear: { not: null } },
      _count: { _all: true },
    }),
  ]);
  if (!rows.length) return null;
  return {
    venue,
    year,
    concerts: rows.map(toConcertView),
    /** Every year with a concert at this place, newest first, with how many. */
    years: years.map((y) => ({ year: y.performedYear!, count: y._count._all })).sort((a, b) => b.year - a.year),
  };
}

/** Every place and year with a visible concert, and how many (decade pages, llms-full.txt). */
async function venueYearIndexUncached(): Promise<VenueYear[]> {
  try {
    const rows = await getDb().concert.groupBy({
      by: ["venueId", "performedYear"],
      where: { ...VISIBLE, venueId: { not: null }, performedYear: { not: null } },
      _count: { _all: true },
    });
    const venues = await getDb().venue.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.venueId!))] } }, select: { id: true, slug: true, name: true } });
    const byId = new Map(venues.map((v) => [v.id, v]));
    return rows
      .map((r) => ({ slug: byId.get(r.venueId!)?.slug ?? "", name: byId.get(r.venueId!)?.name ?? "", year: r.performedYear!, count: r._count._all }))
      .filter((r) => r.slug)
      .sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function getGenrePage(slug: string) {
  const genre = await getDb().genre.findUnique({ where: { slug } });
  if (!genre) return null;
  const rows = await findConcerts({
    where: { ...VISIBLE, genres: { some: { genreId: genre.id } } },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
  });
  return { genre, concerts: rows.map(toConcertView) };
}

// ---- "Best of" rankings (src/lib/best.ts) ----

/** Every ranking the catalogue can make, with how many concerts each has. */
async function bestCatalogueUncached(): Promise<BestList[]> {
  const [total, decades, options] = await Promise.all([getDb().concert.count({ where: VISIBLE }), decadeIndex(), filterOptions()]);
  return bestLists({ total, decades, genres: options.genres, venueKinds: options.venueKinds });
}

/** A ranking and its concerts, most watched first (at most BEST_SIZE). Null for an unknown or empty ranking. */
export async function getBestPage(slug: string) {
  const list = (await bestCatalogue()).find((l) => l.slug === slug);
  if (!list) return null;
  const scope =
    list.kind === "decade"
      ? { performedYear: { gte: parseDecade(list.key!)!, lte: parseDecade(list.key!)! + 9 } }
      : list.kind === "genre"
        ? { genres: { some: { genre: { slug: list.key! } } } }
        : list.kind === "place"
          ? { venueKind: { slug: list.key! } }
          : {};
  const rows = await findConcerts({ where: { AND: [VISIBLE, scope] }, orderBy: [{ viewCount: "desc" }, { id: "asc" }], take: BEST_SIZE });
  return { list, concerts: rows.map(toConcertView) };
}

// ---- Index pages ----

/** Picture for an artist, venue or genre: the thumbnail of its newest visible concert. */
export interface Cover {
  /** Empty for a portrait. */
  youtubeId: string;
  thumbnail: ThumbnailSources;
  /** True: the artist's own square picture (channel avatar), shown whole. False: a concert thumbnail, cropped. */
  portrait: boolean;
}

/** Sizes of a YouTube channel avatar (the URL carries the size as "=s800"). */
export function avatarSources(url: string): ThumbnailSources {
  const at = (px: number) => (/=s\d+/.test(url) ? url.replace(/=s\d+/, `=s${px}`) : url);
  return { src: at(400), srcSet: `${at(200)} 200w, ${at(400)} 400w, ${at(800)} 800w`, width: 800, height: 800 };
}

type CoverConcert = { youtubeId: string; thumbnailUrl: string | null };

/**
 * An artist's picture. Owner decision (13 Nov 2026): a concert thumbnail comes first (the most engaging
 * picture): the one chosen for the artist (a person, least baked-in text) when it is visible, else
 * the newest. The channel avatar is shown only when every thumbnail is graphics and text, or there
 * is no thumbnail at all.
 * @param concerts the artist's visible concerts, newest first
 */
function artistCover(
  artist: { imageUrl: string | null; coverYoutubeId: string | null; coverUseAvatar: boolean },
  concerts: CoverConcert[],
): Cover | null {
  const avatar = artist.imageUrl ? { youtubeId: "", thumbnail: avatarSources(artist.imageUrl), portrait: true } : null;
  if (artist.coverUseAvatar && avatar) return avatar;
  return cover(concerts.find((s) => s.youtubeId === artist.coverYoutubeId) ?? concerts[0]) ?? avatar;
}
function cover(concert: { youtubeId: string; thumbnailUrl: string | null } | undefined): Cover | null {
  return concert ? { youtubeId: concert.youtubeId, thumbnail: thumbnailSources(concert.youtubeId, concert.thumbnailUrl), portrait: false } : null;
}
const newestCredit = {
  where: { concert: VISIBLE },
  orderBy: { concert: { publishedAt: "desc" as const } },
  select: { concert: { select: { youtubeId: true, thumbnailUrl: true } } },
};

async function listArtistsUncached() {
  const rows = await getDb().artist.findMany({
    where: PAGE_ARTIST,
    orderBy: { name: "asc" },
    include: { _count: { select: { credits: { where: { concert: VISIBLE } } } }, credits: newestCredit },
  });
  return rows.map((a) => ({ slug: a.slug, name: a.name, concerts: a._count.credits, cover: artistCover(a, a.credits.map((c) => c.concert)) }));
}

/**
 * The Festivals index (owner decision, 13 Nov 2026: festivals only, no clubs or other venues):
 * places with at least one visible concert played in the Festival venueKind. Other venues keep their
 * own page, reached from their concerts.
 */
async function listVenuesUncached() {
  const FESTIVAL = { ...VISIBLE, venueKind: { slug: "festival" } };
  const rows = await getDb().venue.findMany({
    where: { concerts: { some: FESTIVAL } },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { concerts: { where: VISIBLE } } },
      concerts: { where: VISIBLE, orderBy: { publishedAt: "desc" }, take: 1, select: { youtubeId: true, thumbnailUrl: true } },
    },
  });
  return rows.map((v) => ({
    slug: v.slug,
    name: v.name,
    city: v.city,
    country: v.country,
    concerts: v._count.concerts,
    cover: cover(v.concerts[0]),
  }));
}

async function listGenresUncached() {
  const genres = (await filterOptions()).genres;
  const newest = await getDb().genre.findMany({
    where: { slug: { in: genres.map((g) => g.slug) } },
    select: {
      slug: true,
      concerts: {
        where: { concert: VISIBLE },
        orderBy: { concert: { publishedAt: "desc" } },
        take: 1,
        select: { concert: { select: { youtubeId: true, thumbnailUrl: true } } },
      },
    },
  });
  const bySlug = new Map(newest.map((g) => [g.slug, cover(g.concerts[0]?.concert)]));
  return genres.map((g) => ({ ...g, cover: bySlug.get(g.slug) ?? null }));
}

// ---- Home page feature ----

/**
 * The concert featured at the top of the home page: the latest concert of today's artist.
 * Artists take turns, one per day, in A–Z order. Only headline artists with a visible concert take part.
 */
export async function featuredConcert(now = new Date()): Promise<ConcertView | null> {
  const artists = await getDb().artist.findMany({
    where: { credits: { some: { role: "MAIN", concert: VISIBLE } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const artist = pickForDay(artists, now);
  if (!artist) return null;
  const [row] = await findConcerts({
    where: { ...VISIBLE, credits: { some: { artistId: artist.id, role: "MAIN" } } },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: 1,
  });
  return row ? toConcertView(row) : null;
}

// ---- Map (phase 4, step 2) ----

export interface MapArtist extends ArtistCard {
  /** Position, -1..1, centre at 0,0, y downward. Closer = more alike. */
  x: number;
  y: number;
}

/** Artists that can be on the map or searched: those with a visible concert, A–Z. */
async function mapArtistIndexUncached(): Promise<{ slug: string; name: string }[]> {
  const rows = await getDb().artist.findMany({
    where: PAGE_ARTIST,
    orderBy: { name: "asc" },
    select: { slug: true, name: true, aka: true },
  });
  return rows.map(({ slug, name }) => ({ slug, name }));
}

/**
 * Free text to the closest artist: exact name or alias first, then a name starting with the text,
 * then a name containing it. Null when nothing matches.
 */
export async function findArtistByText(text: string): Promise<{ slug: string; name: string } | null> {
  const key = nameKey(text);
  if (!key) return null;
  const rows = await getDb().artist.findMany({
    where: PAGE_ARTIST,
    orderBy: { name: "asc" },
    select: { slug: true, name: true, aka: true },
  });
  const keys = (a: (typeof rows)[number]) => [a.name, a.aka].filter((n): n is string => Boolean(n)).map(nameKey);
  const hit =
    rows.find((a) => keys(a).includes(key)) ??
    rows.find((a) => keys(a).some((k) => k.startsWith(key))) ??
    rows.find((a) => keys(a).some((k) => k.includes(key)));
  return hit ? { slug: hit.slug, name: hit.name } : null;
}

/** The artist the map starts from when nothing was searched: today's featured artist. */
export async function defaultMapArtist(now = new Date()): Promise<string | null> {
  const concert = await featuredConcert(now);
  return concert?.artists.find((a) => a.role === "MAIN")?.slug ?? concert?.artists[0]?.slug ?? null;
}

export const MAP_SIZE = 12;

/**
 * The map around one artist: the centre's card and up to MAP_SIZE neighbours, best first, each with
 * a position. Optional genre slugs keep only neighbours with a visible concert in one of those genres.
 * No score leaves the server: the order and the positions carry the ranking.
 */
export async function getMap(slug: string, genreSlugs: string[] = []): Promise<{ centre: ArtistCard; artists: MapArtist[] } | null> {
  const db = getDb();
  const artist = await db.artist.findFirst({ where: { slug, ...PAGE_ARTIST }, select: { id: true } });
  if (!artist) return null;
  const [centre] = await artistCards([artist.id]);
  if (!centre) return null;

  let ids = await similarArtistIds([artist.id]);
  if (genreSlugs.length) {
    const inGenres = await db.artist.findMany({
      where: { id: { in: ids }, credits: { some: { concert: { ...VISIBLE, genres: { some: { genre: { slug: { in: genreSlugs } } } } } } } },
      select: { id: true },
    });
    const keep = new Set(inGenres.map((a) => a.id));
    ids = ids.filter((id) => keep.has(id));
  }
  const cards = await artistCards(ids.slice(0, MAP_SIZE * 2));
  const shown = cards.slice(0, MAP_SIZE);
  const idBySlug = new Map((await db.artist.findMany({ where: { slug: { in: shown.map((c) => c.slug) } }, select: { id: true, slug: true } })).map((a) => [a.slug, a.id]));
  const shownIds = shown.map((c) => idBySlug.get(c.slug)!);

  const pairs = await db.artistSimilarity.findMany({
    where: { artistId: { in: shownIds }, similarId: { in: shownIds } },
    select: { artistId: true, similarId: true, score: true },
  });
  const pairScore = new Map(pairs.map((p) => [`${p.artistId}:${p.similarId}`, p.score]));
  const points = new Map(layoutMap(shownIds, (a, b) => pairScore.get(`${a}:${b}`) ?? 0).map((p) => [p.id, p]));

  return {
    centre,
    artists: shown.map((c, i) => {
      const p = points.get(shownIds[i])!;
      return { ...c, x: p.x, y: p.y };
    }),
  };
}

/** Cached for a few minutes (src/lib/memo.ts). */
export const latestConcerts = cached("latestConcerts", latestConcertsUncached);

/** Cached for a few minutes (src/lib/memo.ts). */
export const mostWatchedConcerts = cached("mostWatchedConcerts", mostWatchedConcertsUncached);

/** Cached for a few minutes (src/lib/memo.ts). */
export const filterOptions = cached("filterOptions", filterOptionsUncached);

/** Cached for a few minutes (src/lib/memo.ts). */
export const listArtists = cached("listArtists", listArtistsUncached);

/** Cached for a few minutes (src/lib/memo.ts). */
export const listVenues = cached("listVenues", listVenuesUncached);

/** Cached for a few minutes (src/lib/memo.ts). */
export const listGenres = cached("listGenres", listGenresUncached);

/** Cached for a few minutes (src/lib/memo.ts). */
export const mapArtistIndex = cached("mapArtistIndex", mapArtistIndexUncached);

/** Cached for a few minutes (src/lib/memo.ts). */
export const decadeIndex = cached("decadeIndex", decadeIndexUncached);

/** Cached for a few minutes (src/lib/memo.ts). */
export const bestCatalogue = cached("bestCatalogue", bestCatalogueUncached);

/** Cached for a few minutes (src/lib/memo.ts). */
export const venueYearIndex = cached("venueYearIndex", venueYearIndexUncached);

/** Cached for a few minutes (src/lib/memo.ts). */
export const listTours = cached("listTours", listToursUncached);

/** Cached for a few minutes (src/lib/memo.ts): one entry per band, shared by all its song pages. */
export const bandSongData = cached("bandSongData", bandSongDataUncached);

/** Cached for a few minutes (src/lib/memo.ts). */
export const songCatalogue = cached("songCatalogue", songCatalogueUncached);

/** Visible-concert lists for other modules (e.g. src/lib/home.ts): any where/order, as page-ready views. */
export async function findConcertViews(args: { where: object; orderBy?: object | object[]; take?: number }): Promise<ConcertView[]> {
  return (await findConcerts({ ...args, where: { AND: [VISIBLE, args.where] } })).map(toConcertView);
}

/** Everything /llms.txt and /llms-full.txt list (src/lib/llms.ts): every band, place, genre, decade and tour with concerts. */
export async function llmsData() {
  const [bands, options, genres, decades, tours, venueYears, best] = await Promise.all([
    listArtists(),
    filterOptions(),
    listGenres(),
    decadeIndex(),
    listTours(),
    venueYearIndex(),
    bestCatalogue(),
  ]);
  return {
    venueYears,
    best: best.filter(bestIsStrong).map((l) => ({ slug: l.slug, title: bestHeading(l), count: shownIn(l) })),
    bands: bands.map((b) => ({ slug: b.slug, name: b.name, concerts: b.concerts })),
    venues: options.venues.map((v) => ({ slug: v.slug, name: v.name, concerts: v.count })),
    genres: genres.map((g) => ({ slug: g.slug, name: g.name, count: g.count })),
    decades: decades.filter((d) => parseDecade(d.label) !== null).map((d) => ({ label: d.label, count: d.count })),
    tours,
  };
}
