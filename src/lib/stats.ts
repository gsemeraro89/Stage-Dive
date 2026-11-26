// "STAGEDIVE in numbers" (/stats; owner, 26 Nov 2026, the FullDJSet plan's workstream 1): citable facts
// about the catalogue, so journalists and AI assistants can quote numbers with a source. Every figure is
// counted from our own database (never an estimate) and recomputed with the page (ISR, 10 minutes):
// - totals: concerts (official / bootlegs), bands with a page, festivals and venues, setlists, timed
//   songs, hours of music, years and decades covered, countries;
// - rankings (top 10, official concerts only, as every "best of" list): most watched of all time, the most
//   watched of each decade, bands and places with the most concerts, the longest concerts, and the most
//   played song live of each band (counted from every setlist, as on the song pages).
// The data is read in src/lib/stats-data.ts (siteStats). This file: pure functions, tested in tests/stats.test.ts.
import { ALL_SLUG, bestPath, rankedName } from "./best";
import { countryName } from "./places";
import type { ConcertView } from "./queries";
import { bestListIsStrong } from "./seo";
import { SITE_NAME } from "./site";
import { songPath } from "./songs";
import { quoted } from "./text";

export const STATS_PATH = "/stats";
export const STATS_HEADING = `${SITE_NAME} in Numbers`;
/** The page's full title (the layout's "· STAGEDIVE" template is not added: the name is already in it). */
export const STATS_TITLE = `${SITE_NAME} in Numbers · Most Watched Rock Concerts, Bands and Festivals`;
/** Entries in each ranking. */
export const STATS_RANK_SIZE = 10;

/** Worth indexing (and listing in the sitemap and llms files) from ten official concerts, like a ranking. */
export const statsIsStrong = (officialConcerts: number) => bestListIsStrong(officialConcerts);

/** A band or a place with how many official concerts it has. */
export interface CountRow {
  slug: string;
  name: string;
  concerts: number;
}

/** A band's most played song live: how many setlists on the site have it. */
export interface SongRow {
  band: { slug: string; name: string };
  slug: string;
  title: string;
  versions: number;
}

/** A decade: its official concerts and the most watched of them. */
export interface DecadeRow {
  label: string;
  concerts: number;
  top: ConcertView | null;
}

export interface StatsTotals {
  /** Every concert listed (official + bootlegs). */
  concerts: number;
  official: number;
  bootlegs: number;
  /** Bands with a page (a concert of their own). */
  bands: number;
  /** Festivals and venues with a concert; `festivals` of them hold a festival show. */
  places: number;
  festivals: number;
  /** Concerts with a setlist, and the songs in them with a start time (a click plays from there). */
  withSetlist: number;
  timedSongs: number;
  /** Different songs played live (per band, as on the song pages). */
  songs: number;
  /** Total length of every concert, in seconds. */
  seconds: number;
  /** The earliest and latest year a concert was played (null when no year is known). */
  firstYear: number | null;
  lastYear: number | null;
  /** Decades with concerts. */
  decades: number;
  /** Countries concerts were played in (the four UK nations count as one). */
  countries: number;
}

export interface SiteStats {
  totals: StatsTotals;
  mostWatched: ConcertView[];
  /** Every decade with official concerts, oldest first. */
  decades: DecadeRow[];
  bands: CountRow[];
  places: CountRow[];
  longest: ConcertView[];
  songs: SongRow[];
  /** When the data was last refreshed (the newest refresh of a concert's views and status). */
  updatedAt: Date;
}

// ---- Pure helpers ----

/** 1234567 -> "1,234,567" (thousands separators, the way every figure on the page is written). */
export const num = (n: number) => n.toLocaleString("en-GB");

/** Hours of music, rounded down to whole hours. */
export const hoursOf = (seconds: number) => Math.floor(seconds / 3600);

/** England, Scotland, Wales and Northern Ireland are written apart on concerts (src/lib/places.ts); one country here. */
const UK_NATIONS = new Set(["England", "Scotland", "Wales", "Northern Ireland"]);

/** How many different countries, from the countries stored on concerts (any spelling, empty ignored). Pure. */
export function countCountries(values: (string | null)[]): number {
  const names = new Set<string>();
  for (const v of values) {
    const name = countryName(v);
    if (name) names.add(UK_NATIONS.has(name) ? "United Kingdom" : name);
  }
  return names.size;
}

/** Most first, then A-Z; the first `n`. Pure. */
export function topCounts(rows: CountRow[], n = STATS_RANK_SIZE): CountRow[] {
  return [...rows].sort((a, b) => b.concerts - a.concerts || a.name.localeCompare(b.name)).slice(0, n);
}

/**
 * The most played song live, one per band: each band's song with the most live versions, then the bands'
 * songs ranked by versions (ties A-Z). A song needs two versions (one is a single setlist). Pure.
 */
