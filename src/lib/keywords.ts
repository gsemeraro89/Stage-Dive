// Keyword research (owner, 20 Nov 2026: "a full, comprehensive keyword list and very advanced
// indexing" for https://fullconcert.live). Free: what people type is read from Google's and Bing's
// search suggestions (autocomplete), seeded from our own database (every band with a concert, its
// festivals, venues and years, genres, decades, tours, the songs with the most live versions) and from
// the head terms around "full concert". Suggestions are ranked by the engines on demand, so a phrase
// returned for several seeds and by both engines is in real demand.
// Each phrase gets an intent and the page of ours that should rank for it, or a GAP naming the page
// type that would serve it. Lessons from OpenDecks (same tool): match a phrase to a band or a place
// only when its whole name is in it (Bing returns generic noise), drop noise (gear, prices, lyrics,
// namesakes, films), print the most important rows last in the job log.
// Pure functions here, tested in tests/keywords.test.ts; the network part is scripts/keywords.ts.
import { genreSearchWords, HEAD_TARGETS, normalizeForMatch } from "./keyword-targets";

// ---- The catalogue the seeds and the page matching are built from ----

export interface KwBand {
  name: string;
  slug: string;
  aka?: string | null;
  concerts: number;
  /** Years it played the concerts we have. */
  years: number[];
  /** Festivals (names) it played in the concerts we have. */
  festivals: string[];
  /** Other places (names) it played. */
  venues: string[];
  /** It has a "songs played live" page (/songs/<slug>). */
  hasSongs?: boolean;
}
export interface KwVenue {
  name: string;
  slug: string;
  concerts: number;
  festival: boolean;
}
export interface KwVenueYear {
  slug: string;
  name: string;
  year: number;
  count: number;
}
export interface KwConcert {
  slug: string;
  /** Slugs of the headline bands. */
  bands: string[];
  venueSlug: string | null;
  year: number | null;
  hasSetlist: boolean;
}
export interface KwCatalogue {
  bands: KwBand[];
  venues: KwVenue[];
  venueYears: KwVenueYear[];
  genres: { name: string; slug: string; count: number }[];
  decades: { label: string; count: number }[];
  tours: { name: string; slug: string; band: string | null; bandSlug: string | null; count: number }[];
  songs: { title: string; slug: string; band: string; bandSlug: string; versions: number }[];
  concerts: KwConcert[];
  /** The "best of" rankings (src/lib/best.ts) and whether each is strong enough to be shown and indexed. */
  bests: { slug: string; kind: "all" | "decade" | "genre" | "place"; key: string | null; strong: boolean }[];
}

// ---- Seeds ----

export type SeedKind = "head" | "expand" | "band" | "festival" | "venue" | "venue-year" | "genre" | "decade" | "tour" | "song";

export interface Seed {
  query: string;
  kind: SeedKind;
  /** What the seed is about (a band, a festival...), for strict matching of short names. */
  subject: string;
}

/** Everything a top band is asked with (owner list, 20 Nov 2026). Years, festivals and venues are added per band. */
export const BAND_MODIFIERS = [
  "",
  " full concert",
  " live",
  " live full concert",
  " full show",
  " concert",
  " live concert",
  " setlist",
  " best live",
  " live album",
  " concert video",
  " live hd",
  " live 1080p",
  " live 4k",
  " pro shot",
  " bootleg",
  " live at",
  " tour",
  " last concert",
  " first concert",
  " reunion",
  " rockpalast",
  " full concert hd",
];
/** The other bands get the core questions only (the request budget). */
export const LIGHT_BAND_MODIFIERS = ["", " full concert", " live", " live full concert", " setlist"];
export const FESTIVAL_MODIFIERS = ["", " full concert", " full concerts", " full show", " lineup", " setlist", " live", " concerts", " best performances"];
export const FESTIVAL_YEAR_MODIFIERS = ["", " full show", " full concert", " lineup", " setlist"];
export const VENUE_MODIFIERS = ["", " concert", " live", " full concert"];
/** Genre seeds, "{g}" is the genre as people write it ("metal", "trip hop"). */
export const GENRE_PATTERNS = ["full {g} concert", "{g} full concert", "{g} live concert", "best {g} live", "{g} concerts", "best live {g} concerts", "{g} concert full", "{g} live full concert"];
export const DECADE_PATTERNS = ["{d} rock concert", "{d} rock concert full", "{d} rock concerts", "best {d} concerts", "{d} live concert", "{d} concert full", "{d} rock live"];

/** The head terms of the niche (owner: every phrase around "full concert", plus the rock head terms). */
export const HEAD_TERMS = [
  ...HEAD_TARGETS.map((t) => t.phrase),
  "full concert live hd",
  "full concert youtube",
  "full concert free",
  "full concert rock",
  "full concert 2026",
  "full concert 2025",
  "full concert 1080p hd",
  "full concerts on youtube",
  "full concert pro shot",
  "full live show",
  "full set live",
  "full live performance",
  "complete show",
  "complete live show",
  "entire show",
  "rock concert",
  "rock concerts",
  "rock concert full",
  "live concert",
  "live concerts",
  "concert video",
  "concert videos",
  "concert full",
  "concert film",
  "concert films",
  "best concert films",
  "best live performances",
  "best live performances of all time",
  "best rock concerts",
  "best rock concerts of all time",
  "best live concerts",
  "best concerts of all time",
  "greatest concerts of all time",
  "legendary concerts",
  "legendary rock concerts",
  "iconic concerts",
  "famous concerts",
  "80s rock concert",
  "90s rock concert",
  "70s rock concert",
  "60s rock concert",
  "2000s rock concert",
  "metal concert full",
  "punk concert full",
  "grunge concert full",
  "festival full show",
  "festival full concert",
  "festival live stream",
  "pinkpop full concert",
  "pinkpop full show",
  "rockpalast full concert",
  "rockpalast",
  "rock am ring full concert",
  "glastonbury full set",
  "reading festival full set",
  "rock in rio full show",
  "primavera sound full concert",
  "arte concert full",
  "live at the bbc",
  "pro shot concert",
  "bootleg concert",
  "live concert dvd",
  "live album",
  "setlist",
  "concert setlist",
  "live in concert",
  "unplugged full concert",
  "mtv unplugged full",
  "live at wembley",
  "live at red rocks",
  "live at the royal albert hall",
  "woodstock full concert",
  "live aid full concert",
  "reunion concert",
  "last concert",
  "farewell concert",
  "stagedive",
  "stage dive concerts",
];

