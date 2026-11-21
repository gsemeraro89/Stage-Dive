// Tours (owner, 21 Nov 2026): which of the main band's own tours a concert was part of, so tour pages
// ("metallica tour 1992") fill themselves. A cheap regex pass reads the video's title and description;
// Claude Haiku is asked only when the regex is unsure (src/lib/collector/haiku.ts, pass "tour"), and its
// answer counts only when the words it quotes are really in the text. Only facts the video's own text supports.
import type { PrismaClient } from "../../generated/prisma/client";
import { slugify } from "../slug";

export type TourFind =
  /** The text names the band's own tour. */
  | { kind: "found"; name: string; evidence: string }
  /** No tour of the band in the text (or only a festival tour, another band's tour, a tour bus...). */
  | { kind: "none"; reason: string }
  /** "Tour" is there but the regex cannot tell the name or whose tour it is: a question for Haiku. */
  | { kind: "unsure"; reason: string; snippets: string[] };

export interface TourText {
  title: string;
  description?: string;
  /** The concert's main band, as we list it. */
  band: string;
  /** The year it was played, when known (names a "World Tour" that carries no year). */
  performedYear?: number | null;
}

/** Package and festival tours of many bands: never one band's own tour. */
const PACKAGE_TOURS =
  /\b(vans\s+)?warped\s+tour\b|\bozz\s?fest\b|\bmayhem\s+(festival|fest|tour)\b|\bgigantour\b|\btaste\s+of\s+chaos\b|\bfamily\s+values\b|\bsounds\s+of\s+the\s+underground\b|\buproar\s+(festival|tour)\b|\bprojekt\s+revolution\b|\blollapalooza\b|\bmonsters\s+of\s+rock\b|\brock\s+never\s+stops\b|\bkerrang!?\s+tour\b|\bnme\s+(awards\s+)?tour\b|\bbig\s+day\s+out\b|\bsonisphere\b|\bknotfest\b|\brockstar\s+energy\b|\bunholy\s+alliance\b|\blilith\s+fair\b|\bh\.?o\.?r\.?d\.?e\.?\s+(festival|tour)\b|\bcr[üu]e\s+fest\b|\bwarped\b|\bjagermeister\s+music\s+tour\b|\bsiren\s+festival\b|\bgods\s+of\s+metal\b|\bclash\s+of\s+the\s+titans\b|\bdeath\s+by\s+stereo\b|\bdownload\s+tour\b|\bmtv\s+campus\s+invasion\b|\bhonda\s+civic\s+tour\b/i;