export function topSongsPerBand(bands: { slug: string; name: string; songs: { slug: string; title: string; versions: number }[] }[], n = STATS_RANK_SIZE): SongRow[] {
  const best = bands.flatMap((b) => {
    const s = [...b.songs].filter((x) => x.versions >= 2).sort((x, y) => y.versions - x.versions || x.title.localeCompare(y.title))[0];
    return s ? [{ band: { slug: b.slug, name: b.name }, slug: s.slug, title: s.title, versions: s.versions }] : [];
  });
  return best.sort((a, b) => b.versions - a.versions || a.title.localeCompare(b.title) || a.band.name.localeCompare(b.band.name)).slice(0, n);
}

/** The decade with the most official concerts (the earlier one on a tie); null when none. Pure. */
export function mostCoveredDecade(decades: DecadeRow[]): DecadeRow | null {
  return decades.reduce<DecadeRow | null>((best, d) => (!best || d.concerts > best.concerts ? d : best), null);
}

/**
 * A ranked concert's name with its headline band(s) only ("Bródy János at Sziget Festival 2026", not every
 * guest of the night): the guests are on the concert's own page. Pure.
 */
export function concertName(c: Parameters<typeof rankedName>[0] & { artists?: { name: string; role: "MAIN" | "WITH" }[] }): string {
  const main = (c.artists ?? []).filter((a) => a.role === "MAIN").map((a) => a.name);
  return rankedName({ ...c, credits: main.length ? main.join(" & ") : c.credits });
}

const views = (n: number) => `${num(n)} views on YouTube`;
const share = (part: number, whole: number) => `${whole ? Math.round((part / whole) * 100) : 0}%`;
const s = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

/** "1h 47m" style is for players; here lengths are spoken: "3 hours 33 minutes". */
export function lengthWords(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [h ? s(h, "hour") : "", m ? s(m, "minute") : ""].filter(Boolean).join(" ") || "under a minute";
}

/**
 * The answer-first lead: what the site holds, in one sentence, then the most watched concert. Numbers
 * with thousands separators; a fact we do not hold is left out. Pure.
 */
export function statsLead(st: Pick<SiteStats, "totals" | "mostWatched">): string {
  const t = st.totals;
  if (!t.concerts) return `No full rock concerts are on ${SITE_NAME} right now.`;
  const kinds = t.bootlegs ? ` (${num(t.official)} official, ${s(t.bootlegs, "bootleg")})` : "";
  const where = t.places ? `, from ${s(t.places, "festival and venue", "festivals and venues")}${t.countries ? ` in ${s(t.countries, "country", "countries")}` : ""}` : "";
  const when = t.firstYear && t.lastYear ? (t.firstYear === t.lastYear ? `, played in ${t.firstYear}` : `, played between ${t.firstYear} and ${t.lastYear}`) : "";
  const top = st.mostWatched[0];
  return (
    `${SITE_NAME} holds ${s(t.concerts, "full rock concert")}${kinds} by ${s(t.bands, "band")}${where}${when}: ` +
    `about ${s(hoursOf(t.seconds), "hour")} of music, ${num(t.withSetlist)} with a setlist.` +
    (top ? ` The most watched is ${concertName(top)}, with ${views(top.viewCount)}.` : "")
  );
}

/** The figures as short sentences that stand on their own (page facts, Markdown copy, Dataset description). Pure. */
export function statsFacts(st: SiteStats): string[] {
  const t = st.totals;
  if (!t.concerts) return [statsLead(st)];
  const facts = [statsLead(st)];
  facts.push(
    `Together the concerts last about ${s(hoursOf(t.seconds), "hour")}. ${num(t.withSetlist)} of them (${share(t.withSetlist, t.concerts)}) come with a setlist` +
      (t.timedSongs ? `, with ${s(t.timedSongs, "song")} timed so a click plays the concert from that song` : "") +
      (t.songs ? `; ${s(t.songs, "different song")} are played live across them, counted band by band` : "") +
      ".",
  );
  if (t.decades && t.firstYear) facts.push(`The concerts span ${s(t.decades, "decade")}, from ${t.firstYear} to ${t.lastYear}.`);
  const band = st.bands[0];
  if (band) facts.push(`The band with the most official concerts is ${band.name}, with ${num(band.concerts)}.`);
  const place = st.places[0];
  if (place) facts.push(`The festival or venue with the most official concerts is ${place.name}, with ${num(place.concerts)}.`);
  const decade = mostCoveredDecade(st.decades);
  if (decade) facts.push(`The most covered decade is the ${decade.label}, with ${s(decade.concerts, "official concert")}.`);
  const longest = st.longest[0];
  if (longest) facts.push(`The longest official concert is ${concertName(longest)}, at ${lengthWords(longest.durationSeconds)}.`);
  const song = st.songs[0];
  if (song) facts.push(`The most played song live of any band is ${quoted(song.title)} by ${song.band.name}, in ${s(song.versions, "setlist")}.`);
  return facts;
}

