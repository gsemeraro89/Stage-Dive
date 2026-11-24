// Which of our bands and festivals a press item is about (owner, 21 Nov 2026: news only for the music we
// cover, i.e. the bands and festivals on the site). Free and strict: only items naming one of them go on
// to Claude (which costs money). One-word names ("Muse", "Ghost", "Down", "Madness", "The Cure") must be
// written as the band writes them (or in capitals, as Blabbermouth writes bands) AND be used as a band:
// next to a band word ("Rush drummer", "Down announce", "rockers Ghost"), or as the headline's subject,
// possessive ("Metallica's") or in a list of names, with a music word close by; never inside quotes (a song
// or album title) and never inside a longer name we also know ("System of a Down" is not "Down").
// Festival short names made only of everyday words ("Hard Rock", "North", "Power Trip") are not used: the
// full name is needed. A place (park, stadium, arena...) counts only with one of our bands in the item.
// Pure; tested in tests/news.test.ts and tests/news-match.test.ts.

export interface NewsEntity {
  kind: "band" | "festival";
  /** Page slug: /artists/<slug> or /venues/<slug>. */
  slug: string;
  name: string;
  /** Another name the band goes by (Artist.aka). */
  aka?: string | null;
}

export interface NewsMatch {
  bands: NewsEntity[];
  festivals: NewsEntity[];
}

/** Other names the press uses for some festivals (on top of the automatic short names). */
export const FESTIVAL_ALIASES: Record<string, string[]> = {
  "Wacken Open Air": ["Wacken"],
  "Graspop Metal Meeting": ["Graspop"],
  "Primavera Sound": ["Primavera Sound Barcelona", "Primavera Sound Porto"],
  "Rock Am Ring": ["Rock am Ring"],
  "Download Festival": ["Download Festival UK"],
  "Pol'And'Rock Festival": ["Woodstock Poland", "Przystanek Woodstock"],
  "Hellfest": ["Hellfest Open Air"],
};

/** Names that must never be matched on their own because they are everyday words in another sense. */
const BLOCKERS: Record<string, RegExp> = {
  Bush: /\b(george|president|administration|white house|w\.)\b/i,
  Rush: /\b(limbaugh|rush hour|gold rush|sugar rush)\b/i,
  Pulp: /\bpulp fiction\b/i,
  Ghost: /\b(ghost of tsushima|ghost town|ghost story|ghost stories|ghostbusters)\b/i,
  Television: /\b(tv|television) (series|show|network|channel|station|drama|special)\b/i,
  Hole: /\b(black hole|plot hole|sinkhole|hole in)\b/i,
};

/** Words that make a short or everyday band name count when close by (same sentence, about 80 characters). */
const MUSIC_WORDS =
  /\b(band|bands|tour|tours|touring|tour dates|album|albums|LP|EP|live|concert|concerts|gig|gigs|show|shows|frontman|frontwoman|singer|vocalist|guitarist|drummer|bassist|keyboardist|reunion|reunite[sd]?|setlist|headlin\w*|festival|record|records|recorded|recording|single|song|songs|track|tracks|music video|vinyl|line-?up|stage|anniversary|perform\w*|rockers?|metal|punk|grunge|rock|indie|cover[sd]?|riff|debut|bill|dates|residency|arenas?|stadiums?|headliners?|support act|reissue[sd]?|box set|soundtracks?|playlists?)\b/i;

/** Words that make a one-word festival name count. */
const FESTIVAL_WORDS = /\b(festival|fest|line-?up|tickets?|edition|headlin\w*|stages?|bill|announce[sd]?|returns?|dates|perform\w*|open air)\b/i;

