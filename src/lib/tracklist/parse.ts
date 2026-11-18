// Reads a tracklist out of free text: a YouTube video description or a viewer comment.
// The same rules apply to both, because people write tracklists the same way in either place:
//   00:00 Artist - Title          [00:00] Artist – Title (Original Mix)
//   1:02:33 ID - ID               01. Artist - Title [Label]
//   Artist - Title (12:30)        1. 00:00 Artist — Title
// A text only counts as a tracklist when it passes the checks in `validateTracks`; texts that look
// like a tracklist but fail them are reported as "unclear" so they can be handed to Claude.

export interface Track {
  /** Seconds from the start of the set, when the text gives a time. */
  time: number | null;
  /** Null when the line names no artist (e.g. a chapter such as "00:00 Intro"). */
  artist: string | null;
  title: string;
}

export type ParseResult =
  | { kind: "tracklist"; tracks: Track[]; timed: boolean }
  /** Looks like it tries to be a tracklist, but fails the checks. Worth asking Claude. */
  | { kind: "unclear"; reason: string }
  | { kind: "none" };

export const MIN_TRACKS = 5;
/** Share of lines that must name both an artist and a title (or be an ID). Chapter lists fail this. */
const MIN_NAMED_SHARE = 0.6;
/** Non-track lines allowed inside one tracklist (a "Part 2" heading, a stray note) before it is cut. */
const MAX_GAP_LINES = 2;

