// Fan-uploaded concerts ("bootlegs"), owner decision 20 Nov 2026: first a measuring dry run, nothing published.
// Owner rules: pro-shot only (TV, broadcast or professionally filmed shows uploaded by fans; never audience or
// phone footage, never audio only); complete shows only (40 minutes or more, one band, the whole concert or
// festival set); only the bands of data/artist-rules.json; one video per concert (the best one); an official
// version of the same concert always wins. Every other rule still applies (date, no home sessions, embeddable,
// public, not blocked in a key country: the lane's free filters run before these).
// Pure functions only, so the rules can be tested without YouTube, Claude or a database.

import { slugify } from "../slug";
import { excludedTitleWord } from "./lane";
import { isHomeOrOnlineSession, isSameConcert, readPerformed, resolveDuplicate, type ConcertIdentity } from "./rules";

// ---------- 1. Free filters (before Claude) ----------

/**
 * Title words that say a fan upload is not one band's own full concert, on top of the lane's excluded words
 * (trailer, interview, documentary, reaction, cover, lyrics, full album, compilation, best of...).
 */
const BOOTLEG_EXCLUDED: { word: string; pattern: RegExp }[] = [
  { word: "tribute", pattern: /\btribute\b/i },
  { word: "cover band", pattern: /\bcover ?band\b|\bcovers band\b/i },
  { word: "karaoke", pattern: /\bkaraoke\b/i },
  { word: "album stream", pattern: /\balbum stream\b|\bfull lp\b|\bwhole album\b/i },
  { word: "instrument cam", pattern: /\b(drum|guitar|bass|keys?) ?cam\b|\bplaythrough\b/i },
  { word: "rehearsal", pattern: /\brehearsals?\b|\bsound ?check\b/i },
  { word: "remix", pattern: /\bremix(es|ed)?\b|\bmash ?up\b|\bmegamix\b/i },
  { word: "various artists", pattern: /\bvarious artists\b/i },
  { word: "8-bit", pattern: /\b8[- ]?bit\b/i },
];

/** The word that keeps a fan upload away from Claude, or null. */
export function bootlegTitleDrop(title: string): string | null {
  return excludedTitleWord(title) ?? BOOTLEG_EXCLUDED.find((x) => x.pattern.test(title))?.word ?? null;
}

// ---------- 2. How it was filmed ----------

export const SHOT_TYPES = ["PRO_SHOT", "AUDIENCE", "AUDIO_ONLY", "UNKNOWN"] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

/** Whole words or phrases, so "arte" does not match "Smarte" and "pit" not "spit". */
const phrases = (list: string[]) =>
  new RegExp(`(^|[^a-z0-9])(${list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s_-]*")).join("|")})(?=$|[^a-z0-9])`, "i");

/** Broadcasters and words of professional filming (TV, DVD, multicam, webcast). */
export const PRO_WORDS = phrases([
  "rockpalast", "bbc", "mtv", "arte", "arte concert", "rock in rio", "vh1", "zdf", "wdr", "ndr", "swr", "orf", "rai", "rtve",
  "nhk", "pbs", "canal+", "france 2", "france 3", "tv broadcast", "telecast", "televised", "tv special", "tv show",
  "pro-shot", "pro shot", "proshot", "multicam", "multi-cam", "multi cam", "dvd", "blu-ray", "bluray", "laserdisc",
  "webcast", "hdtv", "tv", "broadcast",
]);
/** Words of a fan in the crowd. */
export const AUDIENCE_WORDS = phrases([
  "audience", "aud", "phone", "iphone", "smartphone", "front row", "from the pit", "in the pit", "pit view", "fancam",
  "fan cam", "fan footage", "fan filmed", "filmed by a fan", "crowd view", "from the crowd", "barrier", "balcony view",
]);
/** Words of a sound-only recording. */
const AUDIO_PHRASES = phrases([
  "audio only", "only audio", "full audio", "audio recording", "radio broadcast", "fm broadcast", "radio show",
  "radio session", "radio concert",
]);
export const AUDIO_ONLY_WORDS = { test: (text: string) => AUDIO_PHRASES.test(text) || /[([]\s*audio\s*[)\]]/i.test(text) };

/**
 * The shot type the dry run counts, from Claude's answer and the video's own words (owner: pro-shot only,
 * so in doubt it is not pro-shot):
 * - audio-only words in the title ("[AUDIO]", "FM broadcast") or Claude saying AUDIO_ONLY -> AUDIO_ONLY;
 * - Claude saying AUDIENCE -> AUDIENCE;
 * - Claude saying PRO_SHOT -> PRO_SHOT, unless the title says audience/phone and no broadcaster or pro word;
 * - Claude unsure (UNKNOWN) -> PRO_SHOT only when the title names a broadcaster or a pro word and no audience word.
 */