/** Words just after a one-word name that show it is the band ("Down announce", "Rush drummer"). */
const BAND_AFTER = new RegExp(
  "^(band|bands|frontman|frontwoman|singer|vocalist|guitarist|drummer|bassist|keyboardist|members?|announce[sd]?|announcing|release[sd]?|releasing|share[sd]?|sharing|unveil(s|ed)?|return(s|ed)?|reunite[sd]?|reunion|tour|tours|touring|album|albums|single|singles|song|songs|live|concert|concerts|show|shows|gig|gigs|confirm(s|ed)?|cancel(s|led|ed)?|postpone[sd]?|play(s|ed)?|perform(s|ed)?|headline[sd]?|drop(s|ped)?|add(s|ed)?|join(s|ed)?|debut(s|ed)?|tease[sd]?|premiere[sd]?|setlist|reissue[sd]?|launch(es|ed)?|celebrate[sd]?|team|teams|bring(s)?|record(s|ed)?|rehearse[sd]?|perform)$",
  "i",
);
/** Words just before a one-word name that show it is the band ("rockers Ghost", "featuring Tool"). */
const BAND_BEFORE = /^(band|rockers?|legends|icons|veterans|metallers|punks|outfit|supergroup|trio|quartet|quintet|duo|featuring|feat|ft|supporting|support|joins|with)$/i;
/** A headline's own label before its subject ("Watch: Rammstein debut..."). */
const TITLE_START = /^\s*(?:(?:watch|listen|video|photos?|exclusive|premiere|breaking|live|news)\s*[:\-–—]\s*)?$/i;
/** Words a festival's short name may not be made of alone: "Hard Rock" (Fest), "North" (Festival), "Power Trip" (Festival). */
const GENERIC_FESTIVAL_WORDS = new Set(
  "hard rock rocks heavy metal punk music sound sounds open air north south east west northern southern power trip summer winter spring fall autumn big day days night nights weekend live love young new old great best wild black red blue green high field fields beach island city town park sun moon festival fest the and of in on at a".split(" "),
);
/** A venue that is a place (any show happens there): counts only with one of our bands in the item ("BST Hyde Park" + Billie Eilish does not). */
const PLACE = /\b(park|square|garden|gardens|stadium|arena|hall|theatre|theater|forum|club|centre|center|amphitheatre|amphitheater|bowl|dome|field)\b/i;

const foldAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘`´]/g, "'");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (n: string, flags: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(n)}(?![\\p{L}\\p{N}])`, flags);

/** "The Cure" -> "Cure": the words that make a name distinctive. */
const core = (name: string) => name.replace(/^the\s+/i, "").trim();

/**
 * A name that could be an everyday word: one word once "The" is set aside ("Muse", "The Cure"), or
 * very short ("U2", "X"). Such a name needs its own capitals and a music word nearby.
 */
export function isRiskyName(name: string): boolean {
  const c = core(name);
  return !/\s/.test(c) || c.length <= 4;
}

/**
 * The short names the press uses for a festival: "Sziget Festival" -> "Sziget", "Coachella Valley
 * Music and Arts Festival" -> "Coachella Valley", "Lollapalooza Festival, Treptower Park" ->
 * "Lollapalooza", "Stagecoach 2026 (Mustang Stage)" -> "Stagecoach". Pure.
 */
export function festivalNames(name: string): string[] {
  const out = new Set<string>([name]);
  const base = festivalBase(name);
  out.add(base);
  const short = base.replace(/\s+(Music\s+(&|and)\s+Arts\s+)?(Festival|Fest)$/i, "").replace(/\s+Valley$/i, "").trim();
  // "Hard Rock Fest" is not "hard rock"; "North Festival" is not "North American dates".
  const generic = short.toLowerCase().split(/\s+/).every((w) => GENERIC_FESTIVAL_WORDS.has(w));
  if (short.length >= 4 && !generic) out.add(short);
  for (const a of FESTIVAL_ALIASES[name] ?? []) out.add(a);
  return [...out].filter((n) => n.length >= 3);
}

/** The name a festival goes by, without stage, year or room: "When We Were Young 2024, Purple Stage" -> "When We Were Young". */
export function festivalBase(name: string): string {
  const base = name
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/,.*$/, "")
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return base || name;
}

interface Rule {
  e: NewsEntity;
  re: RegExp;
  /** One-word band name: must be used as a band (usedAsBand). */
  strict: boolean;
  /** Needs a context word nearby (risky name). */
  context: RegExp | null;
  block: RegExp | null;
  len: number;
}