/** Head terms expanded letter by letter and digit by digit ("full concert a", "full concert 1"...): the long tail. */
export const EXPANDED_HEADS = [
  "full concert",
  "full concerts",
  "full concert live",
  "full rock concert",
  "live full concert",
  "full show",
  "rock concert",
  "live concert",
  "concert video",
  "best live performances",
  "pinkpop",
  "rockpalast",
];
export const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
export const DIGITS = "0123456789".split("");

export interface SeedLimits {
  /** Bands asked with every modifier (most concerts first). */
  fullBands?: number;
  /** Bands asked at all (the rest of the top get the light modifiers). Default: all. */
  bands?: number;
  /** Festivals and venues asked (most concerts first). */
  venues?: number;
  /** Songs asked (most live versions first). */
  songs?: number;
  /** Years per festival asked ("pinkpop 1995 lineup"). */
  yearsPerFestival?: number;
  /** Letter and digit expansion of the head terms (default true). */
  longTail?: boolean;
}

export const DEFAULT_LIMITS: Required<SeedLimits> = { fullBands: 150, bands: 100_000, venues: 120, songs: 300, yearsPerFestival: 6, longTail: true };

/** A festival's name as people type it in a seed. */
const typedName = (name: string) => {
  const short = placeShortName(name);
  return short && !isAmbiguous(short) ? short : name;
};
const lower = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const byCount = <T>(xs: T[], n: number, count: (x: T) => number) => [...xs].sort((a, b) => count(b) - count(a)).slice(0, n);
const newest = (ys: number[], n: number) => [...new Set(ys)].sort((a, b) => b - a).slice(0, n);

/**
 * Every seed, most important first (a run that hits its time budget drops the end of the list):
 * head terms, genres, decades, festivals and their years, top bands, tours, songs, the long tail,
 * other venues, then the other bands. Duplicate queries are asked once.
 */
export function buildSeeds(cat: KwCatalogue, limits: SeedLimits = {}): Seed[] {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  const out: Seed[] = [];
  const add = (query: string, kind: SeedKind, subject: string) => out.push({ query: lower(query), kind, subject });

  for (const q of HEAD_TERMS) add(q, "head", q);
  for (const g of cat.genres.filter((x) => x.count > 0))
    for (const word of genreSearchWords(g.name)) for (const p of GENRE_PATTERNS) add(p.replace("{g}", word), "genre", g.name);
  for (const d of cat.decades.filter((x) => x.count > 0)) {
    const short = /^19\d0s$/.test(d.label) ? d.label.slice(2) : d.label;
    for (const p of DECADE_PATTERNS) add(p.replace("{d}", short), "decade", d.label);
    if (short !== d.label) add(`${d.label} rock concerts`, "decade", d.label);
  }
  const venues = byCount(cat.venues, lim.venues, (v) => v.concerts);
  // Festivals by the name people type ("glastonbury", not "glastonbury festival"), unless that is an ordinary word.
  const typed = (v: KwVenue) => typedName(v.name);
  for (const f of venues.filter((v) => v.festival)) {
    for (const m of FESTIVAL_MODIFIERS) add(`${typed(f)}${m}`, "festival", f.name);
    const years = newest(cat.venueYears.filter((y) => y.slug === f.slug).map((y) => y.year), lim.yearsPerFestival);
    for (const y of years) for (const m of FESTIVAL_YEAR_MODIFIERS) add(`${typed(f)} ${y}${m}`, "venue-year", f.name);
  }
  const bands = byCount(cat.bands, lim.bands, (b) => b.concerts);
  const full = bands.slice(0, lim.fullBands);
  for (const b of full) {
    for (const m of BAND_MODIFIERS) add(`${b.name}${m}`, "band", b.name);
    for (const y of newest(b.years, 3)) {
      add(`${b.name} live ${y}`, "band", b.name);
      add(`${b.name} tour ${y}`, "band", b.name);
    }
    for (const f of [...new Set(b.festivals)].slice(0, 3)) add(`${b.name} at ${typedName(f)}`, "band", b.name);
    for (const v of [...new Set(b.venues)].slice(0, 2)) add(`${b.name} live at ${v}`, "band", b.name);
  }
  for (const t of cat.tours.filter((x) => x.count > 0)) {
    if (t.band) add(`${t.band} ${t.name}`, "tour", t.band);
    for (const m of [" full concert", " live", " setlist"]) add(`${t.name}${m}`, "tour", t.band ?? t.name);
  }
  for (const s of byCount(cat.songs, lim.songs, (x) => x.versions)) {
    add(`${s.band} ${s.title} live`, "song", s.band);
    add(`${s.band} ${s.title} live version`, "song", s.band);
    // A short title alone ("One live") would bring back anything: only longer titles are asked alone.
    if (s.title.length >= 8) {
      add(`${s.title} live`, "song", s.band);
      add(`${s.title} live version`, "song", s.band);
    }
  }
  if (lim.longTail) for (const head of EXPANDED_HEADS) for (const c of [...ALPHABET, ...DIGITS]) add(`${head} ${c}`, "expand", head);
  for (const v of venues.filter((x) => !x.festival)) {
    for (const m of VENUE_MODIFIERS) add(`${v.name}${m}`, "venue", v.name);
    add(`live at ${v.name}`, "venue", v.name);
  }
  for (const b of bands.slice(lim.fullBands)) for (const m of LIGHT_BAND_MODIFIERS) add(`${b.name}${m}`, "band", b.name);

  const seen = new Set<string>();
  return out.filter((s) => s.query && !seen.has(s.query) && seen.add(s.query));
}

