// Keyword targets (owner, 20 Nov 2026: the live site is fullconcert.live; rank for every phrase around
// "full concert"). The phrases each page type must carry in its <title> (and description), so the
// page answers the search people actually type. Built from the keyword research (src/lib/keywords.ts,
// npm run keywords) and from the domain itself: "full concert", "full concerts", "full concert live",
// "full rock concerts" for the home page; "full metal concert", "full punk concert"... for each genre
// page; "<band> full concert(s)" for a band; "<festival> <year> full concerts" for a festival edition.
// Every target comes from a template over the database, so a new band, genre or edition gets its
// targets with no manual step. Checked in tests/keyword-targets.test.ts against the real title builders.
// No imports from seo.ts (seo.ts reads the genre search names from here).
import type { GenreName } from "./catalogue";

/** The domain and the ways people type it: also the brand's alternate names (structured data). */
export const LIVE_DOMAIN = "fullconcert.live";
export const DOMAIN_BRAND_NAMES = ["fullconcert.live", "Full Concert Live", "fullconcert", "FullConcert"];

/**
 * The head terms around "full concert" (owner: mandatory, all of them). The page that should rank for
 * each one: the home page, unless a more precise page exists. Phrases that need a page we do not have
 * yet (an HD/4K list) point to the closest one and are reported as gaps by the keyword research.
 */
export const HEAD_TARGETS: { phrase: string; page: string }[] = [
  { phrase: "full concert", page: "/" },
  { phrase: "full concerts", page: "/" },
  { phrase: "full concert live", page: "/" },
  { phrase: "full concerts live", page: "/" },
  { phrase: "fullconcert", page: "/" },
  { phrase: "fullconcert live", page: "/" },
  { phrase: "full rock concert", page: "/" },
  { phrase: "full rock concerts", page: "/" },
  { phrase: "full live concert", page: "/" },
  { phrase: "live full concert", page: "/" },
  { phrase: "full concert video", page: "/" },
  { phrase: "full concert videos", page: "/" },
  { phrase: "full show", page: "/" },
  { phrase: "full shows", page: "/" },
  { phrase: "full set", page: "/" },
  { phrase: "complete concert", page: "/" },
  { phrase: "entire concert", page: "/" },
  { phrase: "whole concert", page: "/" },
  { phrase: "rock concert full", page: "/" },
  { phrase: "rock concerts full", page: "/" },
  { phrase: "full concerts online", page: "/concerts" },
  { phrase: "watch full concerts", page: "/concerts" },
  { phrase: "full concert hd", page: "/hd" },
  { phrase: "live full concert hd", page: "/hd" },
  { phrase: "full concert 4k", page: "/concerts" },
  { phrase: "full concert 1080p", page: "/hd" },
  { phrase: "pro shot full concert", page: "/hd" },
  { phrase: "best full concerts", page: "/best" },
  { phrase: "best rock concerts of all time", page: "/best/most-watched-rock-concerts" },
  { phrase: "most watched concerts", page: "/best/most-watched-rock-concerts" },
  { phrase: "full festival show", page: "/best/best-festival-rock-concerts" },
  { phrase: "festival full show", page: "/best/best-festival-rock-concerts" },
];

/** What the home page's title must contain (normalised: plural, case and punctuation do not matter). */
export const HOME_TITLE_TARGETS = ["full concert", "full concert live", "full rock concert"];

/**
 * How people write each genre in a search, for "full <genre> concert" (owner: natural spellings,
 * "full metal concert", "full trip hop concert"). `name` goes in the title; `also` are the other ways
 * of saying it, used by the keyword research to recognise the genre in a phrase.
 */
export const GENRE_SEARCH: Record<GenreName, { name: string; also: string[] }> = {
  "classic rock": { name: "Classic Rock", also: [] },
  "hard rock": { name: "Hard Rock", also: [] },
  punk: { name: "Punk", also: ["punk rock"] },
  "post-punk": { name: "Post-Punk", also: ["postpunk"] },
  "new wave / synth": { name: "New Wave", also: ["synth pop", "synthpop", "synth"] },
  indie: { name: "Indie", also: ["indie rock"] },
  alternative: { name: "Alternative Rock", also: ["alternative", "alt rock"] },
  grunge: { name: "Grunge", also: [] },
  metal: { name: "Metal", also: ["heavy metal"] },
  garage: { name: "Garage Rock", also: ["garage"] },
  shoegaze: { name: "Shoegaze", also: ["shoegazing"] },
  stoner: { name: "Stoner Rock", also: ["stoner", "desert rock"] },
  "emo / post-hardcore": { name: "Emo", also: ["post hardcore", "posthardcore"] },
  "trip hop": { name: "Trip Hop", also: ["triphop"] },
  "electronic rock / big beat": { name: "Big Beat", also: ["electronic rock"] },
  "art pop / experimental": { name: "Art Pop", also: ["experimental", "experimental rock"] },
};

/** "Metal", "Trip Hop", "New Wave"; a genre missing from the table is title-cased as it is. */
export function genreSearchName(name: string): string {
  const known = GENRE_SEARCH[name.toLowerCase() as GenreName];
  if (known) return known.name;
  return name.replace(/(^|[\s/(-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

/** Every way of writing a genre in a search, lower case, the title name first. */
export function genreSearchWords(name: string): string[] {
  const known = GENRE_SEARCH[name.toLowerCase() as GenreName];
  return [...new Set([genreSearchName(name).toLowerCase(), ...(known?.also ?? [])])];
}

/** "1990s" -> "90s"; decades from 2000 keep their label ("2000s"). */
export function shortDecade(label: string): string {
  return /^19\d0s$/.test(label) ? label.slice(2) : label;
}

/** The targets of each page type, built from the page's own data. */
export const targets = {
  home: (): string[] => HOME_TITLE_TARGETS,
  genre: (name: string): string[] => [`full ${genreSearchName(name).toLowerCase()} concert`, `full ${genreSearchName(name).toLowerCase()} concerts`],
  band: (name: string): string[] => [`${name} full concert`, `${name} full concerts`],
  venue: (name: string): string[] => [`${name} full concerts`],
  venueYear: (yearName: string): string[] => [`${yearName} full concerts`],
  decade: (label: string): string[] => [`full ${label} rock concerts`, `${shortDecade(label)} rock`],
  tour: (tourName: string): string[] => [`${tourName} full concerts`],
  song: (song: string): string[] => [`${song} live`],
};

/**
 * Text as a search engine compares it: lower case, accents and punctuation gone, "&" as "and", and
 * the plural of the head nouns folded ("Full Concerts" covers "full concert").
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(concert|show|set|setlist|version|gig)s\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the text carries the target phrase, as whole words in that order. */
export function hasTarget(text: string, target: string): boolean {
  return ` ${normalizeForMatch(text)} `.includes(` ${normalizeForMatch(target)} `);
}
