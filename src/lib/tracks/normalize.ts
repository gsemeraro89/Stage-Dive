// When are two tracklist lines the same track? Owner decisions (13 Nov 2026, BRIEF 4.8):
// each version (original, every remix or edit) is its own track; versions of one song are linked.
//
//   "Stephan Bodzin - Boavista (Original Mix)"  ==  "Stephan Bodzin – Boavista"
//   "Artbat - Upperground [Diynamic] (Out Now)" ==  "ARTBAT - Upperground"
//   "A, B & C - Song"                           ==  "C & A x B - Song"
//   "Monolink - Father Ocean (Ben Böhmer Remix)" is another version of "Monolink - Father Ocean"
//
// "ID" tracks and lines without an artist are not tracks we can name: no key.

import { slugify } from "../slug";

/** Words in brackets that say nothing about which version it is. */
const NOISE = /^(original( mix| version)?|extended( mix| version)?|club mix|album version|out now|unreleased|forthcoming|free download|premiere|played by .*|id|clip|preview|unsure|not sure|\?+|my favou?rite)$/i;
/** Words in brackets that make it another version. */
// "\w*edit" also catches puns such as Fred again..'s "Freddit"; "revision" and "respray" are reworks.
const VERSION = /\b(remix|rmx|\w*edit|rework|bootleg|dub|dnb|mix|version|vip|remake|reprise|flip|mashup|live|acoustic|instrumental|revision|respray)\b/i;
/** "feat. X" in an artist field ends at the next separator: "A feat. X, B" keeps B. */
const ARTIST_FEAT = /\s*\b(feat\.?|ft\.?|featuring)\s+[^,&+]+/gi;
const FEAT = /\s*[([]?\s*\b(feat\.?|ft\.?|featuring|with)\s+[^)\]]+[)\]]?/gi;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Main artists, without "feat." guests, in a fixed order: "A, B & C" and "C & A x B" match. */
export function artistKey(artist: string): string {
  const main = artist.replace(ARTIST_FEAT, "");
  const names = main
    .split(/\s*(?:,|&|\+|\band\b|\bx\b|\bvs\.?|\bb2b\b)\s*/i)
    .map((n) => slugify(n))
    .filter(Boolean);
  return [...new Set(names)].sort().join("_");
}

/** Bracketed parts of a title, e.g. "(Ben Böhmer Remix)", "[Diynamic]", "{Played by Rampa}". */
function bracketParts(title: string): string[] {
  return [...title.matchAll(/[([{]([^)\]}]*)[)\]}]/g)].map((m) => clean(m[1]));
}

/** The song name without any bracketed part or "feat." guest: "Father Ocean". */
export function baseTitle(title: string): string {
  return clean(
    title
      .replace(FEAT, "")
      .replace(/[([{][^)\]}]*[)\]}]/g, "")
      .replace(/\s+-\s*$/, "")
      .replace(/\b(unreleased|out now)\b/gi, ""),
  );
}

/** What makes this a particular version, e.g. "Ben Böhmer Remix"; "" for the original. */
export function versionName(title: string): string {
  const parts = bracketParts(title).filter((p) => p && !NOISE.test(p) && !/^(feat\.?|ft\.?|featuring|with)\s/i.test(p));
  // Labels in square brackets ("[Diynamic]") are not versions; only parts that name one count.
  const versions = parts.filter((p) => VERSION.test(p));
  return versions.join(" ");
}

export interface TrackKey {
  /** One song by one set of artists, any version. Used to link versions to each other. */
  songKey: string;
  /** This exact version. One page per versionKey. */
  versionKey: string;
  /** Display name of the version, "" for the original. */
  version: string;
}

/** Null for lines that are not a nameable track ("ID", no artist, nothing left after cleaning). */
export function trackKey(artist: string | null, title: string): TrackKey | null {
  if (!artist || /^ID$/i.test(artist.trim()) || /^ID$/i.test(title.trim())) return null;
  const a = artistKey(artist);
  const base = slugify(baseTitle(title));
  if (!a || !base) return null;
  const version = versionName(title);
  const songKey = `${a}--${base}`;
  return { songKey, versionKey: version ? `${songKey}--${slugify(version)}` : songKey, version };
}
