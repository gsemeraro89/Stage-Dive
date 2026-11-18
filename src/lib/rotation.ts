// The home page features a different artist each day, in turn.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since 1 Jan 1970 (UTC). Changes at midnight UTC. */
export function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

/**
 * Pick one item for the given day. Each day moves to the next item, wrapping around,
 * so with 12 artists every artist is featured once every 12 days.
 */
export function pickForDay<T>(items: T[], date: Date): T | null {
  if (items.length === 0) return null;
  return items[dayNumber(date) % items.length];
}
