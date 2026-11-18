// The words a gig is described with, the same on every page (design/DESIGN.md section 4: typed data
// in caps with triple slashes). Only facts we store: nothing here is ever made up.
import { formatDuration } from "@/lib/format";
import type { ConcertView } from "@/lib/queries";

export const mainArtist = (c: ConcertView) => c.artists.find((a) => a.role === "MAIN") ?? c.artists[0];
export const bandName = (c: ConcertView) => mainArtist(c)?.name ?? c.credits;

/** "06.06.2010", or the year when the day is not known. */
export function playedOn(c: ConcertView, shortYear = false): string | null {
  if (c.performedOn) {
    const d = new Date(c.performedOn);
    const year = String(d.getUTCFullYear());
    return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${shortYear ? year.slice(2) : year}`;
  }
  return c.performedYear ? String(c.performedYear) : null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "6 June 2010", or the year when the day is not known. */
export function playedOnLong(c: ConcertView): string | null {
  if (c.performedOn) {
    const d = new Date(c.performedOn);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  return c.performedYear ? String(c.performedYear) : null;
}

/** "Pinkpop 1996" */
export const placeYear = (c: ConcertView) => [c.venue?.name, c.performedYear].filter(Boolean).join(" ");

/** "PINKPOP 1996 /// 1:14:20" */
export const shortData = (c: ConcertView) => [placeYear(c), formatDuration(c.durationSeconds)].filter(Boolean).join(" /// ");

/** Festivals are "the fields", everything with a roof is "a room" (brand book board 04). */
export function kindWord(kind: { slug: string; name: string } | null | undefined): string | null {
  if (!kind) return null;
  if (kind.slug === "festival") return "Field";
  if (kind.slug === "room") return "Room";
  return kind.name;
}

/** Where a headline is cut: one strip for a short name, two for a long one, cut near the middle. */
export function cutName(name: string, max = 12): string[] {
  const words = name.split(" ");
  if (name.length <= max || words.length < 2) return [name];
  let best = 1;
  let bestGap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const gap = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (gap < bestGap) [best, bestGap] = [i, gap];
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/** "1 gig", "4 gigs" */
export const gigs = (n: number) => `${n} ${n === 1 ? "gig" : "gigs"}`;

/** "1994", "1994–2012", or null when no year is known. */
export function yearSpan(concerts: ConcertView[]): string | null {
  const years = concerts.map((c) => c.performedYear).filter((y): y is number => y !== null);
  if (!years.length) return null;
  const [first, last] = [Math.min(...years), Math.max(...years)];
  return first === last ? String(first) : `${first}–${last}`;
}

/** Total playing time in words: "7 hours", "50 minutes". */
export function hoursOf(concerts: ConcertView[]): string {
  const seconds = concerts.reduce((n, c) => n + c.durationSeconds, 0);
  if (seconds < 5400) return `${Math.max(1, Math.round(seconds / 60))} minutes`;
  return `${Math.round(seconds / 3600)} hours`;
}
