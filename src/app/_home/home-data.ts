// Data for the home page. It only calls the existing queries. The hand-picked pictures come
// from data/home-picks.json (YouTube IDs, in order of preference) and are loaded by ID; a pick
// that is not in the database is skipped and the gap is filled with the most watched concerts of
// the same setting, so the page never shows a hole.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  filterOptions,
  latestConcerts,
  listArtists,
  listConcerts,
  listVenues,
  mapArtistIndex,
  concertsByYoutubeIds,
  type ConcertView,
} from "@/lib/queries";

/** Where the full list of concerts lives. */
export const SETS_HREF = "/concerts";

export function concertsHref(params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString();
  return query ? `${SETS_HREF}?${query}` : SETS_HREF;
}

type PickList = { id: string }[];
type Picks = Record<"cover" | "places" | "festival" | "club", PickList>;

function readPicks(): Picks {
  const empty: Picks = { cover: [], places: [], festival: [], club: [] };
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "data", "home-picks.json"), "utf8")) as Partial<Picks>;
    for (const key of Object.keys(empty) as (keyof Picks)[]) {
      const list = raw[key];
      if (Array.isArray(list)) empty[key] = list.filter((p) => typeof p?.id === "string");
    }
  } catch {
    // No file, or not valid: the page falls back to the most watched concerts.
  }
  return empty;
}

export const SPECIAL = "special-location";
export const FESTIVAL = "festival";
export const CLUB = "club";

const mostWatchedIn = (setting: string | null, take: number) =>
  listConcerts({ q: null, genre: null, artist: null, venue: null, setting, sort: "most-viewed" }, take);

export async function homeData() {
  const picks = readPicks();
  const pickIds = [...picks.cover, ...picks.places, ...picks.festival, ...picks.club].map((p) => p.id);
  const [picked, chart, special, festival, club, latest, artists, venues, options, mapIndex] = await Promise.all([
    concertsByYoutubeIds(pickIds),
    // The chart, and the number of concerts in the catalogue.
    mostWatchedIn(null, 6),
    // Fallbacks for the pictures: enough to fill the band and the atlas without any pick.
    mostWatchedIn(SPECIAL, 24),
    mostWatchedIn(FESTIVAL, 8),
    mostWatchedIn(CLUB, 8),
    latestConcerts(5),
    listArtists(),
    listVenues(),
    filterOptions(),
    mapArtistIndex(),
  ]);
  const byId = new Map(picked.map((s) => [s.youtubeId, s]));
  const fallback: Record<string, ConcertView[]> = { [SPECIAL]: special.concerts, [FESTIVAL]: festival.concerts, [CLUB]: club.concerts };
  const used = new Set<string>();

  /**
   * The first `n` picks that exist, then the most watched concerts of `setting`. A picture is never
   * shown twice on the page; `listed` is for text lists, which may name a concert that also has a
   * picture elsewhere (so a small catalogue still gets its list).
   */
  const take = (list: PickList, n: number, setting: string, listed = false): ConcertView[] => {
    const out: ConcertView[] = [];
    const add = (s: ConcertView | undefined) => {
      if (!s || out.length >= n || out.some((o) => o.youtubeId === s.youtubeId)) return;
      if (!listed) {
        if (used.has(s.youtubeId)) return;
        used.add(s.youtubeId);
      }
      out.push(s);
    };
    list.forEach((p) => add(byId.get(p.id)));
    (fallback[setting] ?? []).forEach(add);
    return out;
  };

  return {
    take,
    picks,
    latest,
    mostWatched: chart.concerts,
    artists,
    // The nine artists with the most concerts; the tenth square is the "All artists" tile.
    topArtists: [...artists].sort((a, b) => b.concerts - a.concerts || a.name.localeCompare(b.name)).slice(0, 9),
    topVenues: [...venues].sort((a, b) => b.concerts - a.concerts || a.name.localeCompare(b.name)),
    genres: options.genres,
    settings: options.settings,
    mapIndex,
    totals: {
      concerts: chart.total,
      artists: artists.length,
      festivals: venues.length,
      genres: options.genres.length,
      settings: options.settings.length,
    },
  };
}

export type HomeData = Awaited<ReturnType<typeof homeData>>;
