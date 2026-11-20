// "Best of" rankings (owner, 20 Nov 2026): the most watched full rock concerts, overall, per decade,
// per genre and per kind of place (festival shows; clubs, halls and arenas). Ranked by the view count
// YouTube reports, which the nightly refresh keeps current, so every list re-ranks itself after each
// collector or refresh run. Numbers are always written "N views on YouTube" (copy rules).
// Pages: /best (every ranking) and /best/<slug>. A ranking is worth indexing from ten concerts
// (src/lib/seo.ts bestListIsStrong), the same rule the sitemap uses. Per band is not needed: band
// pages sort by "most watched".
// Pure functions, tested in tests/best.test.ts.
import { decadeOf, parseDecade } from "./catalogue";
import { bestListIsStrong, titleCase } from "./seo";
import { SITE_NAME } from "./site";
import { plural } from "./text";

/** Concerts in a ranking at most. */
export const BEST_SIZE = 50;

export type BestKind = "all" | "decade" | "genre" | "place";

export interface BestList {
  slug: string;
  kind: BestKind;
  /** The decade label ("1990s"), genre slug or venue kind slug; null for the overall list. */
  key: string | null;
  /** What is ranked, in running text: "full rock concerts of the 1990s", "full metal concerts". */
  subject: string;
  /** The ranking's short name for lists and links: "The 1990s", "Metal", "Festival shows". */
  label: string;
  /** Concerts available for the ranking (it shows at most BEST_SIZE). */
  count: number;
}

/** Kinds of place with a ranking of their own, and how they are written. Livestreams and TV studios are too few. */
export const PLACE_KINDS: Record<string, { slug: string; subject: string; label: string; heading: string }> = {
  festival: { slug: "best-festival-rock-concerts", subject: "full rock concerts at festivals", label: "Festival shows", heading: "Best Festival Rock Concerts" },
  room: {
    slug: "best-rock-concerts-in-clubs-and-arenas",
    subject: "full rock concerts in clubs, halls and arenas",
    label: "Clubs, halls and arenas",
    heading: "Best Rock Concerts in Clubs and Arenas",
  },
};

export const ALL_SLUG = "most-watched-rock-concerts";
export const decadeSlug = (label: string) => `most-watched-rock-concerts-${label}`;
export const genreSlug = (genre: string) => `best-live-${genre}-concerts`;

export function bestPath(slug: string): string {
  return `/best/${slug}`;
}

/** Every ranking the catalogue can make, overall first, then decades (oldest first), genres and places. */
export function bestLists(catalogue: {
  total: number;
  decades: { label: string; count: number }[];
  genres: { slug: string; name: string; count: number }[];
  venueKinds: { slug: string; count: number }[];
}): BestList[] {
  return [
    { slug: ALL_SLUG, kind: "all" as const, key: null, subject: "full rock concerts", label: "All time", count: catalogue.total },
    ...catalogue.decades
      .filter((d) => parseDecade(d.label) !== null)
      .map((d) => ({ slug: decadeSlug(d.label), kind: "decade" as const, key: d.label, subject: `full rock concerts of the ${d.label}`, label: `The ${d.label}`, count: d.count })),
    ...catalogue.genres.map((g) => ({
      slug: genreSlug(g.slug),
      kind: "genre" as const,
      key: g.slug,
      subject: `full ${g.name} concerts`,
      label: titleCase(g.name),
      count: g.count,
    })),
    ...catalogue.venueKinds
      .filter((k) => PLACE_KINDS[k.slug])
      .map((k) => ({ slug: PLACE_KINDS[k.slug].slug, kind: "place" as const, key: k.slug, subject: PLACE_KINDS[k.slug].subject, label: PLACE_KINDS[k.slug].label, count: k.count })),
  ].filter((l) => l.count > 0);
}

/** Concerts shown in a ranking: all of them up to BEST_SIZE. */
export const shownIn = (list: { count: number }) => Math.min(list.count, BEST_SIZE);