// ---- Noise ----

/**
 * What is not ours, whatever the band: gear, lessons, lyrics, merchandise, prices and sales,
 * piracy, games, celebrity gossip, films that are not concert films, documentaries (product rule).
 * Tested on the phrase once the names we know (bands, places, songs) are taken out of it, so
 * "Grateful Dead", "Death Cab for Cutie" or a song called "Guitar Man" are never dropped as noise.
 */
const NOISE = new RegExp(
  [
    "chords?", "tabs?", "tablature", "lyrics?", "letra", "karaoke", "lessons?", "tutorial", "how to play", "sheet music", "backing track",
    "guitar", "bass tabs", "drum cover", "drum kit", "amp", "pedals?", "gear", "rig",
    "covers?", "reaction", "reacts?", "react", "merch", "t ?shirts?", "shirts?", "hoodie", "posters?", "vinyl", "lp", "cd",
    "for sale", "price", "prices", "cost", "cheap", "resale", "buy", "ebay", "amazon",
    "download", "mp3", "torrent", "flac", "zip", "rar", "spotify", "apple music", "soundcloud",
    "ai", "meme", "memes", "lego", "fortnite", "minecraft", "roblox", "game", "games", "costume", "outfit", "dress",
    "net worth", "wife", "husband", "girlfriend", "boyfriend", "age", "height", "died", "death", "dead", "funeral", "arrested", "accident", "news",
    "documentary", "trailer", "wallpaper", "drawing", "tattoo", "logo", "font", "quiz", "crossword",
    "(?<!concert )movies?", "(?<!concert )films?", "netflix", "imdb", "cast",
  ].join("|")
    .replace(/^/, "\\b(")
    .concat(")\\b"),
);

/** Namesakes of the head terms: films, TV, anime and studio albums that share the words. */
const NAMESAKES = /\bfull metal (jacket|alchemist|panic)\b|\bfull (house|moon|movie|movies|episodes?|album|albums|season|send|body|time|stack|hd movie)\b|\bconcert (piano|band|hall seating|dress|outfit)\b/;

/** Phrases we never want, tested once the names we know are taken out. */
export function isNoise(rest: string): boolean {
  return NOISE.test(rest) || NAMESAKES.test(rest);
}

// ---- Intent ----

export type Intent =
  | "brand"
  | "watch"
  | "quality"
  | "setlist"
  | "lineup"
  | "best-of"
  | "song-live"
  | "band-fact"
  | "tour"
  | "bootleg"
  | "live-album"
  | "tickets"
  | "info"
  | "other";

const has = (p: string, re: RegExp) => re.test(p);

/** What someone typing the phrase wants. Pure. `year` is this year (future dates are ticket searches). */
export function intentOf(phrase: string, opts: { song?: boolean; year?: number } = {}): Intent {
  const p = normalizeForMatch(phrase);
  const thisYear = opts.year ?? new Date().getUTCFullYear();
  const years = [...p.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)].map((m) => Number(m[1]));
  // The brand and the domain: "fullconcert.live", "full concert live" on its own, "stagedive".
  if (has(p, /^(full ?concert ?live( com| site| website)?|fullconcert( live)?( com)?|stage ?dive( concerts?| site| website)?)$/) || has(p, /\bfullconcert(live)?\b|\bstagedive\b/)) return "brand";
  if (has(p, /\btickets?\b|\bpresale\b|\bnear me\b|\btour dates?\b|\bdates\b|\bschedule\b|\bvenue map\b|\bseating\b|\bparking\b|\bline up announcement\b/)) return "tickets";
  if (has(p, /\bline ?up\b|\bwho played\b|\bbands playing\b|\bperformers\b/)) return "lineup";
  if (years.some((y) => y > thisYear) || (has(p, /\btour\b/) && years.some((y) => y >= thisYear))) return "tickets";
  if (has(p, /\b(last|final|first|farewell|reunion|comeback)\b/)) return "band-fact";
  if (has(p, /\bsetlist\b|\bset list\b|\bsongs played\b|\btracklist\b|\bsong list\b/)) return "setlist";
  if (has(p, /\bbest\b|\btop \d+\b|\btop\b|\bgreatest\b|\bof all time\b|\blegendary\b|\biconic\b|\bmost watched\b|\bfamous\b|\bepic\b|\bbiggest\b|\bmost viewed\b/)) return "best-of";
  if (has(p, /\bbootleg\b/)) return "bootleg";
  if (has(p, /\b4k\b|\b1080p?\b|\b720p?\b|\bhd\b|\bhigh quality\b|\bremastered\b|\bpro ?shot\b|\bmulticam\b|\bblu ?ray\b/)) return "quality";
  if (has(p, /\blive album\b|\blive lp\b|\balbum\b/)) return "live-album";
  if (opts.song && has(p, /\blive\b|\bversion\b|\bperformance\b/)) return "song-live";
  if (has(p, /\btour\b/)) return "tour";
  if (has(p, /\bfull\b|\bconcert\b|\bshow\b|\blive\b|\bgig\b|\bperformance\b|\bset\b|\bvideo\b|\bdvd\b|\bstream\b|\bfestival\b|\brockpalast\b|\bunplugged\b|\bsession\b|\bwatch\b|\bin concert\b|\bat\b/)) return "watch";
  if (has(p, /^(who|what|when|where|how|why)\b|\bhistory\b|\bwiki\b|\bmembers\b|\bgenre\b/)) return "info";
  return "other";
}