const TIME = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}`;
const LEAD = String.raw`^[\s\-–—•*·▶►>|]*`;
const NUMBER = String.raw`(?:#?\d{1,3}\s*[.)\]]\s*|#\d{1,3}\s+)`;
const TIME_LEAD = new RegExp(
  `${LEAD}(?:${NUMBER})?[\\[(]?(${TIME})[\\])]?(?:\\s*[-–—|:.]\\s*|\\s+)(?:${NUMBER})?(.+)$`,
);
const TIME_TRAIL = new RegExp(`${LEAD}(?:${NUMBER})?(.+?)\\s*[-–—|]?\\s*[\\[(]?(${TIME})[\\])]?\\s*$`);
const NUMBERED = new RegExp(`${LEAD}${NUMBER}(.+)$`);
const SEPARATOR = /\s+[-–—]\s+|\s+[-–—](?=\S)|(?<=\S)[–—]\s+/;
const NOT_A_TRACK = /https?:\/\/|www\.|@\w|#\w{3,}|\b(instagram|facebook|tiktok|spotify|soundcloud|twitter|subscribe|tickets?)\b/i;

/** "1:02:33" -> 3753 seconds. */
export function timeToSeconds(text: string): number {
  return text.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

/** True for a track nobody has identified yet ("ID - ID", "Artist - ID", or just "ID"). */
export function isUnidentified(track: Track): boolean {
  return /^ID$/i.test(track.title.trim());
}

function clean(text: string): string {
  return text
    .replace(/\s+/g, " ")
    // Trailing dots stay: they are part of names like "Fred again..".
    .replace(/^[\s\-–—|:.]+|[\s\-–—|:]+$/g, "")
    .trim();
}

const TRAILING_TIME = new RegExp(`\\s*[-–—|]?\\s*[\\[(]?${TIME}[\\])]?\\s*$`);
/** Further times at the start ("0:58:10 1:04:27 Artist - Title" keeps only the first one, already read). */
const LEADING_TIMES = new RegExp(`^(?:\\s*[\\[(]?${TIME}[\\])]?\\s*[-–—|:]?)+\\s*`);

/** HTML entities that YouTube sometimes leaves in descriptions. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const NOTE_WORDS = String.raw`unrel?ea?sed|unreleasd|out now|forthcoming|free download|premiere`;
/** Words that mean "this is a version", kept when they are in brackets. */
const VERSION_WORDS = /remix|rmx|edit|mix|dub|version|rework|vip|bootleg|mashup|reprise|revision|respray/i;

/**
 * A title without the notes uploaders glue to it: "Kali UNREALESED", "(Out Now)", "{Played by Adam}",
 * a label in square brackets ("[OGUM]", but not "[Tinlicker Remix]"), a label in capitals after the
 * title ("Overdrive (Intro Mix) KNTXT", "Seda AFTR:HRS") and a trailing "ID" ("Kompass 2022 ID").
 */
export function cleanTitle(title: string): string {
  let t = title
    .replace(/\{[^}]*\}/g, " ")
    .replace(new RegExp(String.raw`[([]\s*(?:${NOTE_WORDS})\s*[)\]]`, "gi"), " ")
    .replace(new RegExp(String.raw`\s+[-–—]?\s*\b(?:${NOTE_WORDS})\b\s*$`, "i"), " ")
    .replace(/\[([^\]]*)\]/g, (m, inner: string) => (VERSION_WORDS.test(inner) ? m : " "));
  t = t.replace(/\s+/g, " ").trim();
  // A capitals-only word at the end is a label, but only when the title also has lowercase letters
  // ("Seda AFTR:HRS"), so titles written in capitals ("NO8DO") are kept.
  const caps = /\s+([A-Z0-9][A-Z0-9:&.'-]{1,}[A-Z0-9])$/.exec(t);
  if (caps && /[a-z]/.test(t.slice(0, caps.index)) && /[A-Z]/.test(caps[1]) && caps[1].length >= 3) {
    t = t.slice(0, caps.index);
  }
  t = t.replace(/\s+ID$/, "");
  return t.replace(/\s+/g, " ").replace(/[\s\-–—|:]+$/, "").trim() || title.trim();
}
const UNRELEASED = /^\(?(unreleased|forthcoming|unknown)\)?$/i;

function splitArtistTitle(rest: string): { artist: string | null; title: string } {
  // A line with a time at both ends ("1:22 Title - Artist 0:12") keeps only the first one.
  const text = clean(decodeEntities(rest).replace(TRAILING_TIME, "").replace(LEADING_TIMES, ""));
  if (/^ID$/i.test(text)) return { artist: "ID", title: "ID" };
  const match = SEPARATOR.exec(text);
  if (!match) return { artist: null, title: text };
  const artist = clean(text.slice(0, match.index));
  const title = cleanTitle(clean(text.slice(match.index + match[0].length)));
  if (!artist || !title) return { artist: null, title: text };
  // "Space Diver - unreleased" names the track, not an artist called "Space Diver".
  if (UNRELEASED.test(title)) return { artist: null, title: `${artist} (${title.replace(/[()]/g, "").toLowerCase()})` };
  return { artist, title };
}

/** One line read as a track, or null when it is not one. */
export function parseLine(line: string): Track | null {
  const text = line.trim();
  if (!text || NOT_A_TRACK.test(text)) return null;

  const lead = TIME_LEAD.exec(text);
  if (lead) {
    const { artist, title } = splitArtistTitle(lead[2]);
    return title ? { time: timeToSeconds(lead[1]), artist, title } : null;
  }
  const trail = TIME_TRAIL.exec(text);
  if (trail && SEPARATOR.test(trail[1])) {
    const { artist, title } = splitArtistTitle(trail[1]);
    return title ? { time: timeToSeconds(trail[2]), artist, title } : null;
  }
  const numbered = NUMBERED.exec(text);
  if (numbered) {
    const { artist, title } = splitArtistTitle(numbered[1]);
    // A numbered line only counts when it names an artist: "1. Intro" on its own says too little.
    return artist ? { time: null, artist, title } : null;
  }
  return null;
}

/**
 * Some uploaders write "Title - Artist" ("Petit Matin - NTO"). When one name sits on the right of
 * at least 3 lines and more often than on the left, those lines are turned round. Lines already
 * written "Artist - Title" are left as they are.
 */
export function fixSwapped(tracks: Track[]): Track[] {
  const key = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const right = new Map<string, number>();
  const left = new Map<string, number>();
  for (const t of tracks) {
    if (!t.artist || isUnidentified(t)) continue;
    right.set(key(t.title), (right.get(key(t.title)) ?? 0) + 1);
    left.set(key(t.artist), (left.get(key(t.artist)) ?? 0) + 1);
  }
  const swapped = new Set(
    [...right].filter(([name, n]) => name && n >= 3 && n > (left.get(name) ?? 0)).map(([name]) => name),
  );
  if (!swapped.size) return tracks;
  return tracks.map((t) =>
    t.artist && swapped.has(key(t.title)) ? { ...t, artist: t.title, title: cleanTitle(t.artist) } : t,
  );
}

/** Runs of track lines, allowing blank lines and a few stray lines inside a run. */
function blocks(text: string): Track[][] {
  const result: Track[][] = [];
  let current: Track[] = [];
  let gap = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const track = parseLine(line);
    if (track) {
      current.push(track);
      gap = 0;
    } else if (current.length && ++gap > MAX_GAP_LINES) {
      result.push(current);
      current = [];
      gap = 0;
    }
  }
  if (current.length) result.push(current);
  return result;
}

/**
 * The checks a list of tracks must pass to be shown. Also used on Claude's answers.
 * Returns null when the list is fine, or the reason it is not.
 */
export function validateTracks(tracks: Track[], durationSeconds?: number): string | null {
  if (tracks.length < MIN_TRACKS) return `only ${tracks.length} tracks`;
  const named = tracks.filter((t) => t.artist || isUnidentified(t)).length;
  if (named / tracks.length < MIN_NAMED_SHARE) return "most lines name no artist (chapters, not tracks)";
  const times = tracks.map((t) => t.time);
  if (times.some((t) => t !== null)) {
    if (times.some((t) => t === null)) return "some tracks have a time and some do not";
    for (let i = 1; i < times.length; i++) {
      if (times[i]! < times[i - 1]!) return "times go backwards";
    }
    if (durationSeconds && times[times.length - 1]! > durationSeconds + 60) return "times run past the end of the set";
  }
  return null;
}

/** Find the tracklist in a description or comment. */
export function parseTracklist(text: string, durationSeconds?: number): ParseResult {
  const candidates = blocks(text).sort((a, b) => b.length - a.length);
  if (!candidates.length) return { kind: "none" };

  let firstProblem: string | null = null;
  for (const tracks of candidates) {
    const problem = validateTracks(tracks, durationSeconds);
    if (!problem) return { kind: "tracklist", tracks: fixSwapped(tracks), timed: tracks[0].time !== null };
    // A short run (a couple of timestamps in a sentence) is just text, not a failed tracklist.
    if (tracks.length >= MIN_TRACKS) firstProblem ??= problem;
  }
  if (firstProblem) return { kind: "unclear", reason: firstProblem };
  if (/\btrack\s?list\b/i.test(text) && candidates[0].length >= 2) {
    return { kind: "unclear", reason: "mentions a tracklist but too few lines could be read" };
  }
  return { kind: "none" };
}
