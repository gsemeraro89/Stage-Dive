// Database side of the similarity job: read what we know about each artist, ask ListenBrainz
// when needed, store the ranked lists. Scores cover every published set; pages then only
// show artists the visitor can actually play (SITE_SOURCES is applied when reading).

import type { PrismaClient } from "../../generated/prisma/client";
import { lookupArtist, nameKey } from "../collector/musicbrainz";
import { similarArtists, type ExternalMatch } from "./listenbrainz";
import { rankAll, type ArtistSignals, type Ranked } from "./score";

export const EXTERNAL_SOURCE = "listenbrainz";
/** Outside lists are asked again after this many days. */
export const EXTERNAL_MAX_AGE_DAYS = 28;

/** Sets that count: published and playable, whatever their source. */
const COUNTED = { status: "PUBLISHED" as const, embeddable: true, privacyStatus: "public" };
/** Artists with a page (a set of their own): only they are ranked. */
const RANKED = { credits: { some: { role: "MAIN" as const, set: COUNTED } } };

export async function loadSignals(db: PrismaClient): Promise<ArtistSignals[]> {
  const artists = await db.artist.findMany({
    where: RANKED,
    orderBy: { id: "asc" },
    include: {
      credits: {
        where: { set: COUNTED },
        include: { set: { select: { id: true, venueId: true, channelId: true, genres: { select: { genreId: true } } } } },
      },
      externalSimilar: { select: { nameKey: true, score: true } },
    },
  });
  return artists.map((a) => {
    const genres = new Map<number, number>();
    const places = new Map<string, number>();
    const bump = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
    for (const { set } of a.credits) {
      for (const g of set.genres) bump(genres, g.genreId);
      if (set.venueId) bump(places, `v:${set.venueId}`);
      bump(places, `c:${set.channelId}`);
    }
    const external = new Map<string, number>();
    for (const e of a.externalSimilar) external.set(e.nameKey, Math.max(external.get(e.nameKey) ?? 0, e.score));
    return {
      id: a.id,
      nameKeys: [a.name, a.aka].filter((n): n is string => Boolean(n)).map(nameKey),
      label: a.label,
      genres,
      places,
      setIds: new Set(a.credits.map((c) => c.set.id)),
      external,
    };
  });
}

/** Recompute and replace every artist's list. Returns what was stored. */
export async function recompute(db: PrismaClient, now = new Date()): Promise<Ranked[]> {
  const ranked = rankAll(await loadSignals(db));
  await db.$transaction([
    db.artistSimilarity.deleteMany({}),
    db.artistSimilarity.createMany({ data: ranked.map((r) => ({ ...r, computedAt: now })) }),
  ]);
  return ranked;
}

export interface FetchStats {
  asked: string[];
  noMbid: string[];
  empty: string[];
  errors: string[];
}

/**
 * Ask ListenBrainz for artists whose stored list is missing or older than EXTERNAL_MAX_AGE_DAYS.
 * The MusicBrainz ID comes from the collector's lookups, or is looked up now.
 */
export async function refreshExternal(
  db: PrismaClient,
  opts: { limit?: number; fetchFn?: typeof fetch; similar?: (mbid: string) => Promise<ExternalMatch[]> } = {},
): Promise<FetchStats> {
  const stats: FetchStats = { asked: [], noMbid: [], empty: [], errors: [] };
  const staleBefore = new Date(Date.now() - EXTERNAL_MAX_AGE_DAYS * 86_400_000);
  const artists = await db.artist.findMany({
    where: RANKED,
    orderBy: { id: "asc" },
    include: { externalSimilar: { where: { source: EXTERNAL_SOURCE }, select: { fetchedAt: true }, take: 1 } },
  });
  // Artists checked recently and found nothing have no rows; remember them through the lookup date.
  const due = [];
  for (const a of artists) {
    const last = a.externalSimilar[0]?.fetchedAt;
    if (last && last > staleBefore) continue;
    const lookup = await db.artistLookup.findUnique({ where: { nameKey: nameKey(a.name) } });
    if (!last && lookup?.similarCheckedAt && lookup.similarCheckedAt > staleBefore) continue;
    due.push({ artist: a, lookup });
  }
  const similar = opts.similar ?? ((mbid: string) => similarArtists(mbid, opts.fetchFn));

  for (const { artist, lookup } of due.slice(0, opts.limit ?? due.length)) {
    const key = nameKey(artist.name);
    try {
      let mbid = lookup?.mbid ?? null;
      if (!lookup) {
        const found = await lookupArtist(artist.name, opts.fetchFn);
        mbid = found?.mbid ?? null;
        await db.artistLookup.upsert({
          where: { nameKey: key },
          create: { nameKey: key, mbid, genres: found?.genres ?? [] },
          update: { mbid, genres: found?.genres ?? [], checkedAt: new Date() },
        });
      }
      if (!mbid) {
        stats.noMbid.push(artist.name);
        await db.artistLookup.update({ where: { nameKey: key }, data: { similarCheckedAt: new Date() } });
        continue;
      }
      const matches = await similar(mbid);
      const now = new Date();
      await db.$transaction([
        db.artistExternalSimilar.deleteMany({ where: { artistId: artist.id, source: EXTERNAL_SOURCE } }),
        db.artistExternalSimilar.createMany({
          data: matches.map((m) => ({ artistId: artist.id, source: EXTERNAL_SOURCE, ...m, fetchedAt: now })),
        }),
        db.artistLookup.update({ where: { nameKey: key }, data: { similarCheckedAt: now } }),
      ]);
      (matches.length ? stats.asked : stats.empty).push(artist.name);
    } catch (e) {
      stats.errors.push(`${artist.name}: ${(e as Error).message}`);
    }
  }
  return stats;
}