/** How much a phrase of each intent is worth to us (what we can serve, and ads on a watching page). */
export const INTENT_WEIGHT: Record<Intent, number> = {
  brand: 4,
  watch: 3,
  quality: 3,
  setlist: 3,
  "song-live": 2.5,
  "best-of": 2.5,
  lineup: 2,
  "band-fact": 2,
  tour: 2,
  bootleg: 2,
  "live-album": 1,
  info: 1,
  other: 0.5,
  tickets: 0.3,
};

// ---- Strict matching of names ----

const STOP = new Set(["the", "a", "an", "and", "of", "in", "at", "on", "de", "la", "le", "el", "los", "les", "der", "die", "das"]);
/** Common words that are also band names: matched only when the phrase came from that band's own seed. */
const COMMON_WORDS = new Set([
  "live", "yes", "tool", "kiss", "queen", "ghost", "garbage", "air", "muse", "blur", "rush", "heart", "boston", "europe", "america", "chicago",
  "journey", "genesis", "poison", "cream", "free", "traffic", "suede", "placebo", "eels", "low", "ride", "wire", "television", "clutch", "sleep",
  "failure", "hum", "japan", "berlin", "bush", "police", "doors", "cult", "jam", "smiths", "feeder", "keane", "oasis", "korn", "cure", "pixies",
  "beatles", "who", "band", "creed", "train", "staind", "cake", "texas", "spoon", "interpol", "elbow", "slayer", "anthrax", "testament", "exodus",
  "reading", "download", "lollapalooza",
]);

/** The ways a name is written in a search: as it is, without "The", and squashed ("AC/DC" -> "acdc"). */
export function nameVariants(name: string): string[] {
  const n = normalizeForMatch(name);
  const out = new Set([n]);
  if (n.startsWith("the ")) out.add(n.slice(4));
  if (/[/.]/.test(name) || /\b\w\b \b\w\b/.test(n)) out.add(n.replace(/ /g, ""));
  return [...out].filter((v) => v.length >= 2);
}

/**
 * How people shorten a place: "Glastonbury Festival" -> "glastonbury", "Red Rocks Amphitheatre" ->
 * "red rocks", "Wembley Stadium" -> "wembley". Null when there is nothing to shorten.
 */
export function placeShortName(name: string): string | null {
  const n = normalizeForMatch(name).replace(/^the /, "");
  const short = n.replace(/( valley)? (music and arts |music |rock |open air )?(festival|fest|amphitheatre|amphitheater|stadium|arena)$/, "");
  return short !== n && short.length >= 3 ? short : null;
}

/** A name that could be an ordinary word: one short or common word ("Muse", "Live", "The Cure"). */
export function isAmbiguous(name: string): boolean {
  const words = normalizeForMatch(name).split(" ").filter((w) => !STOP.has(w));
  if (words.length !== 1) return false;
  return words[0].length < 7 || COMMON_WORDS.has(words[0]);
}

const contains = (p: string, variant: string) => ` ${p} `.includes(` ${variant} `);

interface Named {
  name: string;
}

/** Every run of consecutive words in a phrase ("a b c" -> "a b c", "a b", "b c", "a"...), longest first. */
export function ngrams(p: string, max = 8): string[] {
  const w = p.split(" ").filter(Boolean);
  const out: string[] = [];
  for (let len = Math.min(max, w.length); len >= 1; len--) for (let i = 0; i + len <= w.length; i++) out.push(w.slice(i, i + len).join(" "));
  return out;
}

/** Names looked up by their written forms, built once: a phrase is checked by its word runs, not name by name. */
export class NameIndex<T extends Named> {
  private byVariant = new Map<string, { item: T; ambiguous: boolean }[]>();
  constructor(items: T[], extra: (x: T) => string[] = () => []) {
    const put = (v: string, item: T, ambiguous: boolean) => this.byVariant.set(v, [...(this.byVariant.get(v) ?? []), { item, ambiguous }]);
    for (const item of items) {
      // The name's own forms are as ambiguous as the name (acdc is AC/DC); a short form is judged on its own.
      for (const v of nameVariants(item.name)) put(v, item, isAmbiguous(item.name));
      for (const v of extra(item).flatMap(nameVariants)) put(v, item, isAmbiguous(v));
    }
  }
  /**
   * The entity whose whole name is in the phrase (longest name first), never a part of a name. An
   * ambiguous name counts only when the phrase came from that entity's own seed or carries the name
   * with its article ("the cure live").
   */
  find(p: string, subjects: Set<string>): T | null {
    for (const g of ngrams(p)) {
      for (const { item, ambiguous } of this.byVariant.get(g) ?? []) {
        if (ambiguous && !subjects.has(item.name) && !(g.includes(" ") && g.split(" ").some((w) => STOP.has(w)))) continue;
        return item;
      }
    }
    return null;
  }
}

/** One-off lookup (tests, small lists); runs use a NameIndex built once. */
export function findNamed<T extends Named>(p: string, items: T[], subjects: Set<string>, extra: (x: T) => string[] = () => []): T | null {
  return new NameIndex(items, extra).find(p, subjects);
}

/** "the 80s", "1980s", "eighties" -> "1980s". */
export function decadeIn(p: string): string | null {
  const m = p.match(/\b(?:19)?([5-9]0)s\b/) ?? p.match(/\b(20[0-2]0)s\b/);
  if (m) return m[1].length === 2 ? `19${m[1]}s` : `${m[1]}s`;
  const words: Record<string, string> = { fifties: "1950s", sixties: "1960s", seventies: "1970s", eighties: "1980s", nineties: "1990s" };
  for (const [w, d] of Object.entries(words)) if (contains(p, w)) return d;
  return null;
}

export function yearIn(p: string): number | null {
  const m = p.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  return m ? Number(m[1]) : null;
}

// ---- Pages and gaps ----

