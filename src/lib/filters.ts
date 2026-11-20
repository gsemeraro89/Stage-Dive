// Home page filters, search and sorting. Pure functions: URL parameters in, database query out.
import { SOURCE_FILTERS, sourceKindFor, type SourceFilter } from "./bootlegs";

export const SORTS = ["newest", "most-viewed", "longest", "shortest"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = {
  "newest": "Newest",
  "most-viewed": "Most viewed",
  "longest": "Longest",
  "shortest": "Shortest",
};

export interface ConcertFilters {
  q: string | null;
  genre: string | null; // genre slug
  artist: string | null; // artist slug
  venue: string | null; // venue slug
  venueKind: string | null; // venueKind slug
  /** Official concerts or bootlegs only (?source=official / ?source=bootleg); null = both, official first. */
  source: SourceFilter | null;
  sort: Sort;
}

type RawParams = Record<string, string | string[] | undefined>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function slugParam(value: string | string[] | undefined): string | null {
  const v = first(value)?.trim().toLowerCase();
  return v && v.length <= 120 && SLUG.test(v) ? v : null;
}

/** Read filters from URL parameters. Anything malformed is ignored rather than causing an error. */
export function parseFilters(params: RawParams): ConcertFilters {
  const q = first(params.q)?.trim().replace(/\s+/g, " ").slice(0, 80) || null;
  const sortParam = first(params.sort);
  const sort = (SORTS as readonly string[]).includes(sortParam ?? "") ? (sortParam as Sort) : "newest";
  return {
    q,
    genre: slugParam(params.genre),
    artist: slugParam(params.artist),
    venue: slugParam(params.venue),
    venueKind: slugParam(params.venueKind),
    source: (SOURCE_FILTERS as readonly string[]).includes(first(params.source) ?? "") ? (first(params.source) as SourceFilter) : null,
    sort,
  };
}

export function hasActiveFilters(f: ConcertFilters): boolean {
  return Boolean(f.q || f.genre || f.artist || f.venue || f.venueKind || f.source);
}

const SOURCES = ["SEED", "COLLECTOR", "MANUAL"] as const;
type Source = (typeof SOURCES)[number];

/**
 * Which kinds of concerts this copy of the site shows, from SITE_SOURCES (e.g. "SEED").
 * Unset or empty = all. Lets the live site keep showing only the hand-picked concerts while the
 * demo site (same database) also shows the concerts found by the collector.
 */
export function parseSiteSources(value: string | undefined): Source[] | null {
  const list = (value ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is Source => (SOURCES as readonly string[]).includes(s));
  return list.length ? [...new Set(list)] : null;
}

const siteSources = parseSiteSources(process.env.SITE_SOURCES);

/** Only concerts that may be shown and embedded (CLAUDE.md, YouTube rule 1), from the sources this site shows. */
export const VISIBLE = {
  status: "PUBLISHED",
  embeddable: true,
  privacyStatus: "public",
  ...(siteSources ? { source: { in: siteSources } } : {}),
} as const;

/** The database conditions for a set of filters. */
export function buildWhere(f: ConcertFilters) {
  const and: Record<string, unknown>[] = [];
  if (f.genre) and.push({ genres: { some: { genre: { slug: f.genre } } } });
  if (f.artist) and.push({ credits: { some: { artist: { slug: f.artist } } } });
  if (f.venue) and.push({ venue: { slug: f.venue } });
  if (f.venueKind) and.push({ venueKind: { slug: f.venueKind } });
  if (f.source) and.push({ sourceKind: sourceKindFor(f.source) });
  if (f.q) {
    // Every word must appear somewhere: title, artist, venue, city or country.
    for (const word of f.q.split(" ")) {
      const contains = { contains: word, mode: "insensitive" as const };
      and.push({
        OR: [
          { title: contains },
          { city: contains },
          { country: contains },
          { venue: { name: contains } },
          { credits: { some: { artist: { OR: [{ name: contains }, { aka: contains }] } } } },
        ],
      });
    }
  }
  return { ...VISIBLE, AND: and };
}

/** Official concerts always come first (owner, 20 Nov 2026: bootlegs after them, whatever the sort). */
export const OFFICIAL_FIRST = { sourceKind: "asc" as const };

/** Only official concerts (the "best of" rankings, src/lib/best.ts). */
export const OFFICIAL_ONLY = { sourceKind: "OFFICIAL" as const };

export function buildOrderBy(sort: Sort) {
  return [OFFICIAL_FIRST, ...sortOrder(sort)];
}

function sortOrder(sort: Sort) {
  switch (sort) {
    case "most-viewed":
      return [{ viewCount: "desc" as const }, { id: "asc" as const }];
    case "longest":
      return [{ durationSeconds: "desc" as const }, { id: "asc" as const }];
    case "shortest":
      return [{ durationSeconds: "asc" as const }, { id: "asc" as const }];
    default:
      return [{ publishedAt: "desc" as const }, { id: "asc" as const }];
  }
}

/** Turn filters back into a query string, leaving out defaults. Used for links and canonical URLs. */
export function filtersToQuery(f: Partial<ConcertFilters>): string {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.genre) params.set("genre", f.genre);
  if (f.artist) params.set("artist", f.artist);
  if (f.venue) params.set("venue", f.venue);
  if (f.venueKind) params.set("venueKind", f.venueKind);
  if (f.source) params.set("source", f.source);
  if (f.sort && f.sort !== "newest") params.set("sort", f.sort);
  const s = params.toString();
  return s ? `?${s}` : "";
}
