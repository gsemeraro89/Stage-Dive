// The figures of "STAGEDIVE in numbers" (src/lib/stats.ts), read from the database with lean queries:
// counts and group-bys are done by the database, card rows are read only for the few concerts shown,
// and the cached helpers the other pages use are reused (bestCatalogue, bestConcerts, decadeIndex,
// songCatalogue). Cached for a few minutes (src/lib/memo.ts) on top of the page's revalidate = 600.
import { Prisma } from "../generated/prisma/client";
import { parseDecade } from "./catalogue";
import { getDb } from "./db";
import { OFFICIAL_ONLY, VISIBLE } from "./filters";
import { cached } from "./memo";
import { bestCatalogue, bestConcerts, decadeIndex, findConcertViews, PAGE_ARTIST, songCatalogue } from "./queries";
import { countCountries, STATS_RANK_SIZE, topCounts, topSongsPerBand, type CountRow, type SiteStats } from "./stats";


const OFFICIAL = { ...VISIBLE, ...OFFICIAL_ONLY };

/** Songs in visible setlists with a start time: counted in the database, so no setlist is sent over. */
async function timedSongCount(): Promise<number> {
  const sources = "source" in VISIBLE ? (VISIBLE as { source: { in: string[] } }).source.in : null;
  const rows = await getDb().$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n
    FROM concerts c, jsonb_array_elements(c.setlist) AS t
    WHERE c.status = 'PUBLISHED' AND c.embeddable AND c.privacy_status = 'public'
      AND jsonb_typeof(c.setlist) = 'array'
      ${sources ? Prisma.sql`AND c.source::text = ANY(${sources})` : Prisma.empty}
      AND jsonb_typeof(t->'time') = 'number' AND (t->>'time')::numeric >= 0
      AND coalesce(btrim(t->>'title'), '') <> '' AND btrim(t->>'title') !~* '^ID$'`;
  return Number(rows[0]?.n ?? 0);
}

/** Rows of a group-by with their names, the `n` with the most (ties at the cut included, then cut A-Z). */
async function named(groups: { id: number; concerts: number }[], names: (ids: number[]) => Promise<{ id: number; slug: string; name: string }[]>): Promise<CountRow[]> {
  const sorted = [...groups].sort((a, b) => b.concerts - a.concerts);
  const cut = sorted[STATS_RANK_SIZE - 1]?.concerts ?? 0;
  const kept = sorted.filter((g) => g.concerts >= cut);
  const byId = new Map((await names(kept.map((g) => g.id))).map((r) => [r.id, r]));
  return topCounts(kept.flatMap((g) => (byId.has(g.id) ? [{ slug: byId.get(g.id)!.slug, name: byId.get(g.id)!.name, concerts: g.concerts }] : [])));
}

async function siteStatsUncached(): Promise<SiteStats> {
  const db = getDb();
  const [kinds, agg, withSetlist, timedSongs, bands, places, festivals, countries, decadeAll, best, catalogue, bandGroups, placeGroups, mostWatched, longest] =
    await Promise.all([
      db.concert.groupBy({ by: ["sourceKind"], where: VISIBLE, _count: { _all: true } }),
      db.concert.aggregate({ where: VISIBLE, _sum: { durationSeconds: true }, _min: { performedYear: true }, _max: { performedYear: true, ytRefreshedAt: true } }),
      db.concert.count({ where: { ...VISIBLE, setlistSource: { not: null } } }),
      timedSongCount(),
      db.artist.count({ where: PAGE_ARTIST }),
      db.venue.count({ where: { concerts: { some: VISIBLE } } }),
      db.venue.count({ where: { concerts: { some: { ...VISIBLE, venueKind: { slug: "festival" } } } } }),
      db.concert.groupBy({ by: ["country"], where: VISIBLE }),
      decadeIndex(),
      bestCatalogue(),
      songCatalogue(),
      db.concertArtist.groupBy({ by: ["artistId"], where: { role: "MAIN", concert: OFFICIAL }, _count: { _all: true } }),
      db.concert.groupBy({ by: ["venueId"], where: { ...OFFICIAL, venueId: { not: null } }, _count: { _all: true } }),
      bestConcerts({ kind: "all", key: null }, STATS_RANK_SIZE),
      findConcertViews({ where: OFFICIAL_ONLY, orderBy: [{ durationSeconds: "desc" }, { id: "asc" }], take: STATS_RANK_SIZE }),
    ]);
  const official = kinds.find((k) => k.sourceKind === "OFFICIAL")?._count._all ?? 0;
  const bootlegs = kinds.find((k) => k.sourceKind === "FAN_PRO_SHOT")?._count._all ?? 0;
  // The most watched official concert of each decade: one row per decade (a handful of small reads).
  const decadeLists = best.filter((l) => l.kind === "decade" && l.key && parseDecade(l.key) !== null);
  const decades = await Promise.all(decadeLists.map(async (l) => ({ label: l.key!, concerts: l.count, top: (await bestConcerts(l, 1))[0] ?? null })));
  const [bandRows, placeRows] = await Promise.all([
    named(
      bandGroups.map((g) => ({ id: g.artistId, concerts: g._count._all })),
      (ids) => db.artist.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true } }),
    ),
    named(
      placeGroups.map((g) => ({ id: g.venueId!, concerts: g._count._all })),
      (ids) => db.venue.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true } }),
    ),
  ]);
  return {
    totals: {
      concerts: official + bootlegs,
      official,
      bootlegs,
      bands,
      places,
      festivals,
      withSetlist,
      timedSongs,
      songs: catalogue.reduce((n, b) => n + b.songs.length, 0),
      seconds: agg._sum.durationSeconds ?? 0,
      firstYear: agg._min.performedYear ?? null,
      lastYear: agg._max.performedYear ?? null,
      decades: decadeAll.filter((d) => parseDecade(d.label) !== null).length,
      countries: countCountries(countries.map((c) => c.country)),
    },
    mostWatched,
    decades,
    bands: bandRows,
    places: placeRows,
    longest,
    songs: topSongsPerBand(catalogue),
    updatedAt: agg._max.ytRefreshedAt ?? new Date(),
  };
}

/** Shared by /stats and /stats.md. */
export const siteStats = cached("siteStats", siteStatsUncached);
