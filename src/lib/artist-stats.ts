// The five figures on an artist page, computed from that artist's sets.

export interface ArtistStats {
  sets: number;
  totalSeconds: number;
  /** Whole hours of music, rounded to the nearest hour (at least 1 when there is any music). */
  hours: number;
  totalViews: number;
  firstYear: number | null;
  lastYear: number | null;
  /** Number of calendar years between the first and the latest upload, inclusive. */
  yearsOnYouTube: number;
  countries: number;
}

export function computeArtistStats(
  sets: { durationSeconds: number; viewCount: number; publishedAt: Date; country: string | null }[],
): ArtistStats {
  const totalSeconds = sets.reduce((n, s) => n + s.durationSeconds, 0);
  const years = sets.map((s) => s.publishedAt.getUTCFullYear());
  const firstYear = years.length ? Math.min(...years) : null;
  const lastYear = years.length ? Math.max(...years) : null;
  return {
    sets: sets.length,
    totalSeconds,
    hours: totalSeconds ? Math.max(1, Math.round(totalSeconds / 3600)) : 0,
    totalViews: sets.reduce((n, s) => n + s.viewCount, 0),
    firstYear,
    lastYear,
    yearsOnYouTube: firstYear !== null && lastYear !== null ? lastYear - firstYear + 1 : 0,
    countries: new Set(sets.map((s) => s.country).filter(Boolean)).size,
  };
}

/** Group sets by upload year, newest year first, newest set first inside a year. */
export function groupByYear<T extends { publishedAt: Date }>(sets: T[]): { year: number; sets: T[] }[] {
  const byYear = new Map<number, T[]>();
  for (const set of [...sets].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())) {
    const year = set.publishedAt.getUTCFullYear();
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(set);
  }
  return [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, sets]) => ({ year, sets }));
}