export interface Matcher {
  /** Our bands and festivals the item names. */
  find(item: { title: string; summary?: string; categories?: string[] }): NewsMatch;
}

/** Whether a context word sits within about 80 characters of the match, in the same sentence. */
function near(text: string, index: number, length: number, context: RegExp): boolean {
  const from = Math.max(0, index - 80);
  const to = Math.min(text.length, index + length + 80);
  const before = text.slice(from, index).split(/[.!?]\s/).pop() ?? "";
  const after = text.slice(index + length, to).split(/[.!?]\s/)[0] ?? "";
  return context.test(`${before} ${after}`);
}

/**
 * Everyday English words that are also band names: such a name must be used as a band (next to a band word, or the
 * headline's subject, possessive or in a list, with a music word close by). Names of four letters or fewer too.
 */
const EVERYDAY = new Set(
  (
    "down madness can holy live yes tool kiss queen ghost garbage air muse blur rush heart boston europe america chicago journey genesis " +
    "poison cream free traffic ride wire television clutch sleep failure hum japan berlin bush police doors cult jam cure who creed train cake " +
    "texas spoon elbow testament exodus reading download hole low shame refused editors architects disturbed pulp suede placebo heart love " +
    "harmony outfit ever red fall seconds king black pink lost baby brothers freaks experience europe kansas eagles live outbreak warning " +
    "converge deafheaven envy mono boris sleep isis earth candlemass crowbar prong venom death possessed obituary sodom kreator destruction " +
    "overkill helmet quicksilver tribe family cars church bauhaus suicide ministry fear smiths beatles stones animals kinks byrds band " +
    "yardsticks feeder keane oasis korn pixies interpol slowdive shellac slint low swans eels weezer staind"
  ).split(" "),
);

/** "The Holy" -> "holy". */
const everyday = (name: string) => {
  const c = core(name).toLowerCase();
  return c.length <= 4 || EVERYDAY.has(c);
};

const UPPER_START = /^\p{Lu}/u;

/** Words that start a longer name ("El Michels Affair", "De La Soul", "Van Halen", "Lil Wayne"): a one-word band right after one is part of that name. */
const NAME_PARTICLE = /^(el|la|le|los|las|les|il|der|de|del|della|du|dos|van|von|mc|mac|st|saint|dr|mr|mrs|ms|lil|sir|dj)$/i;

/** The capitalised word just before and just after a name found at `index` (empty when none). */
function neighbours(text: string, index: number, length: number): { prev: string; next: string } {
  const before = text.slice(Math.max(0, index - 60), index);
  const after = text.slice(index + length, index + length + 60);
  const next = after.match(/^\s+([\p{L}][\p{L}-]*)/u)?.[1] ?? "";
  // A word that ends a sentence or a clause is not part of the name ("...Residency. Metallica will").
  const prev = /[.!?:;,)"”]\s*$/.test(before) ? "" : (before.match(/([\p{L}][\p{L}-]*)\s+$/u)?.[1] ?? "");
  return { prev: UPPER_START.test(prev) ? prev : "", next: UPPER_START.test(next) ? next : "" };
}

/**
 * Whether the name found at `index` is part of a longer name: right after a name particle ("El", "Van", "Lil"), or,
 * where capitals mean names (the summary, or a headline not in Title Case), next to another capitalised word that
 * does not start the sentence and is not a joining word ("Leon Michels", "Michels Affair").
 */
