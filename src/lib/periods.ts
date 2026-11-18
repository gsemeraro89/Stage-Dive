// Calendar periods for "This month" and the year pages (owner, 17 Nov 2026, BRIEF 4.10).
// Months and years follow the YouTube upload date (sets.published_at), in UTC.

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** First year a year page can exist for (older uploads are rare and stay in the full list). */
export const FIRST_YEAR = 2005;

export interface Month {
  year: number;
  /** 1–12 */
  month: number;
}

/** The month a date falls in. */
export function monthOf(date: Date): Month {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** [start, end) of a month, for a database range query. */
export function monthRange({ year, month }: Month): { start: Date; end: Date } {
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

/** [start, end) of a year. */
export function yearRange(year: number): { start: Date; end: Date } {
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

/** "November 2026" */
export function monthLabel({ year, month }: Month): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "11" — the month as it appears in URLs. */
export function monthSlug(month: number): string {
  return String(month).padStart(2, "0");
}

/** URL of a month page. */
export function monthHref({ year, month }: Month): string {
  return `/sets/year/${year}/${monthSlug(month)}`;
}

/** The month before. */
export function previousMonth({ year, month }: Month): Month {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/**
 * The year the menu links to. In January it is still last year, so the menu never points at an
 * almost empty page; from 1 February it is the current year (owner: "it becomes 2027 in late January").
 */
export function menuYear(now: Date): number {
  return now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

/** A year from a URL, or null if it is malformed, too old or in the future. */
export function parseYear(text: string, now: Date): number | null {
  if (!/^\d{4}$/.test(text)) return null;
  const year = Number(text);
  return year >= FIRST_YEAR && year <= now.getUTCFullYear() ? year : null;
}

/** A month from a URL ("01"–"12"), or null. A month that has not started yet is null too. */
export function parseMonth(year: number, text: string, now: Date): Month | null {
  if (!/^(0[1-9]|1[0-2])$/.test(text)) return null;
  const m = { year, month: Number(text) };
  const current = monthOf(now);
  return m.year * 12 + m.month > current.year * 12 + current.month ? null : m;
}

/** "Oct '26" — short month label for menus. */
export function shortMonthLabel({ year, month }: Month): string {
  return `${MONTH_NAMES[month - 1].slice(0, 3)} '${String(year).slice(2)}`;
}

export interface PeriodIndex {
  /** Months that have sets, newest first, at most `maxMonths`. */
  months: (Month & { count: number })[];
  /** Years that have sets, newest first. */
  years: { year: number; count: number }[];
}

/** Count upload dates into months and years. Future dates (clock skew) are ignored. */
export function buildPeriodIndex(dates: Date[], now: Date, maxMonths = 12): PeriodIndex {
  const current = monthOf(now);
  const limit = current.year * 12 + current.month;
  const months = new Map<number, number>();
  const years = new Map<number, number>();
  for (const d of dates) {
    const m = monthOf(d);
    const key = m.year * 12 + m.month;
    if (key > limit || m.year < FIRST_YEAR) continue;
    months.set(key, (months.get(key) ?? 0) + 1);
    years.set(m.year, (years.get(m.year) ?? 0) + 1);
  }
  return {
    months: [...months.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, maxMonths)
      .map(([key, count]) => ({ year: Math.floor((key - 1) / 12), month: ((key - 1) % 12) + 1, count })),
    years: [...years.entries()].sort((a, b) => b[0] - a[0]).map(([year, count]) => ({ year, count })),
  };
}
