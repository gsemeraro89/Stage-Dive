// Festival and venue years (owner, 20 Nov 2026): one page per place and year, "Pinkpop 1995", listing
// every concert played there that year. People search festivals by edition ("Pinkpop 1995",
// "Glastonbury 1997"); a room works the same way ("Brixton Academy 1995").
// The page lives under its place: /venues/<slug>/<year>. Worth indexing from two concerts that year
// (src/lib/seo.ts venueYearIsStrong), the same rule the sitemap uses. Everything comes from the
// concerts' place and year, so a new concert opens or strengthens its year page by itself.
// Pure functions, tested in tests/venue-years.test.ts.
import { venueYearIsStrong } from "./seo";

/** A place and year with how many visible concerts it has. */
export interface VenueYear {
  slug: string;
  name: string;
  year: number;
  count: number;
}

/** The other concerts from a concert's place and year, for "More from Pinkpop 1995" on the concert page. */
export interface VenueYearLink<C = { slug: string; credits: string }> {
  /** "Pinkpop 1995" */
  name: string;
  path: string;
  /** Concerts that year, this one included. */
  count: number;
  others: C[];
}

/** "/venues/pinkpop/1995" */
export function venueYearPath(slug: string, year: number): string {
  return `/venues/${slug}/${year}`;
}

/** "1995" -> 1995; anything that is not a plain four-digit year -> null. */
export function parseYear(s: string): number | null {
  return /^(19|20)\d{2}$/.test(s) ? Number(s) : null;
}

/** How many concerts each year has, newest year first. Concerts without a year are left out. */
export function yearCounts(concerts: { performedYear: number | null }[]): { year: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const c of concerts) if (c.performedYear) counts.set(c.performedYear, (counts.get(c.performedYear) ?? 0) + 1);
  return [...counts.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year);
}

/**
 * The "By year" list of a venue page: each year links to its year page when that page is strong (two
 * concerts or more), else straight to its one concert, so no link leads to a thin page. Empty when no
 * year has a page of its own (the list would only repeat the concerts).
 */
export function venueYearLinks(
  venueSlug: string,
  concerts: { slug: string; performedYear: number | null }[],
): { year: number; count: number; href: string; page: boolean }[] {
  const years = yearCounts(concerts);
  if (!years.some((y) => venueYearIsStrong(y.count))) return [];
  return years.map((y) => {
    const page = venueYearIsStrong(y.count);
    const href = page ? venueYearPath(venueSlug, y.year) : `/concerts/${concerts.find((c) => c.performedYear === y.year)!.slug}`;
    return { ...y, href, page };
  });
}

/** Strong place-years played in a decade (1990 = 1990-1999), oldest first: the decade page links them. */
export function strongYearsInDecade(all: VenueYear[], start: number): VenueYear[] {
  return all.filter((v) => v.year >= start && v.year <= start + 9 && venueYearIsStrong(v.count)).sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
}

/** Whether a set of concerts is a festival (any of them in the Festival kind). */
export function isFestival(concerts: { venueKind: { slug: string } | null }[]): boolean {
  return concerts.some((c) => c.venueKind?.slug === "festival");
}
