// Deep links into a concert ("key moments", owner 19 Nov 2026): /concerts/<slug>?t=315 opens the page
// and starts the concert at 5:15. Search engines use these links for each song of the setlist
// (Clip and SeekToAction in src/lib/structured-data.ts). Pure, tested in tests/start-time.test.ts.

/** The query parameter that carries the start time. */
export const START_PARAM = "t";

/** The page address that starts a concert at a second: "/concerts/x?t=315". */
export function startAtPath(slug: string, seconds: number): string {
  return `/concerts/${slug}?${START_PARAM}=${Math.max(0, Math.floor(seconds))}`;
}

/**
 * Seconds from a "t" value: "315", "315s", "5m15s", "1h2m3s" or "1:02:03". Null for anything else,
 * for 0, or past the end of the video when its length is given.
 */
export function parseStartTime(value: string | null | undefined, durationSeconds?: number): number | null {
  const v = value?.trim().toLowerCase();
  if (!v || v.length > 12) return null;
  let seconds: number | null = null;
  if (/^\d+s?$/.test(v)) seconds = parseInt(v, 10);
  else if (/^(\d+h)?(\d+m)?(\d+s)?$/.test(v)) {
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v)!;
    seconds = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  } else if (/^\d{1,2}(:\d{2}){1,2}$/.test(v)) {
    seconds = v.split(":").reduce((n, part) => n * 60 + Number(part), 0);
  }
  if (seconds === null || seconds <= 0) return null;
  if (durationSeconds !== undefined && seconds >= durationSeconds) return null;
  return seconds;
}