export type PageType =
  | "home"
  | "concerts"
  | "concert"
  | "band"
  | "band-songs"
  | "song"
  | "venue"
  | "venue-year"
  | "decade"
  | "genre"
  | "tour"
  | "best"
  | "none";

/** The page type that would serve a phrase we cannot serve yet. */
export const GAPS = {
  concertMissing: "concert: that band's show (year/place) is not on the site",
  bandMissing: "band or event: not on the site",
  venueYearMissing: "venue-year page: that edition is not on the site",
  venueMissing: "venue page: that festival or room is not on the site",
  bestMissing: "best-of ranking page",
  bestWeak: "best-of ranking: not enough concerts to show it",
  qualityFilter: "filter or /best page: HD, 4K, pro-shot concerts",
  bandFaq: "band page FAQ answer (first/last concert, reunion)",
  bandQuality: "band page: best quality / pro-shot concerts",
  liveAlbum: "band page: live albums (not served)",
  tourMissing: "tour page: that tour is not on the site",
  setlistHub: "setlist hub page (every setlist)",
  songMissing: "song page: that song is not in our setlists",
  bootlegHub: "bootleg list page (?source=bootleg)",
  lineupFuture: "festival line-up (future edition, not served)",
  tickets: "not served: tickets, dates",
  generic: "generic phrase: home or a list page",
} as const;
export type Gap = (typeof GAPS)[keyof typeof GAPS];

export interface PageMatch {
  pageType: PageType;
  /** Our page that should rank (null when we have none). */
  page: string | null;
  /** What is missing to serve the phrase fully (null when the page serves it). */
  gap: Gap | null;
  /** Names found in the phrase, for the report. */
  found: string[];
}

/** Lookup tables built once per run. */
export interface KwIndex {
  cat: KwCatalogue;
  bandBySlug: Map<string, KwBand>;
  concertsByBand: Map<string, KwConcert[]>;
  venueYear: Map<string, KwVenueYear>;
  genreWords: { name: string; slug: string; word: string }[];
  /** Words of our vocabulary: a phrase made only of these (and names we know) is generic. */
  generic: Set<string>;
  bands: NameIndex<KwBand>;
  venues: NameIndex<KwVenue>;
  /** Songs and tours of one band, built on first use. */
  songsOf: (bandSlug: string) => NameIndex<KwCatalogue["songs"][number] & Named>;
  toursOf: (bandSlug: string) => NameIndex<KwCatalogue["tours"][number]>;
  /** Every written form of every name we know (for the noise test). */
  known: Set<string>;
}

const GENERIC_WORDS =
  "full concert concerts live show shows set sets setlist set list rock music video videos hd 4k 1080p 1080 720p pro shot official complete entire whole best greatest top all time of the a an in at on from with and to for by legendary iconic famous epic biggest most watched viewed performance performances gig gigs festival festivals tour tours stream streaming online watch youtube free dvd film films movie album bootleg reunion last first final farewell new old classic band bands year years lineup line up 70s 80s 90s 60s 50s 2000s 2010s 2020s decade era vintage remastered multicam unplugged acoustic session sessions in concert hq high quality version versions song songs".split(
    " ",
  );

export function buildIndex(cat: KwCatalogue): KwIndex {
  const concertsByBand = new Map<string, KwConcert[]>();
  for (const c of cat.concerts) for (const b of c.bands) concertsByBand.set(b, [...(concertsByBand.get(b) ?? []), c]);
  const genreWords = cat.genres
    .flatMap((g) => [...genreSearchWords(g.name), normalizeForMatch(g.name)].map((word) => ({ name: g.name, slug: g.slug, word: normalizeForMatch(word) })))
    .sort((a, b) => b.word.length - a.word.length);
  const memo = <V>(make: (k: string) => V) => {
    const m = new Map<string, V>();
    return (k: string): V => {
      if (!m.has(k)) m.set(k, make(k));
      return m.get(k)!;
    };
  };
  const known = [
    ...cat.bands.flatMap((b) => [b.name, b.aka ?? ""]),
    ...cat.venues.map((v) => v.name),
    ...cat.songs.map((x) => x.title).filter((t) => t.length >= 4),
    ...cat.tours.map((t) => t.name),
  ].filter(Boolean);
  return {
    cat,
    bands: new NameIndex(cat.bands, (b) => (b.aka ? [b.aka] : [])),
    venues: new NameIndex(cat.venues, (v) => [placeShortName(v.name)].filter((x): x is string => Boolean(x))),
    // A title that is only a number ("1984") would take the year of the concert people search for.
    songsOf: memo((slug) => new NameIndex(cat.songs.filter((x) => x.bandSlug === slug && !/^\d+$/.test(x.title.trim())).map((x) => ({ ...x, name: x.title })))),
    toursOf: memo((slug) => new NameIndex(cat.tours.filter((t) => t.bandSlug === slug).map((t) => ({ ...t, name: t.name.replace(/\s+tour$/i, "") })))),
    known: new Set(known.flatMap(nameVariants)),
    bandBySlug: new Map(cat.bands.map((b) => [b.slug, b])),
    concertsByBand,
    venueYear: new Map(cat.venueYears.map((v) => [`${v.slug}|${v.year}`, v])),
    genreWords,
    generic: new Set([...GENERIC_WORDS, ...genreWords.flatMap((g) => g.word.split(" "))]),
  };
}

const bestFor = (idx: KwIndex, kind: "all" | "decade" | "genre" | "place", key: string | null) => idx.cat.bests.find((b) => b.kind === kind && b.key === key) ?? null;
const bestPage = (slug: string) => `/best/${slug}`;

/** Remove the known names from a phrase (longest first, left to right), to see what is left. */
export function stripNames(p: string, names: string[] | Set<string>): string {
  const known = names instanceof Set ? names : new Set(names.flatMap(nameVariants));
  const w = p.split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < w.length; ) {
    let len = Math.min(8, w.length - i);
    while (len > 0 && !known.has(w.slice(i, i + len).join(" "))) len--;
    if (len > 0) i += len;
    else out.push(w[i++]);
  }
  return out.join(" ");
}

