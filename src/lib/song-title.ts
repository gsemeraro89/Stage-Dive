// One name and one address per song (owner, 19 Nov 2026: a page for every song played live).
// Setlists (video descriptions, viewer comments) spell the same song in many ways and mix in lines
// that are not songs at all. Three steps, all automatic:
// - songParts(): one setlist line -> the songs in it. A medley ("A / B / C", "Metallica Medley - A/B")
//   counts as each of its songs; lines that are not songs (solos, intros, jams, speeches, notes,
//   shouts, broken fragments) give nothing. Those lines stay on the concert's own setlist; they just
//   never become song pages or count in any figure.
// - songTitleBase(): the song's name without what is a note about the performance: numbering
//   ("19 - "), emoji, times ("- *12:43*", "(1:59:51)"), "(Live)", "- Remastered", "(Diamond Head
//   cover)", "(Slightly shortened version while ...)", "- Snippet", "Encore:". Real subtitles stay:
//   "(Time of Your Life)", "(Fade Out)", "(Sanitarium)".
// - songSlug(): the address under /songs/<band>/<song>. Near-duplicates ("Bloodbuzz Ohio" / "Blood Buzz
//   Ohio", "Street Spirit" / "Street Spirit (Fade Out)") are merged per band in src/lib/songs.ts.
// Pure functions, tested in tests/songs.test.ts.
import { slugify } from "./slug";

/** Words in a closing bracket that make it a note about the performance, not part of the song's name. */
const NOTE_WORDS =
  /\b(?:live|acoustic|unplugged|electric|remaster(?:ed)?|cover|covers|version|edit|remix|intro|outro|riff|jams?|jamming|solo|tease|snippet|reprise|encore|instrumental|extended|shortened|short|long|half|partial|incomplete|unfinished|unreleased|debut|highlight|missing|footage|accident|breakdown|commentary|dedicat\w*|until|while|may have|played|kick|song|feat\.?|ft\.?|featuring|w\/)(?=$|[^\p{L}\p{N}])/iu;

/** A closing bracket is a note when it says one of NOTE_WORDS, starts "with"/"con", quotes something, holds a time, or has no words. */
function isNoteInBrackets(inner: string): boolean {
  const t = inner.trim();
  return (
    NOTE_WORDS.test(t) ||
    /^(?:with|con)\s/i.test(t) ||
    /["“”¨]/.test(t) ||
    /\d{1,2}:\d{2}/.test(t) ||
    !/[\p{L}\p{N}]/u.test(t)
  );
}

/** What may follow a dash at the end of a line: "- Live", "- 2011 Remaster", "- Snippet", "- Outro". */
const NOTE_AFTER_DASH =
  /\s+[-–—]\s+(?:live\b.*|(?:\d{4}\s+)?(?:digital(?:ly)?\s+)?remaster(?:ed)?\b.*|acoustic\b.*|unplugged\b.*|(?:radio|single|album)\s+(?:edit|version)|demo|reprise|intro|outro|cover|snippet|tease)$/i;

/** "Encore:", "Encore 2 -", "E1:" in front of a song. */
const ENCORE_PREFIX = /^(?:encore(?:\s*\d+)?|e\d)\s*[:.\-–—]\s*/i;
/** "1 - ", "19 - ", "7 -Holiday", "08b. ", "3) " in front of a song. Not "21 Guns", "1984" or "2112: ...". */
const NUMBERING = /^(?:\d{1,3}[a-z]?[.)]\s+|\d{1,3}\s+[-–—]\s*)/i;
/** Emoji and pictographs anywhere (🐎 🧢 🖤 🎶 ✨ 🦣). */
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
/** Symbols in front of a song ("* Dead Embryonic Cells", "• One"). */
const LEADING_SYMBOLS = /^[^\p{L}\p{N}"“‘'(\[¿¡]+/u;
/** A time at the end: "- *12:43*", " 1:43:43", " [53:50]". */
const TRAILING_TIME = /\s*[-–—:|]?\s*[*(\[]?\s*\d{1,2}(?::\d{2}){1,2}\s*[*)\]]?\s*$/;
/** A bracket holding a time anywhere: "(1:59:51)", "[53:50]", "(2:21:07 double kick!)". */
const BRACKETED_TIME = /\s*[([]\s*\d{1,2}(?::\d{2}){1,2}[^)\]]*[)\]]/g;

