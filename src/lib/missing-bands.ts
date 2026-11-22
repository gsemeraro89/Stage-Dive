// Bands people search for that are not on the site (owner, 21 Nov 2026): from the keyword research's phrases mapped
// to the gap "band or event: not on the site", the band's name (modifiers, years and venues taken off, spellings
// merged), ranked by total keyword score. Then, for the check, whether MusicBrainz's genres for the band are in our
// genre families (rock, trip hop, big beat, art pop) or not (pop, hip hop, country, jazz...). Pure, for tests; the
// database and network sides are in scripts/missing-bands.ts and scripts/keywords.ts.
// 22 Nov 2026: the first list was mostly everyday words ("Convert", "Shower", "Summer", "Upcoming", "One") and
// chopped names ("Flames" for In Flames, "Fall" for Fall Out Boy, "Seconds" for 30 Seconds to Mars). Now: names
// keep a leading "in"/"a"/number and inner "a"/"to"/"for"; a one-word name must lead its phrases ("heart live
// full concert", "full concerts by mudvayne") in at least two of them, is never an everyday word nor a word of a
// band we have; every name needs at least two phrases; non-music and event phrases are dropped.
import { GENRES } from "./catalogue";
import { genreSearchWords, normalizeForMatch } from "./keyword-targets";
import { GAPS, GENERIC_WORDS, STOP, type KeywordRow } from "./keywords";

/** Words of a search that are never part of a band's name: what people add around it, in English and a few other languages. */
const EXTRA_WORDS: string[] = (
  "upcoming events event nearby weekend schedule playlist playlists recordings recording meaning length ever experience series times " +
  "concierto conciertos concerto concerti konzert konzerte show shows vivo ao en directo direct completo completa complet completo integral integrale ganzes ganze komplett live2 lyrics lyric mp3 download torrent reaction react cover covers karaoke tribute documentary interview behind scenes making rehearsal soundcheck trailer teaser official audio music video videos clip clips playlist mix megamix medley greatest hits best songs song album albums vinyl dvd blu ray bluray stream streaming tickets ticket tour tours dates date setlist setlists news today tonight 2025 2026 youtube spotify tiktok instagram reddit wiki wikipedia net worth wife husband girlfriend boyfriend kids children height members member singer lead guitarist drummer bassist band rock live concert full hd 4k").split(
    " ",
  );
/** Words that make a "name" an event or a place, not a band: such names are dropped. */
const EVENT_WORDS = /\b(fest|festival|festivals|open air|openair|awards?|grammys?|tv|radio|arena|stadium|amphitheatre|amphitheater|cruise|tribute|orchestra|philharmonic|pageant)\b/;
/** Phrases that are about something else than music (bathroom fittings, TV, pageants, sport): dropped whole. */
const NON_MUSIC =
  /\b(shower|showers|enclosures?|cubicles?|bathroom|wall panels?|podcast|judge judy|pageant|microphones?|outfits?|ideas|convert|converter|recipe|meaning|theaters? nearby|theatres? nearby|near me|live aid|farm aid|live 8|live earth|band aid|miss (?:universe|world|grand|international|earth|usa|america|[a-z]+ (?:19|20)\d\d))\b/;
/** Words that are never a band people search by that one word: function words, seasons, everyday nouns of these phrases. */
const NEVER_ONE_WORD = new Set(
  (
    "this that these those my your our their his her its one two three it me we you they all any some every each no not " +
    "summer winter spring fall autumn christmas halloween easter weekend tonight today tomorrow upcoming events event length " +
    "convert garden shower lost baby jazz experience brothers sisters freaks king queen london paris france germany italy spain " +
    "beach usa uk black white red pink blue green love ever outfit seconds minutes hours aid hell heaven home house world city " +
    "country people man men woman women girl girls boy boys kids family friends night day days time times life music sound"
  ).split(" "),
);
const FOREIGN_STOP = new Set(["do", "da", "dos", "das", "del", "di", "du", "des", "im", "am", "auf", "von", "y", "e", "et", "und", "con", "mit", "with", "vs", "versus", "feat", "ft", "featuring", "by", "for", "to", "from", "who", "what", "when", "where", "how", "why", "is", "was", "are", "did", "does", "near", "me"]);

