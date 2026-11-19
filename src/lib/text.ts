// Small helpers that turn data into plain English, shared by the answers (src/lib/answers.ts), the
// concert notes (src/lib/concert-notes.ts) and the Markdown copies (src/lib/llms.ts). Pure functions.
import { formatDuration } from "./format";

/** "A", "A and B", "A, B and C". */
export function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** "1 concert", "4 concerts". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1 hour 32 minutes", "58 minutes", "3 hours". */
export function spokenDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  const parts = [h ? plural(h, "hour") : "", m ? plural(m, "minute") : ""].filter(Boolean);
  return parts.join(" ") || formatDuration(seconds);
}

/** Total playing time, rounded: "50 minutes", "7 hours". */
export function spokenTotal(seconds: number): string {
  if (seconds < 5400) return plural(Math.max(1, Math.round(seconds / 60)), "minute");
  return plural(Math.round(seconds / 3600), "hour");
}

/** 1 -> "1st", 2 -> "2nd", 13 -> "13th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "on 1 November 1991", "in 1991", or null when the date is not known. When it was played, never when it went online. */
export function whenWords(c: { performedOn: Date | null; performedYear: number | null }): string | null {
  if (c.performedOn) {
    const d = new Date(c.performedOn);
    return `on ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  return c.performedYear ? `in ${c.performedYear}` : null;
}

/** The most frequent values, most frequent first (ties in first-seen order). */
export function topCounts(values: string[], n: number): string[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([v]) => v);
}

/** One key per song, so "One (Live)" and "one" count as the same song. */
export function songKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\((live|remix|intro|outro|reprise|acoustic)[^)]*\)|\[[^\]]*\]/g, "")
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Songs that turn up in more than one setlist, most setlists first (a song counts once per setlist).
 * Each setlist is a list of song titles; the first spelling seen is kept.
 */
export function songCounts(setlists: string[][], min = 2): { title: string; count: number }[] {
  const counts = new Map<string, { title: string; count: number; first: number }>();
  let order = 0;
  for (const list of setlists) {
    const seen = new Set<string>();
    for (const title of list) {
      const key = songKey(title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const e = counts.get(key) ?? { title, count: 0, first: order++ };
      e.count++;
      counts.set(key, e);
    }
  }
  return [...counts.values()]
    .filter((e) => e.count >= min)
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .map(({ title, count }) => ({ title, count }));
}

/** “Title” in curly quotes, as song names are written in running text. */
export const quoted = (title: string) => `“${title}”`;