/**
 * The song's name without notes about the performance:
 * "Creep (Live)" -> "Creep", "19 - Basket Case" -> "Basket Case", "🖤 Haunted" -> "Haunted",
 * "A Ton of Love - *12:43*" -> "A Ton of Love", "Good Riddance (Time of Your Life) (Slightly shortened
 * version while Tré fixed his kick drum pedal)" -> "Good Riddance (Time of Your Life)".
 */
export function songTitleBase(title: string): string {
  let t = title.normalize("NFC").replace(PICTOGRAPHS, " ").replace(/\s+/g, " ").trim();
  let before = "";
  while (t !== before) {
    before = t;
    t = t
      .replace(LEADING_SYMBOLS, "")
      .replace(NUMBERING, "")
      .replace(ENCORE_PREFIX, "")
      .replace(BRACKETED_TIME, "")
      .replace(TRAILING_TIME, "")
      .replace(/\)\.$/, ")")
      // Square brackets are always notes ("[tease]", "[Metallica cover]", "[w/ Vogg Solo Outro]").
      .replace(/\s*\[[^\]]*\]\s*$/, "")
      .replace(/\s*\(([^()]*)\)\s*$/, (m, inner: string) => (isNoteInBrackets(inner) ? "" : m))
      .replace(NOTE_AFTER_DASH, "")
      // "The Wars End w/ 'There Is Power in a Union' snippet"
      .replace(/\s+w\/\s.*$/i, "")
      // Markers some setlists add ("Creep*", "Creep +", "Creep †") and a separator left at the end.
      .replace(/[\s*+†#:\-–—|,]+$/, "")
      .replace(/^["“”'‘’]+(?=[^"“”'‘’]+["“”'‘’]+$)|(?<=^["“”'‘’]+[^"“”'‘’]+)["“”'‘’]+$/g, "")
      .trim();
  }
  return t || title.trim();
}

/** Lines that are something else than a song, said anywhere in the line. */
const NOT_A_SONG_ANYWHERE =
  /\bnot a song\b|\bsong\s*\?|\bspoiler\b|\bnot played\b|\bon the setlist\b|\bbattery died\b|\bmovie thing\b|\bno sound\b|\btalks?\s+to\s+(?:the\s+)?(?:crowd|audience)\b|\bantics\b|\bsoundcheck\b|^speech(?:\b|_)/i;

/** What a song's name never is, once cleaned: a solo, an intro or outro, a jam or doodle, banter, a medley's name. */
const NOT_A_SONG_NAME = [
  /\bsolos?\b/i,
  /^(?:intro|outro)\b/i,
  /\b(?:intro|outro)$/i,
  /jam(?:s|ming)?\b/i,
  /\bdoodles?\b|\bdiddle\b/i,
  /^break(?:\s*[;:]|\s+before\b|$)/i,
  /^(?:thank you|thanks)\b/i,
  /\b(?:banter|intermission)\b/i,
  /\bmedley\b/i,
  /^(?:reprise|encore|tape)$/i,
  // A shout, not a title: "SAD BUT TRUUUEEEEAAAAHHH".
  /(\p{L})\1{3,}/iu,
];

const count = (s: string, ch: RegExp) => (s.match(ch) ?? []).length;