const GENRE_WORDS = new Set(GENRES.flatMap((g) => [...genreSearchWords(g), g]).flatMap((w) => normalizeForMatch(w).split(" ")).filter((w) => w !== "and"));

const ignorable = (w: string) =>
  GENERIC_WORDS.includes(w) || STOP.has(w) || FOREIGN_STOP.has(w) || EXTRA_WORDS.includes(w) || GENRE_WORDS.has(w) || /^\d+(s|th|st|nd|rd)?$/.test(w) || w.length < 2;

/**
 * The band's name in a search phrase: the first run of words that are not modifiers ("live", "full concert", years,
 * genres, "youtube"), at most six words; a leading "the" is kept when the run follows it ("the dead weather live").
 * Null when nothing is left or it looks like an event or a place.
 */
export function bandNameFromPhrase(phrase: string): string | null {
  const words = normalizeForMatch(phrase).split(" ").filter(Boolean);
  let i = 0;
  while (i < words.length && ignorable(words[i])) i++;
  const run: string[] = [];
  // Small words inside a name ("queens of the stone age", "florence and the machine"); "at" or "in" ends it (a place follows).
  const INNER = new Set(["the", "and", "of", "n", "a", "to", "for"]);
  let j = i;
  while (j < words.length && run.length < 6) {
    if (!ignorable(words[j])) {
      run.push(words[j++]);
      continue;
    }
    let k = j;
    while (k < words.length && INNER.has(words[k])) k++;
    if (k === j || k >= words.length || ignorable(words[k]) || !run.length) break;
    run.push(...words.slice(j, k));
    j = k;
  }
  if (!run.length) return null;
  if (i > 0 && words[i - 1] === "the") run.unshift("the");
  // A name that opens the phrase keeps its first word even when that word alone means nothing:
  // "in flames live", "a perfect circle live", "30 seconds to mars live", "311 live" (not a year).
  else if (i === 1 && (words[0] === "in" || words[0] === "a" || /^\d{1,3}$/.test(words[0]))) run.unshift(words[0]);
  const name = run.join(" ");
  if (name.replace(/^the /, "").length < 2 || EVENT_WORDS.test(name)) return null;
  // The name of an event: "jazz festival leverkusen", "freaks in a field festival", "hell fest" (a festival before any "at").
  const rest = words.slice(j);
  const at = rest.findIndex((w) => w === "at");
  if (EVENT_WORDS.test((at < 0 ? rest : rest.slice(0, at)).join(" "))) return null;
  if (NON_MUSIC.test(words.join(" "))) return null;
  return name;
}

/**
 * Whether a phrase uses a one-word name the way people search a band: the name leads the phrase ("heart live full
 * concert", "the fall live 1983", "youtube heart live") or follows "by"/"of"/"from"/"do"/"de" ("full concerts by
 * mudvayne"). Not "best live performances ever", "full concert experience" or "concert outfit ideas". Pure.
 */
export function leadsPhrase(phrase: string, name: string): boolean {
  const words = normalizeForMatch(phrase).split(" ").filter(Boolean);
  const n = normalizeForMatch(name).replace(/^the /, "").split(" ");
  const at = words.findIndex((_, k) => n.every((w, x) => words[k + x] === w));
  if (at < 0) return false;
  let k = at - 1;
  if (k >= 0 && words[k] === "the") k--;
  if (k < 0) return true;
  if (["by", "of", "from", "do", "de", "von"].includes(words[k])) return true;
  return k === 0 && ["youtube", "watch"].includes(words[0]);
}

/** The words of our bands' names, singular and plural: `parts` of names of two words or more ("flames" of In Flames,
 * "fall" of Fall Out Boy, "seconds" of 30 Seconds to Mars), `forms` the other number of one-word names ("hive" for The Hives). */
export interface OurWords {
  parts: Set<string>;
  forms: Set<string>;
}

const otherNumber = (w: string) => (w.endsWith("s") ? w.slice(0, -1) : `${w}s`);

