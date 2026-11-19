// Songs played live (owner, 19 Nov 2026): every song a band plays in the setlists we hold gets a page,
// /songs/<band>/<song>, listing every concert where the band played it, newest first, with a link
// that starts that concert at the song. The facts on it (how many versions, the oldest and newest
// here, where in the set it usually comes, how long it runs, the places, decades and tours) are all
// computed here from the setlists, so a new concert or setlist updates them by itself.
// - A song belongs to the band whose concert it was played at (a headline concert). A cover keeps its
//   page under the band that played it; the setlist's own credit is kept ("credited to Diamond Head").
// - Lines nobody identified ("ID") and empty titles are left out.
// Pure functions, tested in tests/songs.test.ts. Data: src/lib/queries.ts (bandSongData).
import { decadeOf } from "./catalogue";
import { startAtPath } from "./player/start-time";
import { isBandName } from "./setlist/parse";
import { compactSlug, shortSongSlug, songParts, songSlug, songTitleBase } from "./song-title";

/** The address of a song page, and of a band's list of songs. */
export const songPath = (bandSlug: string, songSlug: string) => `/songs/${bandSlug}/${songSlug}`;
export const bandSongsPath = (bandSlug: string) => `/songs/${bandSlug}`;

export interface SongTrack {
  time: number | null;
  artist: string | null;
  title: string;
  unidentified: boolean;
}

/** One of the band's headline concerts with its setlist. */
export interface SongConcert {
  id: number;
  slug: string;
  title: string;
  youtubeId: string;
  /** Stored thumbnail, null = derived from the YouTube ID (src/lib/thumbnails.ts). */
  thumbnailUrl: string | null;
  performedYear: number | null;
  performedOn: Date | null;
  durationSeconds: number;
  viewCount: number;
  updatedAt: Date;
  venue: { slug: string; name: string } | null;
  city: string | null;
  country: string | null;
  venueKind: { slug: string; name: string } | null;
  tour: { slug: string; name: string } | null;
  tracks: SongTrack[];
}

/** Where a song came in one setlist: the first song, the last, or a third of the way in. */
export type Slot = "opener" | "early" | "middle" | "late" | "closer";

export interface SongVersion {
  concert: Omit<SongConcert, "tracks">;
  /** 1-based place among the setlist's identified songs, and how many there are. */
  position: number;
  of: number;
  slot: Slot;
  /** Second the song starts in the video, when the setlist gives it. */
  time: number | null;
  /** From its start to the next song's start, when both are known (and plausible). */
  lengthSeconds: number | null;
  /** The title as this setlist writes it. */
  title: string;
  /** Another artist the setlist credits the song to (a cover), or null. */
  creditedTo: string | null;
  /** Our concert page, at the song when its time is known. */
  href: string;
}

export interface TypicalPosition {
  slot: Slot;
  /** Versions in that slot (for "opener" / "closer"), or in that third of the set. */
  count: number;
  of: number;
}

export interface Song {
  slug: string;
  /** The spelling most setlists use, without performance notes. */
  title: string;
  /** Every version, newest first (by the date it was played; undated ones last). */
  versions: SongVersion[];
  oldest: SongVersion | null;
  newest: SongVersion | null;
  position: TypicalPosition | null;
  averageLengthSeconds: number | null;
  /** How many versions the average length is built from. */
  timedVersions: number;
  places: { slug: string; name: string; count: number; festival: boolean }[];
  decades: { label: string; count: number }[];
  tours: { slug: string; name: string; count: number }[];
  creditedTo: string | null;
  /** The newest change among its concerts (sitemap). */
  updatedAt: Date;
}

/** Song lengths outside this range are setlist mistakes (a missing line, a wrong time). */
export const MIN_SONG_SECONDS = 30;
export const MAX_SONG_SECONDS = 30 * 60;

/** Versions needed before the page says where a song usually comes or calls it the opener/closer. */
export const MIN_VERSIONS_FOR_PATTERN = 2;