/** True for a setlist line (one part of it) that is not a song. Such lines get no page and count in no figure. */
export function isNotASong(part: string): boolean {
  const raw = part.normalize("NFC").replace(PICTOGRAPHS, " ").replace(/\s+/g, " ").trim();
  if (!raw) return true;
  // Broken fragments: a bracket or quote that does not close, a line starting mid-sentence.
  if (count(raw, /\(/g) !== count(raw, /\)/g) || count(raw, /\[/g) !== count(raw, /\]/g)) return true;
  if (count(raw, /"/g) % 2 || count(raw, /“/g) !== count(raw, /”/g)) return true;
  if (/^[)/\]]/.test(raw) || /^with\s/.test(raw)) return true;
  // A line that is all in brackets is a note: "(a little jamming)", "[Dave talks to crowd]".
  if (/^[([].*[)\]]$/.test(raw.replace(/^[^\p{L}\p{N}([]+/u, ""))) return true;
  if (NOT_A_SONG_ANYWHERE.test(raw)) return true;
  const name = songTitleBase(raw);
  if (!/[\p{L}\p{N}]/u.test(name)) return true;
  return NOT_A_SONG_NAME.some((re) => re.test(name));
}

/** Slash-separated parts outside brackets: "A / B (x/y)" -> ["A", "B (x/y)"]. */
function slashParts(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    // "w/" is "with", not a split ("The Wars End w/ 'There Is Power in a Union' snippet").
    if (ch === "/" && depth === 0 && !/(?:^|[^\p{L}])w$/iu.test(cur)) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/**
 * The parts of a setlist line, before cleaning: a medley's songs, or the line itself.
 * "Metallica Medley - Sanitarium/One" and "Kill/Ride Medley (Ride the Lightning, No Remorse)" give
 * their songs; "A / B / C" splits; two parts split only when both have two words or more, so
 * "Weird Fishes/Arpeggi", "Refuse/Resist" and "Left/Right" stay one song.
 */
export function splitMedley(line: string): string[] {
  const text = line.trim();
  const listed = /^.*\bmedley\b\s*\(([^()]+)\)\s*$/i.exec(text);
  if (listed) return listed[1].split(/\s*[,/]\s*/).filter(Boolean);
  const named = /^.*?\bmedley\b\s*[-–—:]\s*(.+)$/i.exec(text);
  if (named) return slashParts(named[1]);
  const parts = slashParts(text);
  if (parts.length >= 3) return parts;
  if (parts.length === 2 && parts.every((p) => words(p) >= 2)) return parts;
  return [text];
}

/** The songs in one setlist line, each cleaned: none for a line that is not a song. */
export function songParts(line: string): string[] {
  if (isNotASong(line) && !/\//.test(line)) return [];
  return splitMedley(line)
    .filter((p) => !isNotASong(p))
    .map(songTitleBase)
    .filter((t) => Boolean(songSlug(t)));
}

/** The song's address under its band: "Creep (Live)" -> "creep", "Seek & Destroy" -> "seek-and-destroy". Empty when nothing is left. */
export function songSlug(title: string): string {
  // Letters slugify cannot take apart: "BECØME" -> "become", "Ærosol" -> "aerosol", "Straße" -> "strasse".
  const t = songTitleBase(title).replace(/[øØ]/g, "o").replace(/[æÆ]/g, "ae").replace(/ß/g, "ss").replace(/[łŁ]/g, "l").replace(/[đĐ]/g, "d");
  return slugify(t);
}

/** An address without its hyphens and a leading "the", to catch "Bloodbuzz Ohio" / "Blood Buzz Ohio", "Anybody" / "Any Body" and "Four Horsemen" / "The Four Horsemen". */
export const compactSlug = (slug: string) => slug.replace(/^the-/, "").replace(/-/g, "");

/** The short form of a title with a subtitle in brackets: "Street Spirit (Fade Out)" -> "street-spirit". Null without one. */
export function shortSongSlug(title: string): string | null {
  const m = /^(.*\S)\s*\([^()]+\)$/.exec(songTitleBase(title));
  return m ? slugify(m[1]) || null : null;
}