/** The words of our bands' names (OurWords). Pure. */
export function wordsOfOurBands(names: string[]): OurWords {
  const out: OurWords = { parts: new Set(), forms: new Set() };
  for (const n of names) {
    const all = normalizeForMatch(n).replace(/^the /, "").split(" ").filter(Boolean);
    if (all.length === 1) {
      out.forms.add(otherNumber(all[0]));
      continue;
    }
    for (const w of all.filter((x) => !STOP.has(x) && !FOREIGN_STOP.has(x))) {
      out.parts.add(w);
      out.parts.add(otherNumber(w));
    }
  }
  return out;
}

/** What "The ..." names that are not bands are: places and things ("the beach", "the garden"). */
const THE_THINGS = new Set("beach garden park forum venue arena stadium hall club bar pub theatre theater festival show concert end best one".split(" "));

/**
 * Why a listed name is not a band people search for (null = it may be one): an everyday word ("Convert", "Summer"),
 * a word of one of our bands' names ("Flames", "Red", "Seconds"), our band in the other number ("The Hive"), or a
 * pageant. A name people write with "The" is a name ("The Fall", "The Dead"): only places and things ("The Beach")
 * and other numbers of ours are dropped. Used on the ranking and again by the check. Pure.
 */
export function notABandReason(name: string, ours: OurWords): string | null {
  const n = normalizeForMatch(name);
  const core = n.replace(/^the /, "");
  if (!core) return "empty";
  if (/^miss /.test(core)) return "pageant";
  if (core.includes(" ")) return null;
  if (ours.forms.has(core)) return "part of one of our bands' names";
  if (n.startsWith("the ")) return THE_THINGS.has(core) ? "everyday word" : null;
  if (NEVER_ONE_WORD.has(core)) return "everyday word";
  if (ours.parts.has(core)) return "part of one of our bands' names";
  return null;
}

/** One key for the spellings of a name: "AC/DC" = "ac dc" = "acdc", "The Cure" = "cure". */
export function bandKey(name: string): string {
  return normalizeForMatch(name).replace(/^the /, "").replace(/ /g, "");
}