/** How the numbers are made (page paragraph and Markdown copy). */
export const STATS_METHOD =
  `Every figure is counted from the concerts listed on ${SITE_NAME}, straight from our database, and recalculated at least every 10 minutes. ` +
  `A concert is one band's whole show of 40 minutes or more, counted only while it can be played here. ` +
  `Official concerts come first: from festival, broadcaster, band and label channels. Bootlegs (complete, professionally filmed shows shared by fans) count in the totals and the songs, and are left out of the rankings. ` +
  `Views are the views on YouTube, refreshed every night. Years are the years the concerts were played. Songs are counted from the setlists, as on the song pages. ` +
  `Only facts we hold are counted: a concert whose year, place or setlist is not known is left out of that figure.`;

/** Where a ranked concert, band, place or song links. */
export const concertPath = (c: { slug: string }) => `/concerts/${c.slug}`;
export const bandPath = (b: { slug: string }) => `/artists/${b.slug}`;
export const placePath = (p: { slug: string }) => `/venues/${p.slug}`;
export const decadePath = (label: string) => `/decades/${label}`;
export const songRowPath = (x: SongRow) => songPath(x.band.slug, x.slug);
export const mostWatchedPath = bestPath(ALL_SLUG);

/** The rankings as ItemLists (structured data and Markdown use the same names). */
export const RANKINGS = {
  mostWatched: "The 10 most watched rock concerts",
  decades: "The most watched concert of each decade",
  bands: "Bands with the most concerts",
  places: "Festivals and venues with the most concerts",
  longest: "The 10 longest concerts",
  songs: "Most played songs live, one per band",
} as const;

/** Every ranking as [name, items]: what the page lists, in its order (structured data, tests). Pure. */
export function rankingItems(st: SiteStats): [name: string, items: { path: string; name: string }[]][] {
  const concerts = (xs: ConcertView[]) => xs.map((c) => ({ path: concertPath(c), name: concertName(c) }));
  return (
    [
      [RANKINGS.mostWatched, concerts(st.mostWatched)],
      [RANKINGS.decades, concerts(st.decades.flatMap((d) => (d.top ? [d.top] : [])))],
      [RANKINGS.bands, st.bands.map((b) => ({ path: bandPath(b), name: b.name }))],
      [RANKINGS.places, st.places.map((p) => ({ path: placePath(p), name: p.name }))],
      [RANKINGS.longest, concerts(st.longest)],
      [RANKINGS.songs, st.songs.map((x) => ({ path: songRowPath(x), name: `${x.title} by ${x.band.name}` }))],
    ] as [string, { path: string; name: string }[]][]
  ).filter(([, items]) => items.length > 0);
}

/** Questions answered from the figures only (the Markdown copy; the page shows the same facts as text). Pure. */
export function statsQuestions(st: SiteStats): { question: string; answer: string }[] {
  const t = st.totals;
  if (!t.concerts) return [];
  const out = [
    {
      question: `How many full rock concerts are on ${SITE_NAME}?`,
      answer: `${s(t.concerts, "full concert")}${t.bootlegs ? ` (${num(t.official)} official, ${s(t.bootlegs, "bootleg")})` : ""} by ${s(t.bands, "band")}, about ${s(hoursOf(t.seconds), "hour")} of music.`,
    },
  ];
  const top = st.mostWatched[0];
  if (top) out.push({ question: `What is the most watched rock concert on ${SITE_NAME}?`, answer: `${concertName(top)}, with ${views(top.viewCount)}.` });
  if (st.bands[0]) out.push({ question: `Which band has the most full concerts on ${SITE_NAME}?`, answer: `${st.bands[0].name}, with ${s(st.bands[0].concerts, "official concert")}.` });
  if (st.places[0]) out.push({ question: `Which festival or venue has the most full concerts on ${SITE_NAME}?`, answer: `${st.places[0].name}, with ${s(st.places[0].concerts, "official concert")}.` });
  const decade = mostCoveredDecade(st.decades);
  if (decade) out.push({ question: `Which decade has the most full concerts on ${SITE_NAME}?`, answer: `The ${decade.label}, with ${s(decade.concerts, "official concert")}.` });
  if (st.longest[0]) out.push({ question: `What is the longest concert on ${SITE_NAME}?`, answer: `${concertName(st.longest[0])}, at ${lengthWords(st.longest[0].durationSeconds)}.` });
  if (st.songs[0])
    out.push({ question: `Which song is played live most often on ${SITE_NAME}?`, answer: `${quoted(st.songs[0].title)} by ${st.songs[0].band.name}, in ${s(st.songs[0].versions, "setlist")}.` });
  return out;
}

/** "2026-11-26": the date the figures were last refreshed (visible on the page and in dateModified). */
export const statsDate = (st: Pick<SiteStats, "updatedAt">) => st.updatedAt.toISOString().slice(0, 10);
