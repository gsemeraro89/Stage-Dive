// Entity links (owner, 20 Nov 2026): where each band is known elsewhere, so search engines and AI
// assistants can tie our band page to the same band in their knowledge graphs. For every band with a
// page: its MusicBrainz ID, its Wikidata item (from MusicBrainz's url-rels) and its English Wikipedia
// article (from Wikidata's "enwiki" sitelink). Stored on the artist; the band page shows them as sameAs
// and a small "Elsewhere" line. Run from GitHub Actions after the artist profiles (collect.yml).
// MusicBrainz is asked at most once a second (src/lib/collector/musicbrainz.ts). A band is asked
// again after RECHECK_DAYS; when an ID is not known, nothing is linked.
// Network calls come in as `deps`, so the job is tested without the internet (tests/entity-links.test.ts).
import type { PrismaClient } from "../generated/prisma/client";
import { nameKey, type EntityLinks } from "./collector/musicbrainz";
import { cleanQid } from "./wikidata";

/** Bands are asked again after this many days (links rarely change). */
export const RECHECK_DAYS = 90;

export interface EntityDeps {
  /** MusicBrainz ID for a band name when nothing is stored, or null when it cannot be told. */
  mbid: (name: string) => Promise<string | null>;
  links: (mbid: string) => Promise<EntityLinks>;
  wikipedia: (qid: string) => Promise<string | null>;
}

export interface EntityStats {
  checked: number;
  linked: string[];
  changed: string[];
  notFound: string[];
  errors: string[];
}

/** The links to store, from what was found: Wikipedia from Wikidata first, else MusicBrainz's own English link. Pure. */
export function chooseLinks(found: { mbid: string | null; links: EntityLinks | null; fallbackQid: string | null; enwiki: string | null }) {
  const wikidataId = cleanQid(found.links?.wikidataId) ?? cleanQid(found.fallbackQid);
  return { mbid: found.mbid, wikidataId, wikipediaUrl: found.enwiki ?? found.links?.wikipediaUrl ?? null };
}

export async function refreshEntityLinks(
  db: PrismaClient,
  deps: EntityDeps,
  options: { limit?: number; now?: Date; force?: boolean } = {},
): Promise<EntityStats> {
  const now = options.now ?? new Date();
  const stats: EntityStats = { checked: 0, linked: [], changed: [], notFound: [], errors: [] };
  const recheckBefore = new Date(now.getTime() - RECHECK_DAYS * 86_400_000);
  // Bands with a page: a visible concert of their own (same rule as the site). Never asked first.
  const bands = await db.artist.findMany({
    where: {
      credits: { some: { role: "MAIN", concert: { status: "PUBLISHED", embeddable: true, privacyStatus: "public" } } },
      ...(options.force ? {} : { OR: [{ linksCheckedAt: null }, { linksCheckedAt: { lt: recheckBefore } }] }),
    },
    select: { id: true, name: true, mbid: true, wikidataId: true, wikipediaUrl: true },
    orderBy: [{ linksCheckedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    take: options.limit ?? 200,
  });
  for (const band of bands) {
    stats.checked++;
    try {
      const [lookup, photoCheck] = await Promise.all([
        db.artistLookup.findUnique({ where: { nameKey: nameKey(band.name) }, select: { mbid: true } }),
        db.bandPhotoCheck.findUnique({ where: { artistId: band.id }, select: { wikidataId: true } }),
      ]);
      // The collector's identity (it tells namesakes apart) comes first, then ours, then an exact-name search.
      const mbid = lookup?.mbid ?? band.mbid ?? (await deps.mbid(band.name));
      const links = mbid ? await deps.links(mbid) : null;
      const qid = cleanQid(links?.wikidataId) ?? cleanQid(photoCheck?.wikidataId);
      const enwiki = qid ? await deps.wikipedia(qid) : null;
      const next = chooseLinks({ mbid, links, fallbackQid: photoCheck?.wikidataId ?? null, enwiki });
      await db.artist.update({ where: { id: band.id }, data: { ...next, linksCheckedAt: now } });
      const line = `${band.name}: ${[next.mbid && "MusicBrainz", next.wikidataId && "Wikidata", next.wikipediaUrl && "Wikipedia"].filter(Boolean).join(", ") || "nothing"}`;
      if (!next.mbid && !next.wikidataId) stats.notFound.push(band.name);
      else if (band.mbid === null && band.wikidataId === null && band.wikipediaUrl === null) stats.linked.push(line);
      else if (band.mbid !== next.mbid || band.wikidataId !== next.wikidataId || band.wikipediaUrl !== next.wikipediaUrl) stats.changed.push(line);
    } catch (error) {
      // Not marked as checked: asked again next run.
      stats.errors.push(`${band.name}: ${(error as Error).message}`);
    }
  }
  return stats;
}