function insideLongerName(text: string, titleEnd: number, index: number, length: number): boolean {
  const { prev, next } = neighbours(text, index, length);
  if (prev && NAME_PARTICLE.test(prev)) return true;
  const capitalsMeanNames = index > titleEnd || !titleCase(text.slice(0, titleEnd));
  if (!capitalsMeanNames) return false;
  const before = text.slice(Math.max(0, index - 60), index);
  const sentenceStart = /(^|[.!?:;"“]\s*)([\p{L}][\p{L}.-]*)\s+$/u.test(before);
  if (prev && !sentenceStart && !/^(and|with|by|of|featuring|feat|ft|as|for|from|to|at|in|on)$/i.test(prev)) return true;
  if (next && !BAND_AFTER.test(next)) return true;
  return false;
}

/** Whether a band word sits right next to the name ("Michels drummer", "rockers Michels"). */
function nextToBandWord(text: string, index: number, length: number): boolean {
  const next = text.slice(index + length, index + length + 60).match(/^\s+([\p{L}][\p{L}-]*)/u)?.[1] ?? "";
  const prev = text.slice(Math.max(0, index - 60), index).match(/([\p{L}][\p{L}.-]*)\s+$/u)?.[1] ?? "";
  return BAND_AFTER.test(next) || BAND_BEFORE.test(prev);
}

/** Whether most words of a headline start with a capital (Title Case: capitals say nothing about names). */
const titleCase = (title: string) => {
  const words = title.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return words.length > 0 && words.filter((w) => UPPER_START.test(w)).length / words.length >= 0.6;
};

/**
 * Whether a one-word band name found at `index` is used as the band (never inside quotes: a song or album title).
 * In capitals (Blabbermouth writes bands so) it must stand alone ("RHONDA SMITH" is a person). Next to a band word
 * is enough. Otherwise an everyday word must be the headline's subject, possessive or in a list of names, with a
 * music word close by; another name needs the music word and must not be part of a longer name ("Rhonda Smith",
 * "Cindy Blackman Santana") where capitals mean something (a summary, or a headline not in Title Case).
 */
function usedAsBand(text: string, titleEnd: number, index: number, length: number, context: RegExp, isEveryday: boolean): boolean {
  const before = text.slice(Math.max(0, index - 60), index);
  const after = text.slice(index + length, index + length + 60);
  if (/["“”'‘]$/.test(before) && !/^'s\b/.test(after)) return false;
  const found = text.slice(index, index + length);
  if (!/\p{Ll}/u.test(found) && /\p{Lu}{2}/u.test(found)) {
    const alone = /\p{Ll}/u.test(text) && !/\p{Lu}{2,}['.]?[\s-]*$/u.test(before) && !/^[\s-]*\p{Lu}{2,}/u.test(after);
    if (!alone) return false;
  }
  const next = after.match(/^\s+([\p{L}][\p{L}-]*)/u)?.[1] ?? "";
  const prev = before.match(/([\p{L}][\p{L}.-]*)\s+$/u)?.[1] ?? "";
  if (UPPER_START.test(prev) && NAME_PARTICLE.test(prev)) return false;
  if (BAND_AFTER.test(next) || BAND_BEFORE.test(prev)) return true;
  if (!near(text, index, length, context)) return false;
  const possessive = /^'s\b/.test(after);
  if (isEveryday) {
    const subject = TITLE_START.test(text.slice(0, index));
    const listed = (/,\s*$/.test(before) || /\b(and|&)\s+$/i.test(before)) && /^\s*(,|and\b|&|\+|[.!?;:)]|$)/i.test(after);
    return subject || possessive || listed;
  }
  const capitalsMeanNames = index > titleEnd || !titleCase(text.slice(0, titleEnd));
  if (capitalsMeanNames && !possessive) {
    const sentenceStart = /(^|[.!?:;]\s+)([\p{L}][\p{L}.-]*)\s+$/u.test(before);
    if (next && UPPER_START.test(next)) return false;
    if (prev && UPPER_START.test(prev) && !sentenceStart && !/^(and|with|by|of)$/i.test(prev)) return false;
  }
  return true;
}

/** One entity per festival: the stage, year and room venues of one festival ("Outbreak Fest, Bowlers Arena") count as one. */
function oneVenuePerFestival(entities: NewsEntity[]): Map<NewsEntity, NewsEntity> {
  const groups = new Map<string, NewsEntity[]>();
  for (const e of entities) {
    if (e.kind !== "festival") continue;
    const key = foldAccents(festivalBase(e.name)).toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const out = new Map<NewsEntity, NewsEntity>();
  for (const list of groups.values()) {
    const main = [...list].sort((a, b) => a.name.length - b.name.length || a.slug.localeCompare(b.slug))[0];
    const base = festivalBase(main.name);
    const shown = base === main.name ? main : { ...main, name: base };
    for (const e of list) out.set(e, shown);
  }
  return out;
}

/** A matcher for our bands and festivals. Pure. */
export function newsMatcher(entities: NewsEntity[]): Matcher {
  const rules: Rule[] = [];
  const venueOf = oneVenuePerFestival(entities);
  for (const original of entities) {
    const e = venueOf.get(original) ?? original;
    const names = e.kind === "festival" ? festivalNames(original.name) : [e.name, ...(e.aka ? e.aka.split(/\s*[,;/]\s*/) : [])];
    for (const raw of new Set(names.map((n) => foldAccents(n).trim()).filter((n) => n.length >= 2))) {
      const risky = isRiskyName(raw);
      const band = e.kind === "band";
      // Risky names must be written as the band writes them (case-sensitive) or, for a band, in capitals; the others in any case.
      const caps = raw.toUpperCase();
      const re = !risky
        ? word(raw, "giu")
        : band && caps !== raw
          ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${escape(raw)}|${escape(caps)})(?![\\p{L}\\p{N}])`, "gu")
          : word(raw, "gu");
      rules.push({
        e,
        re,
        strict: risky && band,
        context: risky ? (band ? MUSIC_WORDS : FESTIVAL_WORDS) : null,
        block: BLOCKERS[raw] ?? null,
        len: raw.length,
      });
    }
  }
  // Longest names first: "System of a Down" takes its words before "Down" can.
  rules.sort((a, b) => b.len - a.len);
  return {
    find(item) {
      const text = foldAccents(`${item.title}. ${item.summary ?? ""}`);
      const titleEnd = foldAccents(item.title).length;
      const categories = new Set((item.categories ?? []).map((c) => foldAccents(c).trim().toLowerCase()));
      const found = new Map<string, { e: NewsEntity; at: number }>();
      /** Spans already taken by a longer name. */
      const taken: [number, number][] = [];
      const free = (from: number, to: number) => taken.every(([a, b]) => to <= a || from >= b);
      for (const r of rules) {
        const key = `${r.e.kind}:${r.e.slug}`;
        // The item's own category naming the band or festival is enough on its own.
        const name = r.re.source;
        const categoryHit = [...categories].some((c) => new RegExp(`^${name}$`, "iu").test(c));
        if (categoryHit && !found.has(key)) {
          found.set(key, { e: r.e, at: text.length });
          continue;
        }
        if (r.block && r.block.test(text)) continue;
        const matches = [...text.matchAll(r.re)];
        // A distinctive one-word name seen inside a longer name ("El Michels Affair", "Leon Michels") is not the band
        // anywhere in the item, unless a band word shows it is ("Michels drummer").
        if (r.strict && !everyday(r.e.name) && matches.some((m) => insideLongerName(text, titleEnd, m.index, m[0].length))) {
          if (!matches.some((m) => nextToBandWord(text, m.index, m[0].length))) continue;
        }
        for (const m of matches) {
          const end = m.index + m[0].length;
          if (!free(m.index, end)) continue;
          const ok = r.strict ? usedAsBand(text, titleEnd, m.index, m[0].length, r.context!, everyday(r.e.name)) : !r.context || near(text, m.index, m[0].length, r.context);
          if (!ok) continue;
          // Every place the name is used is taken, so a shorter name inside it never counts.
          taken.push([m.index, end]);
          const had = found.get(key);
          if (!had || had.at > m.index) found.set(key, { e: r.e, at: m.index });
        }
      }
      // Named first in the headline = what the story is about.
      const hits = [...found.values()].sort((a, b) => a.at - b.at).map((h) => h.e);
      const bands = hits.filter((e) => e.kind === "band");
      // A place hosts any show: it counts only when one of our bands is in the item too.
      const festivals = hits.filter((e) => e.kind === "festival" && (bands.length > 0 || !PLACE.test(e.name)));
      return { bands, festivals };
    },
  };
}

/** True when the item names at least one of ours. */
export const hasMatch = (m: NewsMatch) => m.bands.length + m.festivals.length > 0;