/**
 * The page of ours that should rank for a phrase, or the gap. Strict: a band, place, tour or song
 * counts only when its whole name is in the phrase. Most precise page first: one concert (band +
 * year or place), a song, a tour, a festival edition, a band, a place, a ranking, a genre, a decade,
 * the home page.
 */
export function matchPage(phrase: string, intent: Intent, idx: KwIndex, subjects: Set<string> = new Set()): PageMatch {
  const p = normalizeForMatch(phrase);
  const { cat } = idx;
  const band = idx.bands.find(p, subjects);
  const venue = idx.venues.find(p, subjects);
  const year = yearIn(p);
  const decade = year ? null : decadeIn(p);
  const genre = idx.genreWords.find((g) => contains(p, g.word)) ?? null;
  const found = [band?.name, venue?.name, year ? String(year) : null, decade, genre?.name].filter((x): x is string => Boolean(x));
  const m = (pageType: PageType, page: string | null, gap: Gap | null = null): PageMatch => ({ pageType, page, gap, found });

  if (intent === "tickets") return m("none", null, GAPS.tickets);
  if (intent === "brand") return m("home", "/");

  if (band) {
    const bandPage = `/artists/${band.slug}`;
    const own = idx.concertsByBand.get(band.slug) ?? [];
    // A song of the band.
    const songs = idx.songsOf(band.slug);
    const song = songs.find(p, new Set([...subjects, ...cat.songs.filter((x) => x.bandSlug === band.slug).map((x) => x.title)]));
    if (song && !contains(normalizeForMatch(band.name), normalizeForMatch(song.title))) return { ...m("song", `/songs/${band.slug}/${song.slug}`), found: [...found, song.title] };
    // One concert: band + year and/or place.
    if (year || venue) {
      const hits = own.filter((c) => (!year || c.year === year) && (!venue || c.venueSlug === venue.slug));
      if (hits.length) {
        const pick = hits.find((c) => c.hasSetlist) ?? hits[0];
        return m("concert", `/concerts/${pick.slug}`);
      }
      if (year && year > (new Date().getUTCFullYear())) return m("none", null, GAPS.tickets);
      return m("band", bandPage, GAPS.concertMissing);
    }
    const tour = idx.toursOf(band.slug).find(p, new Set(cat.tours.filter((t) => t.bandSlug === band.slug).map((t) => t.name.replace(/\s+tour$/i, ""))));
    if (tour) return m("tour", `/tours/${tour.slug}`);
    switch (intent) {
      case "band-fact":
        return m("band", bandPage, GAPS.bandFaq);
      case "setlist":
        return band.hasSongs ? m("band-songs", `/songs/${band.slug}`) : m("band", bandPage);
      case "song-live":
        return m("band", bandPage, GAPS.songMissing);
      case "tour":
        return m("band", bandPage, cat.tours.some((t) => t.bandSlug === band.slug) ? null : GAPS.tourMissing);
      case "live-album":
        return m("band", bandPage, GAPS.liveAlbum);
      case "quality":
        return m("band", bandPage, GAPS.bandQuality);
      default:
        return m("band", bandPage);
    }
  }

  if (venue) {
    const venuePage = `/venues/${venue.slug}`;
    if (year) {
      const vy = idx.venueYear.get(`${venue.slug}|${year}`);
      if (vy) return m("venue-year", `/venues/${venue.slug}/${year}`);
      if (year > new Date().getUTCFullYear() || (intent === "lineup" && year >= new Date().getUTCFullYear())) return m("none", null, GAPS.lineupFuture);
      return m("venue", venuePage, GAPS.venueYearMissing);
    }
    if (intent === "best-of" && venue.festival) {
      const b = bestFor(idx, "place", "festival");
      return m("venue", venuePage, b?.strong ? null : GAPS.bestMissing);
    }
    return m("venue", venuePage);
  }

  // Nothing we know by name is in it: what is left after our vocabulary is an unknown band or event.
  const rest = p.split(" ").filter((w) => w.length > 1 && !/^\d+s?$/.test(w) && !idx.generic.has(w) && !STOP.has(w));
  const unknownSubject = rest.length > 0;
  if (intent === "best-of") {
    if (genre) {
      const b = bestFor(idx, "genre", genre.slug);
      return b ? (b.strong ? m("best", bestPage(b.slug)) : m("genre", `/genres/${genre.slug}`, GAPS.bestWeak)) : m("genre", `/genres/${genre.slug}`, GAPS.bestMissing);
    }
    if (decade) {
      const b = bestFor(idx, "decade", decade);
      return b ? (b.strong ? m("best", bestPage(b.slug)) : m("decade", `/decades/${decade}`, GAPS.bestWeak)) : m("none", null, GAPS.bestMissing);
    }
    if (/\bfestival\b/.test(p)) {
      const b = bestFor(idx, "place", "festival");
      return b?.strong ? m("best", bestPage(b.slug)) : m("best", "/best", GAPS.bestMissing);
    }
    if (unknownSubject) return m("none", null, GAPS.bandMissing);
    const all = bestFor(idx, "all", null);
    return all?.strong ? m("best", bestPage(all.slug)) : m("best", "/best", GAPS.bestWeak);
  }
  if (unknownSubject && intent !== "info" && intent !== "other") return m("none", null, GAPS.bandMissing);
  if (genre) return m("genre", `/genres/${genre.slug}`, intent === "quality" ? GAPS.qualityFilter : null);
  if (decade && cat.decades.some((d) => d.label === decade)) return m("decade", `/decades/${decade}`, intent === "quality" ? GAPS.qualityFilter : null);
  switch (intent) {
    case "quality":
      return m("concerts", "/concerts", GAPS.qualityFilter);
    case "bootleg":
      return m("concerts", "/concerts?source=bootleg", GAPS.bootlegHub);
    case "setlist":
      return m("concerts", "/concerts", GAPS.setlistHub);
    case "lineup":
      return m("none", null, GAPS.venueMissing);
    case "band-fact":
    case "tour":
    case "live-album":
    case "song-live":
      return m("none", null, GAPS.generic);
    case "watch":
      return m("home", "/");
    default:
      return unknownSubject ? m("none", null, GAPS.bandMissing) : m("home", "/", GAPS.generic);
  }
}

