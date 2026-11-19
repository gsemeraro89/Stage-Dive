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
import { shortSongSlug, songSlug, songTitleBase } from "./song-title";

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
 * The address each spelling of a song is filed under, for one band. A title with a subtitle in
 * brackets is filed with its short form when the band's setlists also have that ("Street Spirit
 * (Fade Out)" and "Street Spirit" -> "street-spirit"). The short form always wins, so an address
 * does not change back and forth as counts change.
 */
export function canonicalSlugs(titles: string[]): Map<string, string> {
  const raw = new Set(titles.map(songSlug).filter(Boolean));
  const out = new Map<string, string>();
  for (const t of titles) {
    const slug = songSlug(t);
    if (!slug) continue;
    const short = shortSongSlug(t);
    out.set(slug, short && short !== slug && raw.has(short) ? short : slug);
  }
  return out;
}

/** A function from a setlist title to its song page, for one band; null for a line without a page. */
export function songLinker(bandSlug: string, allTitles: string[]): (title: string) => string | null {
  const slugs = canonicalSlugs(allTitles);
  return (title) => {
    const slug = songSlug(title);
    const canonical = slug ? (slugs.get(slug) ?? slug) : "";
    return canonical ? songPath(bandSlug, canonical) : null;
  };
}

/**
 * Songs across a band's setlists, most setlists first (a song counts once per setlist), with the
 * address of each song's page. Each setlist is a list of identified song titles.
 */
export function songTally(setlists: string[][]): { slug: string; title: string; count: number }[] {
  const slugs = canonicalSlugs(setlists.flat());
  const songs = new Map<string, { slug: string; spellings: Map<string, number>; count: number; first: number }>();
  let order = 0;
  for (const list of setlists) {
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
    .map((e) => ({ slug: e.slug, title: mostCommon(e.spellings), count: e.count }));
}

/** The most frequent spelling; on a tie the fuller one ("Street Spirit (Fade Out)" over "Street Spirit"), then the first seen. */
function mostCommon(counts: Map<string, number>): string {
  let best = "";
  let n = -1;
  for (const [k, c] of counts) if (c > n || (c === n && k.length > best.length)) [best, n] = [k, c];
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
  const usable = (t: SongTrack) => !t.unidentified && Boolean(songSlug(t.title));
  const slugs = canonicalSlugs(concerts.flatMap((c) => c.tracks.filter(usable).map((t) => t.title)));
  const bySlug = new Map<string, SongVersion[]>();

  for (const c of concerts) {
    const { tracks, ...concert } = c;
    const known = tracks.filter(usable);
    const seen = new Set<string>();
    tracks.forEach((t, i) => {
      if (!usable(t)) return;
      const slug = slugs.get(songSlug(t.title))!;
      if (seen.has(slug)) return; // a song played twice in one night counts once (its first time)
      seen.add(slug);
      const position = known.indexOf(t) + 1;
      const credit = t.artist && !/^ID$/i.test(t.artist) && !isBandName(t.artist, band.names) ? t.artist : null;
      const version: SongVersion = {
        concert,
        position,
        of: known.length,
        slot: slotOf(position, known.length),
        time: t.time,
        lengthSeconds: songLength(tracks, i),
        title: t.title,
        creditedTo: credit,
        href: t.time !== null && t.time < c.durationSeconds ? startAtPath(c.slug, t.time) : `/concerts/${c.slug}`,
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
      title: mostCommon(spellings),
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

/** How many of a band's headline concerts have a setlist with at least one identified song. */
export function setlistCount(concerts: SongConcert[]): number {
  return concerts.filter((c) => c.tracks.some((t) => !t.unidentified && songSlug(t.title))).length;
}