export function decideShotType(claude: ShotType, title: string): ShotType {
  const audioOnly = AUDIO_ONLY_WORDS.test(title);
  if (claude === "AUDIO_ONLY" || audioOnly) return "AUDIO_ONLY";
  if (claude === "AUDIENCE") return "AUDIENCE";
  const pro = PRO_WORDS.test(title);
  const audience = AUDIENCE_WORDS.test(title);
  if (claude === "PRO_SHOT") return audience && !pro ? "AUDIENCE" : "PRO_SHOT";
  return pro && !audience ? "PRO_SHOT" : "UNKNOWN";
}

// ---------- 3. The verdict for one fan upload ----------

/** Claude's answer for one fan upload (src/lib/collector/haiku.ts, kind "bootleg"). */
export interface BootlegAnswer {
  isConcert: boolean;
  notConcertReason: string;
  complete: boolean;
  shotType: ShotType;
  shotEvidence: string;
  mainArtist: string;
  venue: string;
  city: string;
  country: string;
  venueKind: string;
  performed: string;
  confidence: number;
}

export type BootlegVerdict =
  | "PRO_SHOT_COMPLETE"
  | "NOT_A_CONCERT"
  | "OTHER_ARTIST"
  | "EXCLUDED"
  | "HOME_OR_ONLINE"
  | "AUDIO_ONLY"
  | "AUDIENCE"
  | "PARTIAL"
  | "UNKNOWN_SHOT"
  | "NO_DATE"
  | "UNCERTAIN";

/**
 * Owner rules, in this order: one band's concert -> a band of the list (not excluded) -> not a home or online
 * session -> filmed professionally (not audio only, not audience) -> the whole show -> a known year -> sure.
 */
export function bootlegVerdict(
  answer: BootlegAnswer,
  title: string,
  ctx: { onList: boolean; excluded: boolean; minConfidence: number },
): { verdict: BootlegVerdict; shotType: ShotType; reason: string } {
  const shotType = decideShotType(answer.shotType, title);
  const out = (verdict: BootlegVerdict, reason: string) => ({ verdict, shotType, reason });
  if (!answer.isConcert) return out("NOT_A_CONCERT", answer.notConcertReason || "not one band's concert");
  if (!ctx.onList) return out("OTHER_ARTIST", `main artist "${answer.mainArtist}" is not on the list`);
  if (ctx.excluded) return out("EXCLUDED", "band on the owner's exclude list");
  if (isHomeOrOnlineSession(answer)) return out("HOME_OR_ONLINE", "home or online session, not a show");
  if (shotType === "AUDIO_ONLY") return out("AUDIO_ONLY", "sound only");
  if (shotType === "AUDIENCE") return out("AUDIENCE", answer.shotEvidence || "filmed from the crowd");
  if (!answer.complete) return out("PARTIAL", "not the whole show");
  if (shotType === "UNKNOWN") return out("UNKNOWN_SHOT", "not clear it was filmed professionally");
  if (readPerformed(answer.performed).performedYear === null) return out("NO_DATE", "the year it was played is unknown");
  if (answer.confidence < ctx.minConfidence) return out("UNCERTAIN", `low confidence (${answer.confidence})`);
  return out("PRO_SHOT_COMPLETE", answer.shotEvidence || "pro-shot, complete");
}

// ---------- 4. One video per concert ----------

export interface BootlegItem {
  youtubeId: string;
  /** The band of the list (data/artist-rules.json) the video belongs to. */
  artist: string;
  title: string;
  channelId: string;
  channelTitle: string;
  durationSeconds: number;
  viewCount: number;
  publishedAt: Date;
  shotType: ShotType;
  complete: boolean;
  venue: string;
  city: string;
  performed: string;
}

/** What makes two videos the same concert: band, year (and day when known), venue or city. */
export interface ConcertKey {
  artist: string;
  year: number | null;
  day: string | null;
  venue: string;
  city: string;
}

export function concertKey(x: { artist: string; venue?: string | null; city?: string | null; performed?: string | null }): ConcertKey {
  const { performedYear, performedOn } = readPerformed(x.performed);
  return {
    artist: slugify(x.artist),
    year: performedYear,
    day: performedOn ? performedOn.toISOString().slice(0, 10) : null,
    venue: normalVenue(x.venue ?? ""),
    city: slugify(x.city ?? ""),
  };
}