/** "Tour" that is not a concert tour, or a line that only sells or announces one. */
const NOT_A_TOUR =
  /\btour\s+de\s+(france|suisse|l'|la\b)|\btour\s+(bus|van|diary|diaries|documentary|doc|manager|guide|dates?|tickets?|vlog|footage|rehearsals?|edition|poster|book|programme|program|shirt|merch|announcement|trailer|teaser|recap|highlights?|mix|blog|photos?|pictures?|life)\b|\b(virtual|studio|house|guided|campus|city|walking|museum|backstage|venue|golf|cycling)\s+tour\b|\btour\s+of\s+(the|a|an|our|my|his|her)\b|\btour\s+(&|and)\s+taxis\b|\btour\s+eiffel\b|\bbehind\s+the\s+scenes\b|\bon\s+tour\s+(now|soon|this|next|in\s+20)|\b(tickets?|on\s+sale|presale|pre-sale|get\s+yours|buy\s+now|coming\s+(soon|to)|announce[sd]?|upcoming|next\s+year|this\s+(summer|fall|autumn|winter|spring)|see\s+(us|them)|join\s+us|dates\s+(at|here|below)|https?:\/\/|www\.)/i;

/** Signs that the tour named is another band's (the main band supported it). */
const SUPPORT = /\b(support(ing|ed)?|opening\s+(act|for|slot)|opener\s+for|special\s+guests?|touring\s+with|on\s+tour\s+with|with\s+special\s+guests?)\b/i;

/** Tour in other languages: the regex does not read those, Haiku does. */
const FOREIGN_TOUR = /\b(tourn[ée]e|gira|turn[ée]|tournee|tourn[ée]|digressione)\b/i;

/** Words that only qualify a tour ("World Tour", "European Tour 1983"): a name made of these alone is generic. */
const GENERIC_WORDS = new Set(
  "world european europe euro north south american america us usa u.s. uk british britain japan japanese australian australia asian asia latin canadian canada german uk/europe summer winter spring fall autumn arena arenas stadium stadiums club headline headlining acoustic final last first farewell reunion anniversary farewell comeback live concert concerts full official the a an of and in on '".split(
    " ",
  ),
);
/** Words dropped at the start of a captured name: they belong to the video title, not the tour. */
const LEAD_DROP = new Set("live full concert official video hd 4k 1080p remastered complete entire show the".split(" "));
/** Small words allowed inside a name ("Somewhere Back in Time", "50 & Counting"). */
const CONNECTORS = new Set("of the and & in on a an to de la le x vs n 'n' for at by with from".split(" "));
const SEPARATORS = /^[-–—|·•:\/\\,;()[\]{}"“”]+$/;
const YEAR = /^(19[5-9]\d|20[0-4]\d)$/;

/** Collapse spaces and quotes, keep the text's own spelling. */
const tidy = (s: string) => s.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
const lower = (s: string) => tidy(s).toLowerCase();

const ACRONYMS = new Set(["UK", "US", "USA", "EU", "NYC", "LA", "TV", "MTV", "BBC", "UFO", "DC", "OK"]);
const ROMAN = /^[IVX]+$/;

/**
 * "WHEREVER WE MAY ROAM" -> "Wherever We May Roam", "world" -> "World"; mixed case ("WorldWired", "S&M2") is kept,
 * and so are acronyms and Roman numerals. Small words stay small inside a name ("Somewhere Back in Time").
 */
function fixCase(words: string[]): string[] {
  const allCaps = words.join(" ").replace(/[^\p{L}]/gu, "").length > 0 && !/\p{Ll}/u.test(words.join(" "));
  return words.map((w, i) => {
    const letters = w.replace(/[^\p{L}]/gu, "");
    if (!letters) return w;
    if (ACRONYMS.has(letters) || (ROMAN.test(letters) && letters.length > 1)) return w;
    const small = i > 0 && CONNECTORS.has(w.toLowerCase());
    if (allCaps) return small ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase();
    if (/^\p{Ll}+$/u.test(letters) && !small) return w.charAt(0).toUpperCase() + w.slice(1);
    return w;
  });
}

/** The band's name and its spelling without "The", as written in titles. */
function bandForms(band: string): string[] {
  const b = lower(band);
  return [...new Set([b, b.replace(/^the /, "")])].filter(Boolean).sort((x, y) => y.length - x.length);
}

/** Drop the band's name (and a leading "The" of it) at the start of a captured name. */
function dropBand(words: string[], band: string): string[] {
  const text = words.join(" ").toLowerCase();
  for (const form of bandForms(band)) {
    if (text === form) return [];
    if (text.startsWith(`${form} `)) return words.slice(form.split(" ").length);
  }
  return words;
}

/** The distinctive words of a tour name: not generic, not a year, not "tour". */
export function distinctiveWords(name: string): string[] {
  return lower(name)
    .replace(/[^\p{L}\p{N}°&' ]+/gu, " ")
    .split(" ")
    .filter((w) => w && w !== "tour" && !GENERIC_WORDS.has(w) && !YEAR.test(w) && !/^\d{2}$/.test(w));
}

/**
 * A tour name as we store it: the text's spelling (all-caps words fixed), without the band's name or title words
 * like "Live", ending in "Tour". A generic name ("World Tour", "European Tour") keeps the year ("World Tour 1992");
 * a named tour drops it ("Load Tour 1996" -> "Load Tour"), since a tour spans years. Null when nothing is left, or a
 * generic name has no year.
 */
export function normalizeTourName(raw: string, band: string, year?: number | string | null): string | null {
  // A name in another language ("Gira Paradise 2003", "Tournée Paradize") is kept as written, without the band.
  if (FOREIGN_TOUR.test(raw) && !/\btour\b/i.test(raw)) {
    const words = dropBand(tidy(raw).replace(/^["']+|["']+$/g, "").split(" ").filter(Boolean), band);
    return words.length ? fixCase(words).join(" ") : null;
  }
  let words = tidy(raw)
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+(world\s+)?tour(\s+(19|20)\d\d([-–/](19|20)?\d\d)?)?\s*$/i, (m) => ` ${m.trim()}`)
    .split(" ")
    .filter(Boolean);
  // Year after the name ("... Tour 1992") is read, then the trailing "Tour" taken off.
  let tail: string | null = null;
  const last = words[words.length - 1] ?? "";
  if (/^(19|20)\d\d([-–/]((19|20)?\d\d))?$/.test(last) && words.length > 1 && /^tour$/i.test(words[words.length - 2])) {
    tail = last.replace("–", "-").replace("/", "-");
    words = words.slice(0, -1);
  }
  if (/^tour$/i.test(words[words.length - 1] ?? "")) words = words.slice(0, -1);
  words = dropBand(words, band);
  while (words.length && (LEAD_DROP.has(words[0].toLowerCase()) || CONNECTORS.has(words[0].toLowerCase()) || SEPARATORS.test(words[0]))) {
    // "The" stays when it starts the tour's own name ("The Wall Tour"); "the Magic Tour" (an article) loses it.
    if (words[0] === "The" && words.length > 1 && distinctiveWords(words.slice(1).join(" ")).length) break;
    words = words.slice(1);
  }
  while (words.length && (CONNECTORS.has(words[words.length - 1].toLowerCase()) || SEPARATORS.test(words[words.length - 1]))) words = words.slice(0, -1);
  // A year before the name ("1992 Wherever We May Roam") is the date, not the name; a year alone ("1984 Tour") is the name.
  let lead: string | null = null;
  if (words.length > 1 && YEAR.test(words[0])) {
    lead = words[0];
    words = words.slice(1);
  }
  const fixed = fixCase(words);
  const name = fixed.join(" ");
  const onlyYear = fixed.length === 1 && YEAR.test(fixed[0]);
  if (onlyYear) return `${fixed[0]} Tour`;
  if (distinctiveWords(name).length) return `${name} Tour`;
  // Generic: "World", "European", or nothing at all ("Tour 1992").
  const when = tail ?? lead ?? (year ? String(year) : null);
  if (!when) return null;
  const qualifier = fixed.filter((w) => !LEAD_DROP.has(w.toLowerCase()));
  return `${qualifier.length ? `${qualifier.join(" ")} ` : ""}Tour ${when}`;
}

/**
 * Two spellings of one tour share this key: case, "World", "The", punctuation and years do not count for a named
 * tour; a generic tour is its year ("World Tour 1992" is not "World Tour 1996", but is "European Tour 1992").
 */
export function tourKey(name: string): string {
  const words = lower(name)
    .replace(/[^\p{L}\p{N}° ]+/gu, " ")
    .split(" ")
    .filter((w) => w && !["tour", "world", "the"].includes(w));
  // A generic tour is the band's tour of that year, whatever the leg ("World Tour 1992" = "European Tour 1992").
  if (!distinctiveWords(name).length) {
    const year = /\b(19|20)\d\d\b/.exec(name);
    if (year) return year[0];
  }
  return slugify(words.filter((w) => !YEAR.test(w) && !/^\d{4}-\d{2,4}$/.test(w)).join(" ") || words.join(" "));
}

interface Capture {
  name: string | null;
  evidence: string;
  reason?: string;
}

/** The words right before "Tour" in one segment of text, read backwards while they look like a name. */
function captureBefore(segment: string, at: number): string[] {
  const before = segment.slice(0, at).trim().split(" ").filter(Boolean);
  const out: string[] = [];
  const caseInfo = /[A-Z]/.test(segment) && /[a-z]/.test(segment);
  for (let i = before.length - 1; i >= 0 && out.length < 9; i--) {
    let w = before[i];
    if (SEPARATORS.test(w)) break;
    const endsClause = /[:,;|)\]"]$/.test(w);
    if (endsClause && out.length) break;
    w = w.replace(/[:,;|)\]]+$/, "");
    if (/^["'(]/.test(w)) {
      out.unshift(w.replace(/^["'(]+/, ""));
      break;
    }
    // Without capitals (an all lower-case title) a name cannot be told from other words: nothing is read here.
    const looksName = caseInfo || /\p{Lu}/u.test(segment) ? /^[\p{Lu}\p{N}]/u.test(w) || CONNECTORS.has(w.toLowerCase()) : false;
    if (!looksName) break;
    out.unshift(w);
    if (endsClause) break;
  }
  while (out.length && CONNECTORS.has(out[0].toLowerCase()) && out[0].toLowerCase() !== "the") out.shift();
  return out;
}

/** Every tour named in one line of text, with the line as evidence. */
function capturesIn(line: string, t: TourText): Capture[] {
  const text = tidy(line);
  const out: Capture[] = [];
  const re = /\btour\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // A name after "Tour" ("Tour of the Universe", Depeche Mode 2009): capital T and a capitalised noun.
    const ofThe = /^Tour of (the )?(\p{Lu}[\p{L}'’]+(?: \p{Lu}[\p{L}'’]+){0,3})/u.exec(text.slice(m.index));
    if (ofThe && !/^(France|Duty|The)$/.test(ofThe[2])) {
      out.push({ name: `Tour of ${ofThe[1] ?? ""}${ofThe[2]}`, evidence: ofThe[0] });
      continue;
    }
    // "Tour" as the start of a phrase that is not a tour name ("Tour de France", "tour bus").
    const around = text.slice(Math.max(0, m.index - 60), m.index + 40);
    if (NOT_A_TOUR.test(around)) {
      out.push({ name: null, evidence: around, reason: "not-a-tour" });
      continue;
    }
    // Quoted name: "Wherever We May Roam" Tour.
    const quoted = /"([^"]{2,60})"\s*((?:\w+\s+){0,2})$/.exec(text.slice(0, m.index));
    const after = /^\s*(?:[,'-]\s*)?((?:19|20)\d\d(?:\s*[-–/]\s*(?:19|20)?\d\d)?)\b/.exec(text.slice(m.index + 4));
    const year = after ? after[1].replace(/\s+/g, "") : null;
    let words = quoted ? [quoted[1], ...quoted[2].trim().split(" ").filter(Boolean)] : captureBefore(text, m.index);
    words = dropBand(words, t.band);
    const raw = words.length ? `${words.join(" ")} Tour${year ? ` ${year}` : ""}` : `Tour${year ? ` ${year}` : ""}`;
    const evidence = text.slice(Math.max(0, m.index - 70), m.index + 4 + (after ? after[0].length : 0)).trim();
    if (!words.length) {
      // "... tour 1992" with nothing we can read before it (all lower case, or a word that is not a name).
      const prev = text.slice(0, m.index).trim().split(" ").pop() ?? "";
      // Generic only when what comes before "tour" is qualifiers and years back to a separator, the band or the start
      // ("metallica live 1992 world tour"); "muse drones world tour" hides a name the rules cannot read.
      const back = text.slice(0, m.index).trim().split(" ").filter(Boolean);
      while (back.length && (GENERIC_WORDS.has(back[back.length - 1].toLowerCase()) || YEAR.test(back[back.length - 1]))) back.pop();
      const rest = back.join(" ").toLowerCase();
      const generic = !rest || SEPARATORS.test(back[back.length - 1]) || /[-–—|:(]$/.test(rest) || bandForms(t.band).some((f) => rest.endsWith(f));
      // "on tour" alone is touring, not a tour's name.
      if (/^on$/i.test(prev) && !year) {
        out.push({ name: null, evidence, reason: "not-a-tour" });
        continue;
      }
      const yearInLine = year ?? uniqueYear(text);
      if (generic && (yearInLine || t.performedYear)) out.push({ name: normalizeTourName(`${GENERIC_WORDS.has(prev.toLowerCase()) ? prev : ""} Tour`, t.band, yearInLine ?? t.performedYear), evidence });
      else out.push({ name: null, evidence, reason: generic ? "unnamed" : "name-unreadable" });
      continue;
    }
    const name = normalizeTourName(raw, t.band, year ?? uniqueYear(text) ?? t.performedYear);
    out.push(name ? { name, evidence } : { name: null, evidence, reason: "unnamed" });
  }
  return out;
}

function uniqueYear(text: string): string | null {
  const years = [...new Set([...text.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)].map((x) => x[1]))];
  return years.length === 1 ? years[0] : null;
}

/** A description line that says the video was recorded on that tour (not one that promotes a tour). */
const RECORDED_ON =
  /\b(recorded|filmed|captured|shot|taped|performed|played|live|taken|broadcast)\b[^.]{0,80}\b(during|on|at|from|of|in)\b[^.]{0,20}\btour\b|^\s*tour\s*[:\-–]|\b(part|leg)\s+of\s+(the|their|his|her)\b[^.]{0,60}\btour\b/i;

/**
 * The tour of the main band a video's text names. Title first (it is about this video); a description line counts
 * only when it says the video was recorded on that tour. Package tours and other bands' tours are never ours.
 */
export function extractTour(t: TourText): TourFind {
  const title = tidy(t.title);
  const description = (t.description ?? "").slice(0, 3000);
  const all = `${title}\n${description}`;
  const mentions = /\btour\b/i.test(all);
  if (!mentions) return FOREIGN_TOUR.test(all) ? { kind: "unsure", reason: "foreign word for tour", snippets: snippetsOf(all, FOREIGN_TOUR) } : { kind: "none", reason: "no tour in the text" };

  if (/\btour\b/i.test(title)) {
    if (PACKAGE_TOURS.test(title)) return { kind: "none", reason: "festival or package tour" };
    if (SUPPORT.test(title)) return { kind: "unsure", reason: "maybe another band's tour", snippets: [title] };
    const found = capturesIn(title, t);
    const names = [...new Set(found.filter((c) => c.name).map((c) => c.name!))];
    if (names.length === 1) {
      const hit = found.find((c) => c.name === names[0])!;
      return yearClash(names[0], t.performedYear) ? { kind: "unsure", reason: "year does not match the concert", snippets: [title] } : { kind: "found", name: names[0], evidence: hit.evidence };
    }
    if (names.length > 1) return { kind: "unsure", reason: "several tours in the title", snippets: [title] };
    if (found.every((c) => c.reason === "not-a-tour")) {
      // Only "tour bus" and the like in the title: the description may still say it.
    } else return { kind: "unsure", reason: "tour named in a way the rules cannot read", snippets: [title] };
  }

  // Description: only lines that say the video was recorded on a tour.
  const lines = description.split(/\n+/).map(tidy).filter((l) => /\btour\b/i.test(l));
  const named: Capture[] = [];
  let doubtful = false;
  for (const line of lines.slice(0, 12)) {
    if (PACKAGE_TOURS.test(line)) continue;
    const caps = capturesIn(line, t).filter((c) => c.reason !== "not-a-tour");
    if (!caps.length) continue;
    if (!RECORDED_ON.test(line) || SUPPORT.test(line)) {
      doubtful ||= caps.some((c) => c.name) || caps.some((c) => c.reason === "name-unreadable");
      continue;
    }
    named.push(...caps.filter((c) => c.name));
    doubtful ||= caps.some((c) => !c.name && c.reason === "name-unreadable");
  }
  const names = [...new Set(named.map((c) => c.name!))];
  if (names.length === 1 && !yearClash(names[0], t.performedYear)) return { kind: "found", name: names[0], evidence: named.find((c) => c.name === names[0])!.evidence };
  if (names.length || doubtful) return { kind: "unsure", reason: names.length > 1 ? "several tours in the description" : "tour mentioned in the description", snippets: lines.slice(0, 5) };
  return { kind: "none", reason: "tour word, but no tour of this concert" };
}

/** A generic tour's year ("World Tour 1992") more than a year away from when the concert was played. */
function yearClash(name: string, performed?: number | null): boolean {
  if (!performed) return false;
  const years = [...name.matchAll(/\b(19|20)\d\d\b/g)].map((m) => Number(m[0]));
  return years.length > 0 && years.every((y) => Math.abs(y - performed) > 1);
}

function snippetsOf(text: string, re: RegExp): string[] {
  return text
    .split(/\n+/)
    .filter((l) => re.test(l))
    .map(tidy)
    .slice(0, 5);
}

/** Normalised text for "is this really in the video's text?". */
const plain = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}° ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Haiku's tour counts only when the text supports it: the words it quotes are in the title or description, they
 * speak of a tour, and every distinctive word of the name is in the text too (no name from memory).
 */
export function tourSupportedByText(name: string, evidence: string, text: string): boolean {
  const body = ` ${plain(text)} `;
  const ev = plain(evidence);
  if (!ev || !body.includes(` ${ev} `) && !body.includes(ev)) return false;
  if (!/\b(tour|tournee|gira|turne)\b/.test(ev)) return false;
  if (PACKAGE_TOURS.test(name) || PACKAGE_TOURS.test(evidence)) return false;
  return distinctiveWords(name).every((w) => body.includes(` ${plain(w)} `) || body.includes(plain(w)));
}

/** What saveConcert and the backfill store for one concert: the tour name (or none), and whether it is settled. */
export interface TourDecision {
  name: string | null;
  /** False while the rules are unsure and no answer from Haiku is at hand (the backfill asks later). */
  settled: boolean;
  how: "regex" | "haiku" | "none" | "unsure";
}

/**
 * The decision for one concert: the regex first; when it is unsure, a tour name from Haiku (lane classification or
 * the tour pass) if the text supports it. `hint.evidence` empty: the name's own words must be in the text.
 */
export function decideTour(t: TourText, hint?: { tour: string; evidence?: string; ownTour?: boolean; confidence?: number } | null): TourDecision {
  const regex = extractTour(t);
  if (regex.kind === "found") return { name: regex.name, settled: true, how: "regex" };
  if (regex.kind === "none") return { name: null, settled: true, how: "none" };
  if (!hint) return { name: null, settled: false, how: "unsure" };
  const text = `${t.title}\n${t.description ?? ""}`;
  const own = hint.ownTour !== false && (hint.confidence === undefined || hint.confidence >= 0.7);
  const evidence = hint.evidence?.trim() || hint.tour;
  if (!hint.tour.trim() || !own || !tourSupportedByText(hint.tour, evidence, text)) return { name: null, settled: true, how: "none" };
  const name = normalizeTourName(hint.tour, t.band, uniqueYear(evidence) ?? t.performedYear);
  if (!name || yearClash(name, t.performedYear)) return { name: null, settled: true, how: "none" };
  return { name, settled: true, how: "haiku" };
}

// ---------- Database ----------

type Db = Pick<PrismaClient, "tour">;

/**
 * The tour row for a band and a name: an existing tour of that band with the same key ("Wherever We May Roam Tour"
 * = "Wherever We May Roam World Tour"), else a new one. Slugs carry the band ("metallica-world-tour-1992").
 */
export async function findOrCreateTour(db: Db, artist: { id: number; name: string } | null, name: string) {
  const key = tourKey(name);
  const mine = await db.tour.findMany({ where: { artistId: artist?.id ?? null }, select: { id: true, slug: true, name: true } });
  const same = mine.find((x) => tourKey(x.name) === key);
  if (same) return same;
  const base = slugify(`${artist?.name ?? ""} ${name}`) || slugify(name);
  let slug = base;
  for (let i = 2; await db.tour.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
  return db.tour.create({ data: { slug, name, artistId: artist?.id ?? null }, select: { id: true, slug: true, name: true } });
}