/** Whether a ranking is worth indexing (and is linked from other pages and listed in the sitemap). */
export const bestIsStrong = (list: { count: number }) => bestListIsStrong(shownIn(list));

/** "The 1990s" in a heading, "Metal", or the place heading. */
function headingOf(list: BestList, genreName?: string): string {
  switch (list.kind) {
    case "all":
      return "Most Watched Rock Concerts";
    case "decade":
      return `Most Watched Rock Concerts of the ${list.key}`;
    case "genre":
      return `Best Live ${titleCase(genreName ?? list.label)} Concerts`;
    default:
      return PLACE_KINDS[list.key!].heading;
  }
}

/** The page's name: "Most Watched Rock Concerts of the 1990s", "Best Live Metal Concerts". */
export function bestHeading(list: BestList): string {
  return headingOf(list);
}

/** "Most Watched Rock Concerts of the 1990s · Top 20 Full Shows" */
export function bestSearchTitle(list: BestList): string {
  return `${headingOf(list)} · Top ${shownIn(list)} Full Shows`;
}

interface RankedConcert {
  credits: string;
  venue: { name: string } | null;
  city: string | null;
  performedYear: number | null;
  viewCount: number;
}

const views = (n: number) => `${n.toLocaleString("en-GB")} views on YouTube`;
/** "Metallica at Pinkpop 1993", "Pixies in 2004", "Muse". */
export const rankedName = (c: RankedConcert) => {
  const place = c.venue?.name ?? c.city;
  return `${c.credits}${place ? ` at ${place}` : ""}${c.performedYear ? `${place ? " " : " in "}${c.performedYear}` : ""}`;
};

/** The answer-first lead: "The 50 most watched full rock concerts of the 1990s on STAGEDIVE, from X (N views on YouTube) to Y (M views on YouTube)." */
export function bestLead(list: BestList, ranked: RankedConcert[]): string {
  if (!ranked.length) return `No ${list.subject} are on ${SITE_NAME} right now.`;
  const first = ranked[0];
  const last = ranked[ranked.length - 1];
  const span =
    ranked.length === 1
      ? `: ${rankedName(first)} (${views(first.viewCount)})`
      : `, from ${rankedName(first)} (${views(first.viewCount)}) to ${rankedName(last)} (${views(last.viewCount)})`;
  return (
    `The ${ranked.length === 1 ? "most watched of the" : `${ranked.length} most watched`} ${list.subject} on ${SITE_NAME}${span}. ` +
    `Ranked by views on YouTube and updated every night. Every concert plays in full on its own page.`
  );
}

/** Questions for the Markdown copy, from the ranking only. */
export function bestQuestions(list: BestList, ranked: (RankedConcert & { artists: { name: string; role: "MAIN" | "WITH" }[] })[]): { question: string; answer: string }[] {
  if (!ranked.length) return [];
  const out = [
    {
      question: `What is the most watched of the ${list.subject} here?`,
      answer: `${rankedName(ranked[0])}, with ${views(ranked[0].viewCount)}.`,
    },
  ];
  const bands = new Map<string, number>();
  for (const c of ranked) for (const a of c.artists) if (a.role === "MAIN") bands.set(a.name, (bands.get(a.name) ?? 0) + 1);
  const top = [...bands.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (top && top[1] >= 2) {
    out.push({ question: `Which band has the most concerts in this ranking?`, answer: `${top[0]}, with ${plural(top[1], "concert")} in the top ${ranked.length}.` });
  }
  return out;
}

/** The rankings a concert counts towards (sitemap counts and dates). */
export function bestSlugsFor(c: { performedYear: number | null; genreSlugs: string[]; venueKindSlug?: string | null }): string[] {
  return [
    ALL_SLUG,
    ...(c.performedYear && parseDecade(decadeOf(c.performedYear)) !== null ? [decadeSlug(decadeOf(c.performedYear))] : []),
    ...c.genreSlugs.map(genreSlug),
    ...(c.venueKindSlug && PLACE_KINDS[c.venueKindSlug] ? [PLACE_KINDS[c.venueKindSlug].slug] : []),
  ];
}
