// Fixed lists the catalogue is built on. Both are a starting point the owner can edit.

/**
 * Genres shown on the site (docs/BRIEF.md section 1, editable). "new wave / synth" added by the owner
 * on 18 Nov 2026 for Depeche Mode-type acts (docs/SUPPLY-CHECK.md). The last three added by the owner on
 * 20 Nov 2026, for the bands the official archives hold beyond rock: Massive Attack, Portishead, Tricky
 * (trip hop); The Prodigy, The Chemical Brothers live, Leftfield, Underworld (electronic rock / big beat:
 * live acts, never DJ sets); Björk, Kate Bush (art pop / experimental). Names are shown as written here;
 * page slugs come from slugify(): trip-hop, electronic-rock-big-beat, art-pop-experimental.
 */
export const GENRES = [
  "classic rock",
  "hard rock",
  "punk",
  "post-punk",
  "new wave / synth",
  "indie",
  "alternative",
  "grunge",
  "metal",
  "garage",
  "shoegaze",
  "stoner",
  "emo / post-hardcore",
  "trip hop",
  "electronic rock / big beat",
  "art pop / experimental",
] as const;

export type GenreName = (typeof GENRES)[number];

/**
 * Every genre that can appear on the site, in display order. "reggae" (owner, 26 Nov 2026) is shown on the
 * site for Bob Marley only and is deliberately NOT in GENRES: the classifier is never offered it, so the
 * collector does not go looking for reggae acts. A later Bob Marley concert gets it from the artist's
 * existing genres (genresWithFallback).
 */
export const SITE_GENRES = [...GENRES, "reggae"] as const;

/** How genre labels found in source data (the seed CSV, Claude's answers) map onto GENRES. */
export const GENRE_ALIASES: Record<string, GenreName> = {
  "emo/post-hardcore": "emo / post-hardcore",
  "emo": "emo / post-hardcore",
  "post-hardcore": "emo / post-hardcore",
  "new wave": "new wave / synth",
  "synth": "new wave / synth",
  "synth-pop": "new wave / synth",
  "synthpop": "new wave / synth",
  "new wave/synth": "new wave / synth",
  "trip-hop": "trip hop",
  "triphop": "trip hop",
  "big beat": "electronic rock / big beat",
  "big-beat": "electronic rock / big beat",
  "electronic rock": "electronic rock / big beat",
  "electro-rock": "electronic rock / big beat",
  "electronic rock/big beat": "electronic rock / big beat",
  "art pop": "art pop / experimental",
  "art-pop": "art pop / experimental",
  "experimental": "art pop / experimental",
  "art pop/experimental": "art pop / experimental",
};

/** A genre label in our list, or null when it is not one of ours. */
export function normalizeGenre(label: string): GenreName | null {
  const key = label.trim().toLowerCase();
  if ((GENRES as readonly string[]).includes(key)) return key as GenreName;
  return GENRE_ALIASES[key] ?? null;
}

/**
 * Where a concert happened. Festivals are "the fields", rooms (arenas, clubs, halls, stadiums) are
 * "the rooms" on the homepage (brand book board 04).
 */
export const VENUE_KINDS = ["Festival", "Room", "Livestream", "TV-Studio"] as const;

export type VenueKindName = (typeof VENUE_KINDS)[number];

/** How venue-kind labels found in source data map onto VENUE_KINDS. */
export const VENUE_KIND_ALIASES: Record<string, VenueKindName> = {
  "festival": "Festival",
  "festival archive": "Festival",
  "festival stream": "Festival",
  "room": "Room",
  "club": "Room",
  "arena": "Room",
  "hall": "Room",
  "stadium": "Room",
  "theatre": "Room",
  "livestream": "Livestream",
  "webcast": "Livestream",
  "tv-studio": "TV-Studio",
  "tv studio": "TV-Studio",
  "studio": "TV-Studio",
};

export function normalizeVenueKind(label: string): VenueKindName {
  const venueKind = VENUE_KIND_ALIASES[label.trim().toLowerCase()];
  if (!venueKind) throw new Error(`Unknown venue kind "${label}". Add it to VENUE_KIND_ALIASES.`);
  return venueKind;
}

/** Decades shown on the site: the first one with a concert we can show, up to now. */
export const FIRST_DECADE = 1960;

/** "1980s" for 1983. */
export function decadeOf(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

/** 1980 for "1980s"; null for anything else. */
export function parseDecade(label: string): number | null {
  const m = /^(\d{3}0)s$/.exec(label);
  if (!m) return null;
  const start = Number(m[1]);
  return start >= FIRST_DECADE && start <= new Date().getUTCFullYear() ? start : null;
}
