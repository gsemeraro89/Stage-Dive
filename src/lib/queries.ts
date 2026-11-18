// All database reads for the pages. Every query only returns concerts that may be shown and embedded.
import { getDb } from "./db";
import { buildOrderBy, buildWhere, VISIBLE, type ConcertFilters } from "./filters";
import { formatCredits } from "./format";
import { thumbnailSources, type ThumbnailSources } from "./thumbnails";
import { cached } from "./memo";
import { buildPeriodIndex, monthRange, yearRange, type PeriodIndex } from "./periods";
import { pickForDay } from "./rotation";
import { artistSlugsIn, linkArtists, readSetlist, type SetlistView } from "./setlist/view";
import { buildQueue, relatedByGenre } from "./upnext";
import { layoutMap } from "./similarity/layout";
import { nameKey } from "./collector/musicbrainz";

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

// ---- Periods ("This month", year pages; BRIEF 4.10) ----

/** Visible concerts uploaded to YouTube in [start, end), newest first. */
async function concertsUploadedBetweenUncached(start: Date, end: Date, take = 500): Promise<ConcertView[]> {
  const rows = await findConcerts({
    where: { AND: [VISIBLE, { publishedAt: { gte: start, lt: end } }] },
    orderBy: [{ publishedAt: "desc" }, { viewCount: "desc" }, { id: "asc" }],
    take,
  });
  return rows.map(toConcertView);
}

/**
 * A year at a glance: how many concerts were uploaded each month, and the most watched few of each,
 * newest month first. Months without concerts are left out.
 */
async function yearOverviewUncached(year: number, perMonth = 6) {
  const { start, end } = yearRange(year);
  const dates = await getDb().concert.findMany({
    where: { AND: [VISIBLE, { publishedAt: { gte: start, lt: end } }] },
    select: { publishedAt: true },
  });
  const counts = new Map<number, number>();
  for (const d of dates) counts.set(d.publishedAt.getUTCMonth() + 1, (counts.get(d.publishedAt.getUTCMonth() + 1) ?? 0) + 1);
  const months = [...counts.keys()].sort((a, b) => b - a);
  const sections = await Promise.all(
    months.map(async (month) => {
      const range = monthRange({ year, month });
      const rows = await findConcerts({
        where: { AND: [VISIBLE, { publishedAt: { gte: range.start, lt: range.end } }] },
        orderBy: [{ viewCount: "desc" }, { id: "asc" }],
        take: perMonth,
      });
      return { month, total: counts.get(month)!, top: rows.map(toConcertView) };
    }),
  );
  return { year, total: dates.length, months: sections };
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
  return {
    concert: toConcertView(row),
    setlist: linkArtists(raw, new Set(known.map((a) => a.slug))) as SetlistView | null,
    /** "You might also like": similar artists with a concert to play (never one with this concert's artists). */
    similarCards: (await artistCards(similar.slice(0, 12), current.artistIds)).slice(0, 4),
    queue: pick(queueIds),
    moreFromArtist: pick(moreIds),
    related: pick(relatedIds),
  };
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

export async function getArtistPage(slug: string) {
  const db = getDb();
  const artist = await db.artist.findFirst({ where: { slug, ...PAGE_ARTIST } });
  if (!artist) return null;
  const rows = await findConcerts({
    where: { ...VISIBLE, credits: { some: { artistId: artist.id } } },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
  });
  // Similar artists: from the similarity job; the profile's hand-written list only when the job has none yet.
  const computed = await similarArtistIds([artist.id]);
  if (computed.length) {
    const cards = (await artistCards(computed.slice(0, 16), [artist.id])).slice(0, 8);
    const similar = cards.map((c) => ({ slug: c.slug, name: c.name, concerts: c.concerts, cover: c.cover }));
    return { artist, concerts: rows.map(toConcertView), raw: rows, similar, similarCards: cards };
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
  return { artist, concerts: rows.map(toConcertView), raw: rows, similar, similarCards: [] as ArtistCard[] };
}

export async function getVenuePage(slug: string) {
  const venue = await getDb().venue.findUnique({ where: { slug } });
  if (!venue) return null;
  const rows = await findConcerts({ where: { ...VISIBLE, venueId: venue.id }, orderBy: [{ publishedAt: "desc" }, { id: "asc" }] });
  return { venue, concerts: rows.map(toConcertView) };
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
export const yearOverview = cached("yearOverview", yearOverviewUncached);

/** Cached for a few minutes (src/lib/memo.ts). */
export const concertsUploadedBetween = cached("concertsUploadedBetween", concertsUploadedBetweenUncached);

/**
 * Months and years that have concerts, with counts, for the menu's "This month" and year lists.
 * Reads only upload dates; cached like the other lists. Returns an empty index if the database
 * cannot be reached (e.g. while the site is being built), so the menu still renders.
 */
async function periodIndexUncached(): Promise<PeriodIndex> {
  try {
    const rows = await getDb().concert.findMany({ where: VISIBLE, select: { publishedAt: true } });
    return buildPeriodIndex(rows.map((r) => r.publishedAt), new Date());
  } catch {
    return { months: [], years: [] };
  }
}
export const periodIndex = cached("periodIndex", periodIndexUncached);