// ---- Ranking ----

export interface SuggestResult {
  seed: Seed;
  engine: string;
  suggestions: string[];
}

export interface KeywordRow {
  phrase: string;
  score: number;
  /** Distinct seeds that returned it (a proxy for demand). */
  seeds: number;
  engines: string[];
  /** Best position in an engine's list (0 = first suggestion). */
  rank: number;
  intent: Intent;
  pageType: PageType;
  page: string | null;
  gap: Gap | null;
  found: string[];
  /** The kind of the first seed that returned it. */
  seedKind: SeedKind;
}

/** Clean a suggestion: lower case, single spaces, Latin script, a sensible length. */
export function cleanPhrase(raw: string): string | null {
  const p = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (p.length < 3 || p.length > 90) return null;
  if (/[^\x20-\x7eÀ-ɏ]/.test(p)) return null;
  return p;
}


/** Score: (seeds + 1 when both engines agree + 0.5 when it is a top-3 suggestion) x intent weight. */
export function scoreOf(seeds: number, engines: number, rank: number, intent: Intent): number {
  return Math.round((seeds + (engines > 1 ? 1 : 0) + (rank < 3 ? 0.5 : 0)) * INTENT_WEIGHT[intent] * 10) / 10;
}

/**
 * Merge the suggestions of every seed into one ranked list, without noise, each phrase with its
 * intent and page (or gap). Also returns how many phrases were dropped as noise.
 */
export function rankKeywords(results: SuggestResult[], cat: KwCatalogue, opts: { year?: number } = {}): { rows: KeywordRow[]; noise: string[] } {
  const idx = buildIndex(cat);
  const byPhrase = new Map<string, { seeds: Set<string>; engines: Set<string>; rank: number; subjects: Set<string>; kind: SeedKind }>();
  for (const r of results)
    r.suggestions.forEach((raw, i) => {
      const phrase = cleanPhrase(raw);
      if (!phrase) return;
      const row = byPhrase.get(phrase) ?? { seeds: new Set(), engines: new Set(), rank: 99, subjects: new Set(), kind: r.seed.kind };
      row.seeds.add(r.seed.query);
      row.engines.add(r.engine);
      row.subjects.add(r.seed.subject);
      row.rank = Math.min(row.rank, i);
      byPhrase.set(phrase, row);
    });
  const rows: KeywordRow[] = [];
  const noise: string[] = [];
  for (const [phrase, r] of byPhrase) {
    const p = normalizeForMatch(phrase);
    if (isNoise(stripNames(p, idx.known))) {
      noise.push(phrase);
      continue;
    }
    const song = r.kind === "song" || /\blive version\b/.test(p);
    const intent = intentOf(phrase, { song, year: opts.year });
    const match = matchPage(phrase, intent, idx, r.subjects);
    rows.push({
      phrase,
      score: scoreOf(r.seeds.size, r.engines.size, r.rank, intent),
      seeds: r.seeds.size,
      engines: [...r.engines].sort(),
      rank: r.rank,
      intent,
      ...match,
      seedKind: r.kind,
    });
  }
  rows.sort((a, b) => b.score - a.score || a.phrase.localeCompare(b.phrase));
  return { rows, noise: noise.sort() };
}

/** Parse Google's (client=firefox) and Bing's (osjson) answers: ["query", ["s1", "s2", ...]]. */
export function parseSuggestions(body: unknown): string[] {
  if (!Array.isArray(body) || !Array.isArray(body[1])) return [];
  return (body[1] as unknown[]).filter((x): x is string => typeof x === "string");
}

// ---- Reports ----

export interface KeywordSummary {
  generatedAt: string;
  seeds: number;
  seedsAsked: number;
  requests: number;
  emptyAnswers: number;
  phrases: number;
  noise: number;
  stoppedEarly: boolean;
}

/** Gaps grouped by page type, biggest total score first, with their best phrases. */
export function gapSummary(rows: KeywordRow[], perGap = 15): { gap: Gap; phrases: number; score: number; top: KeywordRow[] }[] {
  const groups = new Map<Gap, KeywordRow[]>();
  for (const r of rows) if (r.gap) groups.set(r.gap, [...(groups.get(r.gap) ?? []), r]);
  return [...groups.entries()]
    .map(([gap, rs]) => ({ gap, phrases: rs.length, score: Math.round(rs.reduce((n, r) => n + r.score, 0) * 10) / 10, top: rs.slice(0, perGap) }))
    .sort((a, b) => b.score - a.score);
}

export function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, r) => ((acc[key(r)] = (acc[key(r)] ?? 0) + 1), acc), {});
}

/** The mandatory head targets and whether people's searches confirmed them. */
export function headTargetCheck(rows: KeywordRow[]): { phrase: string; page: string; seen: boolean; score: number }[] {
  const byPhrase = new Map(rows.map((r) => [normalizeForMatch(r.phrase), r]));
  return HEAD_TARGETS.map((t) => {
    const r = byPhrase.get(normalizeForMatch(t.phrase));
    return { phrase: t.phrase, page: t.page, seen: Boolean(r), score: r?.score ?? 0 };
  });
}

const cell = (s: string | number | null) => String(s ?? "").replace(/\|/g, "/");