/** "Rock in Rio 1985", "the Rock in Rio Festival" -> "rock-in-rio": no years, no "the", no "festival". */
export function normalVenue(name: string): string {
  return slugify(name)
    .split("-")
    .filter((w) => w && !/^(19|20)\d\d$/.test(w) && !["the", "festival", "fest", "live", "at", "in"].includes(w))
    .join("-");
}

const looselySame = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)));

/**
 * Same concert: same band, same year, the same day when both give one, and the same venue (loosely: "Wembley"
 * and "Wembley Stadium"), else the same city; with no place on one side, only a shared exact day counts.
 * Never the same without a year: two undated 1980s shows cannot be told apart.
 */
export function sameConcert(a: ConcertKey, b: ConcertKey): boolean {
  if (!a.artist || a.artist !== b.artist) return false;
  if (a.year === null || a.year !== b.year) return false;
  if (a.day && b.day && a.day !== b.day) return false;
  if (a.venue && b.venue) return looselySame(a.venue, b.venue);
  if (a.city && b.city) return a.city === b.city;
  return Boolean(a.day && b.day);
}

/** Better first: pro-shot, then complete, then the longest, then the most watched. */
export function compareBootlegs(a: BootlegItem, b: BootlegItem): number {
  const pro = (x: BootlegItem) => (x.shotType === "PRO_SHOT" ? 0 : 1);
  return (
    pro(a) - pro(b) ||
    Number(b.complete) - Number(a.complete) ||
    b.durationSeconds - a.durationSeconds ||
    b.viewCount - a.viewCount ||
    a.youtubeId.localeCompare(b.youtubeId)
  );
}

/** Videos grouped by concert (the "same concert" link is followed through: A~B and B~C put A, B, C together). */
export function groupByConcert<T extends BootlegItem>(items: T[]): T[][] {
  const keys = items.map((i) => concertKey(i));
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (keys[i].artist === keys[j].artist && sameConcert(keys[i], keys[j])) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, T[]>();
  items.forEach((item, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), item]));
  return [...groups.values()].map((g) => [...g].sort(compareBootlegs));
}

/** One video per concert: the best of each group, and the others it replaces. */
export function pickBestPerConcert<T extends BootlegItem>(items: T[]): { best: T; collapsed: T[] }[] {
  return groupByConcert(items).map(([best, ...collapsed]) => ({ best, collapsed }));
}

// ---------- 5. An official version always wins ----------

/** A concert already in the concerts table, as the dry run reads it. */
export interface ExistingConcert {
  youtubeId: string;
  slug: string;
  artists: string[];
  venue: string | null;
  city: string | null;
  performedYear: number | null;
  performedOn: Date | null;
  durationSeconds: number;
  publishedAt: Date;
  channelId: string;
  isOfficial: boolean;
}

/**
 * The listed concert a fan upload duplicates, or null. Same concert by its identity (band, year, venue or city),
 * or by the collector's own duplicate rule (isSameConcert: the same recording posted again), as long as the
 * years do not disagree. resolveDuplicate keeps the listed one: an official upload is never replaced by a fan one.
 */
export function listedVersionOf(item: BootlegItem, concerts: ExistingConcert[]): ExistingConcert | null {
  const key = concertKey(item);
  const me: ConcertIdentity = {
    youtubeId: item.youtubeId,
    artistSlugs: [key.artist],
    venueName: item.venue || null,
    publishedAt: item.publishedAt,
    durationSeconds: item.durationSeconds,
    isOfficial: false,
    channelId: item.channelId,
  };
  for (const c of concerts) {
    const slugs = c.artists.map(slugify);
    if (!slugs.includes(key.artist)) continue;
    const theirs: ConcertKey = {
      artist: key.artist,
      year: c.performedYear,
      day: c.performedOn ? c.performedOn.toISOString().slice(0, 10) : null,
      venue: normalVenue(c.venue ?? ""),
      city: slugify(c.city ?? ""),
    };
    const yearsDisagree = key.year !== null && c.performedYear !== null && key.year !== c.performedYear;
    const identity: ConcertIdentity = {
      youtubeId: c.youtubeId,
      artistSlugs: slugs,
      venueName: c.venue,
      publishedAt: c.publishedAt,
      durationSeconds: c.durationSeconds,
      isOfficial: c.isOfficial,
      channelId: c.channelId,
    };
    const same = sameConcert(key, theirs) || (!yearsDisagree && isSameConcert(identity, me));
    if (same && resolveDuplicate(identity, me) === "keep-existing") return c;
  }
  return null;
}