/**
 * The address each spelling of a song is filed under, for one band. Spellings are filed together when
 * their addresses only differ by hyphens ("Bloodbuzz Ohio" / "Blood Buzz Ohio", "Anybody" / "Any
 * Body"), or when one is the other with a subtitle in brackets ("Street Spirit (Fade Out)" /
 * "Street Spirit"). A group takes the address of its most common spelling (on a tie the shorter
 * address); an old address keeps working, the song page redirects it.
 */
export function canonicalSlugs(titles: string[]): Map<string, string> {
  const counts = new Map<string, number>();
  const shorts = new Map<string, string>();
  for (const t of titles) {
    const slug = songSlug(t);
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
    const short = shortSongSlug(t);
    if (short && short !== slug) shorts.set(slug, short);
  }
  const parent = new Map([...counts.keys()].map((k) => [k, k]));
  const find = (k: string): string => {
    while (parent.get(k) !== k) k = parent.get(k)!;
    return k;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const byCompact = new Map<string, string>();
  for (const slug of counts.keys()) {
    const c = compactSlug(slug);
    if (byCompact.has(c)) union(slug, byCompact.get(c)!);
    else byCompact.set(c, slug);
  }
  for (const [slug, short] of shorts) {
    const plain = byCompact.get(compactSlug(short));
    if (plain) union(slug, plain);
  }
  const groups = new Map<string, string[]>();
  for (const slug of counts.keys()) groups.set(find(slug), [...(groups.get(find(slug)) ?? []), slug]);
  const out = new Map<string, string>();
  for (const members of groups.values()) {
    const best = [...members].sort((a, b) => counts.get(b)! - counts.get(a)! || a.length - b.length || a.localeCompare(b))[0];
    for (const m of members) out.set(m, best);
  }
  return out;
}

/** The songs of a list of setlist lines, cleaned, medleys split, non-songs left out (src/lib/song-title.ts). */
export const songsIn = (lines: string[]): string[] => lines.flatMap(songParts);

/**
 * A function from a setlist line to its song page, for one band; null for a line that is not a song,
 * a medley, or a song played in fewer than `minSetlists` of the band's setlists (owner, 19 Nov 2026:
 * the concert page only links songs with two versions or more; the other pages still exist).
 */
export function songLinker(bandSlug: string, setlists: string[][], minSetlists = 1): (title: string) => string | null {
  const slugs = canonicalSlugs(setlists.flatMap(songsIn));
  const counts = new Map(songTally(setlists).map((s) => [s.slug, s.count]));
  return (title) => {
    const parts = songParts(title);
    if (parts.length !== 1) return null;
    const slug = songSlug(parts[0]);
    const canonical = slug ? (slugs.get(slug) ?? slug) : "";
    return canonical && (counts.get(canonical) ?? 0) >= minSetlists ? songPath(bandSlug, canonical) : null;
  };
}

/**
 * Songs across a band's setlists, most setlists first (a song counts once per setlist), with the
 * address of each song's page. Each setlist is a list of setlist lines (cleaned and split here).
 */
export function songTally(setlists: string[][]): { slug: string; title: string; count: number }[] {
  const lists = setlists.map(songsIn);
  const slugs = canonicalSlugs(lists.flat());
  const songs = new Map<string, { slug: string; spellings: Map<string, number>; count: number; first: number }>();
  let order = 0;
  for (const list of lists) {
    const seen = new Set<string>();
    for (const title of list) {
      const slug = slugs.get(songSlug(title));
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const e = songs.get(slug) ?? { slug, spellings: new Map(), count: 0, first: order++ };
      e.count++;
      const base = songTitleBase(title);
      e.spellings.set(base, (e.spellings.get(base) ?? 0) + 1);
      songs.set(slug, e);
    }
  }
  return [...songs.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .map((e) => ({ slug: e.slug, title: mostCommon(e.spellings, e.slug), count: e.count }));
}

/**
 * The most frequent spelling; on a tie one with capitals over an all-lower-case one, then the fuller
 * one ("Street Spirit (Fade Out)" over "Street Spirit"), then the first seen.
 */
function mostCommon(all: Map<string, number>, slug?: string): string {
  // Prefer the spellings filed at the song's own address ("Is There Anybody Out There?" for /is-there-anybody-out-there).
  const own = slug ? [...all].filter(([k]) => songSlug(k) === slug) : [];
  const counts = own.length ? new Map(own) : all;
  const capital = (k: string) => (/\p{Lu}/u.test(k) ? 1 : 0);
  let best = "";
  let n = -1;
  for (const [k, c] of counts) {
    if (c > n || (c === n && (capital(k) > capital(best) || (capital(k) === capital(best) && k.length > best.length)))) [best, n] = [k, c];
  }
  return best;
}

/** Sort key for "newest first": the day played, else the year, undated last. */
function playedAt(c: { performedOn: Date | null; performedYear: number | null }): number {
  if (c.performedOn) return new Date(c.performedOn).getTime();
  return c.performedYear ? Date.UTC(c.performedYear, 0, 1) : -Infinity;
}

const newestFirst = (a: SongVersion, b: SongVersion) => playedAt(b.concert) - playedAt(a.concert) || b.concert.id - a.concert.id;

/** The slot of a song at `position` (1-based) in a setlist of `of` identified songs. */
export function slotOf(position: number, of: number): Slot {
  if (of < 2) return "middle";
  if (position === 1) return "opener";
  if (position === of) return "closer";
  const rel = (position - 1) / (of - 1);
  return thirdOf(rel);
}

/** The third of the set a relative place (0 = first song, 1 = last) falls in. */
const thirdOf = (rel: number): "early" | "middle" | "late" => (rel <= 1 / 3 ? "early" : rel < 2 / 3 ? "middle" : "late");

/** The third of the set a slot falls in (the opener is early, the closer late). */
const third = (s: Slot): "early" | "middle" | "late" => (s === "opener" ? "early" : s === "closer" ? "late" : s);

/**
 * Where a song usually comes, from at least two versions. "opener" (or "closer") when it opened
 * (closed) more than half of them; otherwise the third of the set its middle version falls in.
 */
export function typicalPosition(versions: { position: number; of: number; slot: Slot }[]): TypicalPosition | null {
  if (versions.length < MIN_VERSIONS_FOR_PATTERN) return null;
  const of = versions.length;
  for (const slot of ["opener", "closer"] as const) {
    const count = versions.filter((v) => v.slot === slot).length;
    if (count >= MIN_VERSIONS_FOR_PATTERN && count * 2 > of) return { slot, count, of };
  }
  const rels = versions.map((v) => (v.of < 2 ? 0.5 : (v.position - 1) / (v.of - 1))).sort((a, b) => a - b);
  const mid = rels.length % 2 ? rels[(rels.length - 1) / 2] : (rels[rels.length / 2 - 1] + rels[rels.length / 2]) / 2;
  const slot = thirdOf(mid);
  return { slot, count: versions.filter((v) => third(v.slot) === slot).length, of };
}

/** Seconds from a song's start to the next line's start, when both are known and the result is plausible. */
export function songLength(tracks: SongTrack[], index: number): number | null {
  const [a, b] = [tracks[index], tracks[index + 1]];
  if (!a || !b || a.time === null || b.time === null) return null;
  const seconds = b.time - a.time;
  return seconds >= MIN_SONG_SECONDS && seconds <= MAX_SONG_SECONDS ? seconds : null;
}

/** Count by key, most first (then in first-seen order). */
function countBy<T>(items: T[], key: (t: T) => string | null): { key: string; item: T; count: number }[] {
  const out = new Map<string, { key: string; item: T; count: number }>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    const e = out.get(k) ?? { key: k, item: it, count: 0 };
    e.count++;
    out.set(k, e);
  }
  return [...out.values()].sort((a, b) => b.count - a.count);
}

/**
 * Every song a band played in its headline concerts we hold, most versions first (then the most
 * recently played, then A to Z). `band.names` are the band's names (name and aka), to tell its own
 * songs from songs the setlist credits to someone else.
 */
export function bandSongs(band: { names: string[] }, concerts: SongConcert[]): Song[] {
  const perConcert = concerts.map((c) => ({ c, songs: setlistSongs(c.tracks) }));
  const slugs = canonicalSlugs(perConcert.flatMap((p) => p.songs.map((x) => x.title)));
  const bySlug = new Map<string, SongVersion[]>();

  for (const { c, songs: known } of perConcert) {
    const { tracks, ...concert } = c;
    const seen = new Set<string>();
    known.forEach((x, k) => {
      const slug = slugs.get(songSlug(x.title))!;
      if (seen.has(slug)) return; // a song played twice in one night counts once (its first time)
      seen.add(slug);
      const t = x.track;
      const position = k + 1;
      const credit = t.artist && !/^ID$/i.test(t.artist) && !isBandName(t.artist, band.names) ? t.artist : null;
      const version: SongVersion = {
        concert,
        position,
        of: known.length,
        slot: slotOf(position, known.length),
        // A medley's songs all start where the medley does.
        time: t.time,
        lengthSeconds: x.medley ? null : songLength(tracks, x.index),
        title: x.title,
        creditedTo: credit,
        // The first second needs no ?t= (the concert starts there anyway).
        href: t.time !== null && t.time > 0 && t.time < c.durationSeconds ? startAtPath(c.slug, t.time) : `/concerts/${c.slug}`,
      };
      bySlug.set(slug, [...(bySlug.get(slug) ?? []), version]);
    });
  }

  const songs: Song[] = [];
  for (const [slug, list] of bySlug) {
    const versions = [...list].sort(newestFirst);
    const dated = versions.filter((v) => playedAt(v.concert) > -Infinity);
    const lengths = versions.map((v) => v.lengthSeconds).filter((s): s is number => s !== null);
    const spellings = new Map<string, number>();
    for (const v of versions) {
      const base = songTitleBase(v.title);
      spellings.set(base, (spellings.get(base) ?? 0) + 1);
    }
    songs.push({
      slug,
      title: mostCommon(spellings, slug),
      versions,
      oldest: dated.length ? dated[dated.length - 1] : null,
      newest: dated.length ? dated[0] : null,
      position: typicalPosition(versions),
      averageLengthSeconds: lengths.length ? Math.round(lengths.reduce((n, s) => n + s, 0) / lengths.length) : null,
      timedVersions: lengths.length,
      places: countBy(versions, (v) => v.concert.venue?.slug ?? null).map((e) => ({
        slug: e.key,
        name: e.item.concert.venue!.name,
        count: e.count,
        festival: e.item.concert.venueKind?.slug === "festival",
      })),
      decades: countBy(versions, (v) => (v.concert.performedYear ? decadeOf(v.concert.performedYear) : null))
        .map((e) => ({ label: e.key, count: e.count }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      tours: countBy(versions, (v) => v.concert.tour?.slug ?? null).map((e) => ({ slug: e.key, name: e.item.concert.tour!.name, count: e.count })),
      creditedTo: countBy(versions, (v) => v.creditedTo)[0]?.key ?? null,
      updatedAt: new Date(Math.max(...versions.map((v) => new Date(v.concert.updatedAt).getTime()))),
    });
  }
  const latest = (s: Song) => (s.newest ? playedAt(s.newest.concert) : -Infinity);
  return songs.sort((a, b) => b.versions.length - a.versions.length || latest(b) - latest(a) || a.title.localeCompare(b.title));
}

/**
 * The songs of a setlist in playing order: unidentified lines and lines that are not songs left out,
 * a medley's songs one after the other, each cleaned, with the line it comes from.
 */
export function setlistSongs<T extends { title: string; unidentified: boolean }>(tracks: T[]): { title: string; track: T; index: number; medley: boolean }[] {
  return tracks.flatMap((track, index) => {
    if (track.unidentified) return [];
    const parts = songParts(track.title);
    return parts.map((title) => ({ title, track, index, medley: parts.length > 1 }));
  });
}

/** How many songs a setlist has: its songs (a medley counts each) and the unidentified ones; not solos, intros or notes. */
export function songCount(tracks: { title: string; unidentified: boolean }[]): number {
  return tracks.filter((t) => t.unidentified).length + setlistSongs(tracks).length;
}

/** How many of a band's headline concerts have a setlist with at least one song. */
export function setlistCount(concerts: SongConcert[]): number {
  return concerts.filter((c) => setlistSongs(c.tracks).length > 0).length;
}