/** The whole list as Markdown: summary, mandatory targets, gaps by page type, every phrase. */
export function reportMarkdown(rows: KeywordRow[], summary: KeywordSummary): string {
  const lines = [
    `# Keyword research · ${summary.generatedAt.slice(0, 10)}`,
    "",
    `Seeds ${summary.seedsAsked}/${summary.seeds} · requests ${summary.requests} (${summary.emptyAnswers} empty) · phrases ${summary.phrases} · dropped as noise ${summary.noise}${summary.stoppedEarly ? " · stopped at the time budget" : ""}.`,
    "Score = (seeds that returned the phrase + 1 when Google and Bing agree + 0.5 for a top-3 suggestion) x intent weight.",
    "",
    "## Head targets (src/lib/keyword-targets.ts)",
    "",
    "| phrase | page | seen | score |",
    "|---|---|---|---|",
    ...headTargetCheck(rows).map((t) => `| ${t.phrase} | ${t.page} | ${t.seen ? "yes" : "no"} | ${t.score} |`),
    "",
    "## Gaps by page type",
    "",
  ];
  for (const g of gapSummary(rows, 25)) {
    lines.push(`### ${g.gap} (${g.phrases} phrases, score ${g.score})`, "", ...g.top.map((r) => `- ${r.phrase} · ${r.score}${r.page ? ` · ${r.page}` : ""}`), "");
  }
  lines.push("## Every phrase", "", "| score | phrase | seeds | engines | intent | page | gap |", "|---|---|---|---|---|---|---|");
  for (const r of rows) lines.push(`| ${r.score} | ${cell(r.phrase)} | ${r.seeds} | ${r.engines.join("+")} | ${r.intent} | ${cell(r.page ?? "GAP")} | ${cell(r.gap)} |`);
  return `${lines.join("\n")}\n`;
}

/**
 * The job log's tail (the artifact cannot be read by the agent, so the log carries the result):
 * top phrases, then the gap summary by page type, then the counts, last.
 */
export function logTail(rows: KeywordRow[], summary: KeywordSummary, top = 300): string[] {
  const out = [`==== TOP ${Math.min(top, rows.length)} PHRASES (score, seeds, engines, intent, page or GAP) ====`];
  for (const r of rows.slice(0, top)) out.push(`KW\t${r.score}\t${r.seeds}\t${r.engines.join("+")}\t${r.intent}\t${r.page ?? "GAP"}${r.gap ? `\t[${r.gap}]` : ""}\t${r.phrase}`);
  out.push("==== HEAD TARGETS ====");
  for (const t of headTargetCheck(rows)) out.push(`HEAD\t${t.seen ? "seen" : "not seen"}\t${t.score}\t${t.page}\t${t.phrase}`);
  out.push("==== GAPS BY PAGE TYPE ====");
  for (const g of gapSummary(rows, 12)) {
    out.push(`GAP\t${g.phrases} phrases\tscore ${g.score}\t${g.gap}`);
    for (const r of g.top) out.push(`  \t${r.score}\t${r.phrase}`);
  }
  out.push("==== COUNTS ====");
  out.push(JSON.stringify({ ...summary, byIntent: countBy(rows, (r) => r.intent), byPageType: countBy(rows, (r) => r.pageType), gaps: rows.filter((r) => r.gap).length }));
  return out;
}

// ---- Asking the engines (the network is injected, so tests run on recorded answers) ----

/** Google's and Bing's suggestion addresses: free, no key, English results. */
export const ENGINES: Record<string, (q: string) => string> = {
  google: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&ie=utf-8&oe=utf-8&q=${encodeURIComponent(q)}`,
  bing: (q) => `https://api.bing.com/osjson.aspx?market=en-US&query=${encodeURIComponent(q)}`,
};

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;
const realSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A plain client name, nothing about the owner or the project (privacy). */
export const USER_AGENT = "Mozilla/5.0 (compatible; keyword-research/1.0)";

/** One engine's suggestions for one query; [] when the engine says nothing or keeps failing. */
export async function fetchSuggestions(engine: string, q: string, fetchImpl: FetchLike = fetch as unknown as FetchLike, sleep = realSleep): Promise<string[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchImpl(ENGINES[engine](q), { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (!res.ok) return [];
      return parseSuggestions(JSON.parse(new TextDecoder("utf-8").decode(await res.arrayBuffer())));
    } catch {
      await sleep(1000 * (attempt + 1));
    }
  }
  return [];
}

/**
 * Ask every engine about every seed, the engines in parallel, gently (`delayMs` between seeds), and
 * stop at `deadline` (ms since epoch) so the job always has time to write its report.
 */
export async function askEngines(
  seeds: Seed[],
  opts: { fetchImpl?: FetchLike; sleep?: (ms: number) => Promise<unknown>; delayMs?: number; deadline?: number; now?: () => number; onProgress?: (done: number) => void } = {},
): Promise<{ results: SuggestResult[]; asked: number; stoppedEarly: boolean }> {
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;
  const results: SuggestResult[] = [];
  let asked = 0;
  for (const seed of seeds) {
    if (opts.deadline && now() > opts.deadline) return { results, asked, stoppedEarly: true };
    const answers = await Promise.all(Object.keys(ENGINES).map(async (engine) => ({ seed, engine, suggestions: await fetchSuggestions(engine, seed.query, opts.fetchImpl, sleep) })));
    results.push(...answers);
    asked++;
    if (asked % 200 === 0) opts.onProgress?.(asked);
    if (opts.delayMs) await sleep(opts.delayMs);
  }
  return { results, asked, stoppedEarly: false };
}

/** Minutes a run will take, roughly: each seed asks both engines at once, then waits `delayMs`. */
export function estimateMinutes(seeds: number, delayMs: number, latencyMs = 250): number {
  return Math.ceil((seeds * (delayMs + latencyMs)) / 60_000);
}
