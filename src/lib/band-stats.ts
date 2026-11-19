// Band statistics from the concerts and setlists we hold (owner, 19 Nov 2026): how long a concert
// usually runs, how many songs, the usual opener and closer, the most played songs, the longest
// concert and the years covered. Shown on the band page, in its Markdown copy and in its questions.
// A figure is only given when at least two concerts (or setlists) support it; an "usual" opener or
// closer also needs a real plurality (see usualSong). Nothing is guessed.
// Pure functions, tested in tests/band-stats.test.ts.
import { songKey } from "./text";
import { canonicalSlugs, songTally } from "./songs";
import { songTitleBase } from "./song-title";

/** Concerts (or setlists) needed before any figure about the band is stated. */
export const MIN_FOR_BAND_STAT = 2;
/** Share of setlists an opener (or closer) must reach to be called the usual one. */
export const MIN_USUAL_SHARE = 1 / 3;
/** Songs listed as the most played live. */
export const TOP_SONGS = 5;

export interface UsualSong {
  title: string;
  slug: string;
  /** Setlists it opened (or closed), out of `of`. */
  count: number;
  of: number;
  /** More than half of the setlists: "usually"; otherwise "most often". */
  majority: boolean;
}

export interface BandStats {
  concerts: number;
  setlists: number;
  averageSeconds: number | null;
  longest: { slug: string; title: string; durationSeconds: number; venue: { name: string } | null; city: string | null; performedYear: number | null } | null;
  years: { from: number; to: number } | null;
  averageSongs: number | null;
  opener: UsualSong | null;
  closer: UsualSong | null;
  mostPlayed: { slug: string; title: string; count: number }[];
}

export interface StatsConcert {
  slug: string;
  title: string;
  durationSeconds: number;
  performedYear: number | null;
  venue: { name: string } | null;
  city: string | null;
}

/**
 * The song a band usually opens (or closes) with: the first (last) song of each setlist; the most
 * frequent one counts when it is there at least twice, strictly more often than any other, and in at
 * least a third of the setlists. Needs two setlists or more.
 */
export function usualSong(songs: string[], setlists: number, key: (title: string) => string = songKey): UsualSong | null {
  if (setlists < MIN_FOR_BAND_STAT) return null;
  const counts = new Map<string, { titles: string[]; count: number }>();
  for (const title of songs) {
    const k = key(title);
    if (!k) continue;
    const e = counts.get(k) ?? { titles: [], count: 0 };
    e.count++;
    e.titles.push(songTitleBase(title));
    counts.set(k, e);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  const [top, next] = ranked;
  if (!top) return null;
  const count = top[1].count;
  if (count < MIN_FOR_BAND_STAT || (next && next[1].count === count) || count < setlists * MIN_USUAL_SHARE) return null;
  return { title: top[1].titles[0], slug: top[0], count, of: setlists, majority: count * 2 > setlists };
}

/**
 * Figures for a band page. `concerts` are the band's headline concerts; `setlists` the identified song
 * titles of each of their setlists, in playing order.
 */
export function bandStats(concerts: StatsConcert[], setlists: string[][]): BandStats {
  const lists = setlists.filter((l) => l.length > 0);
  const enough = concerts.length >= MIN_FOR_BAND_STAT;
  const years = concerts.map((c) => c.performedYear).filter((y): y is number => y !== null);
  const [from, to] = [Math.min(...years), Math.max(...years)];
  const longest = enough ? [...concerts].sort((a, b) => b.durationSeconds - a.durationSeconds)[0] : null;
  // The opener and closer only from setlists with two songs or more (a one-line list says nothing).
  const ordered = lists.filter((l) => l.length >= 2);
  // Spellings filed under one song page (src/lib/songs.ts), so the opener links to the right page.
  const canon = canonicalSlugs(lists.flat());
  const key = (title: string) => canon.get(songKey(title)) ?? songKey(title);
  return {
    concerts: concerts.length,
    setlists: lists.length,
    averageSeconds: enough ? Math.round(concerts.reduce((n, c) => n + c.durationSeconds, 0) / concerts.length) : null,
    longest: longest
      ? { slug: longest.slug, title: longest.title, durationSeconds: longest.durationSeconds, venue: longest.venue, city: longest.city, performedYear: longest.performedYear }
      : null,
    years: years.length >= MIN_FOR_BAND_STAT && from !== to ? { from, to } : null,
    averageSongs: lists.length >= MIN_FOR_BAND_STAT ? Math.round((lists.reduce((n, l) => n + l.length, 0) / lists.length) * 10) / 10 : null,
    opener: usualSong(ordered.map((l) => l[0]), ordered.length, key),
    closer: usualSong(ordered.map((l) => l[l.length - 1]), ordered.length, key),
    mostPlayed: lists.length >= MIN_FOR_BAND_STAT ? songTally(lists).filter((s) => s.count >= MIN_FOR_BAND_STAT).slice(0, TOP_SONGS) : [],
  };
}