/** "rage against the machine" -> "Rage Against the Machine". */
export function displayName(name: string): string {
  return name
    .split(" ")
    .map((w, i) => (i > 0 && (STOP.has(w) || w === "and") ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export interface MissingBand {
  key: string;
  name: string;
  score: number;
  phrases: number;
  rank: number;
  examples: string[];
}

/** A name needs at least this many phrases (a one-word name: phrases it leads) to be listed. */
export const MIN_PHRASES = 2;

/**
 * The bands of the "band or event: not on the site" phrases, ranked by total score. Spellings merge by key; a longer
 * name that starts with a listed band's name of two words or more ("pink floyd pulse") joins that band. `skip` (keys)
 * leaves names out; `ourNames` (our bands' names) drops one-word names that are a word of one of them. A name needs
 * MIN_PHRASES phrases; a one-word name needs MIN_PHRASES phrases that it leads (leadsPhrase).
 */
export function missingBands(rows: KeywordRow[], opts: { top?: number; skip?: Set<string>; ourNames?: string[] } = {}): MissingBand[] {
  const ourWords = wordsOfOurBands(opts.ourNames ?? []);
  // "bruce springsteen hyde park": one of ours with a place after it, not a missing band.
  const ourStarts = (opts.ourNames ?? []).map((n) => `${normalizeForMatch(n).replace(/^the /, "")} `);
  const groups = new Map<string, { spellings: Map<string, number>; score: number; phrases: { phrase: string; score: number }[] }>();
  for (const r of rows) {
    if (r.gap !== GAPS.bandMissing) continue;
    const name = bandNameFromPhrase(r.phrase);
    if (!name || notABandReason(name, ourWords)) continue;
    const plain = normalizeForMatch(name).replace(/^the /, "");
    if (ourStarts.some((o) => plain.startsWith(o))) continue;
    const key = bandKey(name);
    if (!key || opts.skip?.has(key)) continue;
    const g = groups.get(key) ?? { spellings: new Map<string, number>(), score: 0, phrases: [] as { phrase: string; score: number }[] };
    g.spellings.set(name, (g.spellings.get(name) ?? 0) + r.score);
    g.score += r.score;
    g.phrases.push({ phrase: r.phrase, score: r.score });
    groups.set(key, g);
  }
  // Longer names that start with a shorter listed name fold into it (an album, a city or a venue after the band:
  // "eagles hell freezes over"). Everyday words were dropped above, so "black country new road" has no "black" to join.
  const byWords = [...groups.entries()].map(([key, g]) => ({ key, g, words: [...g.spellings.keys()][0].replace(/^the /, "").split(" ") }));
  byWords.sort((a, b) => a.words.length - b.words.length);
  for (const long of byWords) {
    const into = byWords.find((s) => s !== long && s.words.length < long.words.length && groups.has(s.key) && s.words.every((w, i) => long.words[i] === w));
    if (!into || !groups.has(long.key)) continue;
    into.g.score += long.g.score;
    into.g.phrases.push(...long.g.phrases);
    groups.delete(long.key);
  }
  // Seen as a band in several phrases: one-word names in phrases they lead.
  for (const [key, g] of groups) {
    const name = [...g.spellings.keys()][0];
    const oneWord = !name.replace(/^the /, "").includes(" ");
    const count = oneWord ? g.phrases.filter((p) => leadsPhrase(p.phrase, name)).length : g.phrases.length;
    if (count < MIN_PHRASES) groups.delete(key);
  }
  const list = [...groups.entries()].map(([key, g]) => {
    const best = [...g.spellings.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
    return {
      key,
      name: displayName(best),
      score: Math.round(g.score * 10) / 10,
      phrases: g.phrases.length,
      rank: 0,
      examples: g.phrases.sort((a, b) => b.score - a.score).slice(0, 5).map((p) => p.phrase),
    };
  });
  list.sort((a, b) => b.score - a.score || b.phrases - a.phrases || a.name.localeCompare(b.name));
  return list.slice(0, opts.top ?? list.length).map((b, i) => ({ ...b, rank: i + 1 }));
}

/** The parseable end of the keyword log: MISSING_BAND<TAB>score<TAB>phrases<TAB>name. */
export function missingBandsTail(list: MissingBand[]): string[] {
  return [`==== MISSING BANDS: TOP ${list.length} (score, phrases, name) ====`, ...list.map((b) => `MISSING_BAND\t${b.score}\t${b.phrases}\t${b.name}`)];
}

// ---------- Genre families (MusicBrainz genres and tags) ----------

/** MusicBrainz genre words that are ours, and the genre of our list they point to. Longest first. */
const OURS: [RegExp, (typeof GENRES)[number]][] = [
  [/\btrip[ -]?hop\b|\bbristol sound\b/, "trip hop"],
  [/\bbig beat\b|\belectronic rock\b|\belectro[ -]?rock\b|\belectropunk\b|\bdigital hardcore\b|\bindustrial rock\b/, "electronic rock / big beat"],
  [/\bart pop\b|\bavant[ -]?pop\b|\bexperimental (rock|pop)\b|\bart rock\b|\bchamber pop\b/, "art pop / experimental"],
  [/\bpost[ -]?punk\b|\bgothic rock\b|\bcoldwave\b|\bno wave\b/, "post-punk"],
  [/\bnew wave\b|\bsynth[ -]?pop\b|\bdarkwave\b|\bnew romantic\b/, "new wave / synth"],
  [/\bemo\b|\bpost[ -]?hardcore\b|\bscreamo\b|\bmetalcore\b/, "emo / post-hardcore"],
  [/\bshoegaze\b|\bdream pop\b|\bnoise pop\b/, "shoegaze"],
  [/\bstoner\b|\bdesert rock\b|\bsludge\b|\bdoom metal\b/, "stoner"],
  [/\bgrunge\b/, "grunge"],
  [/\bgarage\b(?! house)/, "garage"],
  [/\bmetal\b|\bthrash\b|\bgrindcore\b|\bdjent\b/, "metal"],
  [/\bpunk\b|\bhardcore\b(?! techno)|\boi!?\b/, "punk"],
  [/\bhard rock\b|\bglam metal\b|\bglam rock\b|\bboogie rock\b/, "hard rock"],
  [/\bindie\b|\bbritpop\b|\bjangle pop\b|\bmath rock\b|\bpost[ -]?rock\b|\bnoise rock\b|\bkrautrock\b|\bmadchester\b/, "indie"],
  [/\balternative\b|\bnu metal\b|\bfunk rock\b|\bcrossover\b/, "alternative"],
  [/\bclassic rock\b|\bblues rock\b|\bprogressive rock\b|\bpsychedelic rock\b|\bfolk rock\b|\bsouthern rock\b|\bheartland rock\b|\barena rock\b|\bsoft rock\b|\bpop rock\b|\bcountry rock\b|\broots rock\b|\bproto[ -]?punk\b|\bspace rock\b|\brock and roll\b|\brock & roll\b|\brock\b/, "classic rock"],
];
/** MusicBrainz genre words that are not ours (owner: no pop, hip hop, country, jazz...). */
const OTHER =
  /\bpop\b|\bhip[ -]?hop\b|\brap\b|\btrap\b|\bdrill\b|\bgrime\b|\br&b\b|\brnb\b|\bsoul\b|\bfunk\b|\bdisco\b|\bcountry\b|\bbluegrass\b|\bfolk\b|\bsinger[ -]?songwriter\b|\bjazz\b|\bblues\b|\breggae\b|\bdancehall\b|\bska\b|\blatin\b|\breggaeton\b|\bsalsa\b|\bbachata\b|\bcumbia\b|\bk-?pop\b|\bj-?pop\b|\bclassical\b|\borchestral\b|\bopera\b|\bsoundtrack\b|\bschlager\b|\bgospel\b|\bchristian\b|\bworship\b|\bedm\b|\bhouse\b|\btechno\b|\btrance\b|\bdubstep\b|\bdrum and bass\b|\bdance\b|\belectropop\b|\belectronic\b|\bambient\b|\bnew age\b|\bchanson\b|\bmpb\b|\bsamba\b|\bbossa nova\b|\bafrobeats?\b|\bamapiano\b|\bcomedy\b|\bchildren'?s music\b|\bmusical\b|\bteen pop\b|\beasy listening\b|\blounge\b/;

export type GenreFamily = "OURS" | "OTHER" | "NO_GENRES";

/**
 * Whether a band's MusicBrainz genres (most used first) are in our families. Each genre is ours (it maps to one of
 * our genres), other (pop, hip hop, country, jazz...) or neutral (a country, a decade, "male vocalists"). OURS when
 * one of the first three classified genres is ours and ours are at least as many as the others among the first
 * five; "pop rock" and "synth-pop" count as ours, "pop" alone does not.
 */
export function genreFamily(mbGenres: string[]): { family: GenreFamily; ours: string[] } {
  const classified: { ours: boolean; genre?: string }[] = [];
  for (const raw of mbGenres) {
    const g = raw.toLowerCase().trim();
    const mine = OURS.find(([re]) => re.test(g));
    if (mine) classified.push({ ours: true, genre: mine[1] });
    else if (OTHER.test(g)) classified.push({ ours: false });
  }
  if (!classified.length) return { family: "NO_GENRES", ours: [] };
  const top5 = classified.slice(0, 5);
  const ours = top5.filter((c) => c.ours).length;
  const keep = classified.slice(0, 3).some((c) => c.ours) && ours >= top5.length - ours;
  const genres = [...new Set(classified.filter((c) => c.ours).map((c) => c.genre!))].slice(0, 3);
  return { family: keep ? "OURS" : "OTHER", ours: keep ? genres : [] };
}

/** "missing-bands-check:top=40", "missing-bands-publish:top=40", "missing-bands-publish:names=Idles|Fontaines D.C." */
export function missingBandsArgs(op: string): { top: number; names: string[]; noBatch: boolean } {
  const rest = op.replace(/^missing-bands-(check|publish):?/, "");
  const out = { top: 40, names: [] as string[], noBatch: false };
  for (const part of rest.split(",").map((x) => x.trim()).filter(Boolean)) {
    const [k, ...v] = part.split("=");
    const value = v.join("=").trim();
    if (k === "top" && Number(value) > 0) out.top = Math.min(300, Number(value));
    else if (/^\d+$/.test(k)) out.top = Math.min(300, Number(k));
    else if (k === "names") out.names = value.split("|").map((x) => x.trim()).filter(Boolean);
    else if (k === "no-batch") out.noBatch = true;
    else throw new Error(`${op}: unknown option ${part}`);
  }
  return out;
}
