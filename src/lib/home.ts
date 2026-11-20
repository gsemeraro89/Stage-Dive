// Everything the homepage shows (brand book board 04, "homepage"), section by section. Data only: the
// page and its look are built from src/components/zine. Each section is empty, never broken, when there
// is not enough data yet; the page leaves an empty section out.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decadeOf, GENRES } from "./catalogue";
import { getDb } from "./db";
import { VISIBLE } from "./filters";
import { cached } from "./memo";
import { bandPhotosFor, type BandPhotoView } from "./photos/view";
import { decadeIndex, findConcertViews, type ConcertView } from "./queries";
import { readSetlist, type SetlistView } from "./setlist/view";
import { countryName } from "./places";

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
  "shoegaze",
  "indie",
  "new wave / synth",
  "post-punk",
  "classic rock",
  "alternative",
  "garage",
  "grunge",
  "stoner",
  "emo / post-hardcore",
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
