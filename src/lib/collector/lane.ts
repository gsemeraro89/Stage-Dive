// The per-artist lane (owner, 17 Nov 2026): find every official full concert of a named list of artists
// (data/artist-rules.json, "allConcerts": true), with no view threshold, as cheaply as possible.
// Pure functions only, so the free filters, the budget and the search order can be tested.
//
// Free filters, in this order (owner): already a concert or decided -> skip; YouTube/product rules (40
// minutes, public, embeddable, not for kids, processed, not live, not blocked in a key country) -> drop; the artist's name not in
// the title -> drop; excluded words in the title -> drop; not an official channel -> report only.
// Only what is left is sent to Claude.

import type { ArtistRule, ChannelKindName, Decision } from "./rules";
import { titleSaysNotAConcert } from "./rules";

// ---------- 1. Is the artist's name in the title? ----------

/** Letters NFKD does not take apart (ø, æ, ß...), written the way people type them without the key. */
const SPECIAL_LETTERS: Record<string, string> = {
  ø: "o", æ: "ae", œ: "oe", ß: "ss", đ: "d", ð: "d", ł: "l", þ: "th", ı: "i", λ: "a",
};

/**
 * Text as a row of plain words: no accents, no case, no punctuation; "&" becomes "and".
 * "Rødhåd b2b Kölsch" -> "rodhad b2b kolsch"; "W&W" -> "w and w".
 */
export function matchText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[øæœßđðłþıλ]/g, (c) => SPECIAL_LETTERS[c] ?? c)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** All the ways an artist may be written: the name and every "aka". */
export function artistNames(rule: Pick<ArtistRule, "name" | "aka">): string[] {
  return [rule.name, ...(rule.aka ?? [])];
}

/**
 * Whether one of the names is in the title as whole words ("Kölsch" in "KOLSCH live at...", but
 * "Anna" not in "Annabel"). A name of several words also counts written as one ("Pan-Pot" in
 * "#panpot"), and "and" may be missing or spelled out ("W&W" in "W & W" and "W and W").
 */
export function titleHasArtist(title: string, names: string[]): boolean {
  const words = ` ${matchText(title)} `;
  const joined = new Set(words.trim().split(" "));
  return names.some((name) => {
    const n = matchText(name);
    if (!n) return false;
    if (words.includes(` ${n} `)) return true;
    const compact = n.replace(/ /g, "");
    if (compact.length >= 4 && joined.has(compact)) return true;
    const noAnd = n.replace(/ and /g, " ");
    return noAnd !== n && words.includes(` ${noAnd} `);
  });
}

/** The lane artists named in a title, in list order. */
export function artistsInTitle<T extends Pick<ArtistRule, "name" | "aka">>(title: string, rules: T[]): T[] {
  return rules.filter((r) => titleHasArtist(title, artistNames(r)));
}

// ---------- 2. Words that say "not a concert" ----------

/**
 * Extra words for the lane, on top of titleSaysNotAConcert (trailer, teaser, aftermovie, interview,
 * documentary, recap, behind the scenes, reaction, cover, tutorial, lyrics, full album; brief section 2).
 * With no view threshold many more videos come in, so these are dropped before Claude is asked.
 * "album" alone stays allowed: rock shows are often billed by album ("plays the Black Album live").
 */
const LANE_EXCLUDED: { word: string; pattern: RegExp }[] = [
  { word: "podcast", pattern: /\bpodcasts?\b/i },
  { word: "compilation", pattern: /\bcompilations?\b/i },
  { word: "best of", pattern: /\bbest of\b/i },
  { word: "greatest hits", pattern: /\bgreatest hits\b/i },
];

const NOT_A_CONCERT_WORD =
  /\b(trailer|teaser|after ?movie|interview|documentary|recap|behind the scenes|reaction|reacts?|cover|tutorial|lesson|lyrics?|full album)\b/i;

/** The excluded word a title contains, or null. */
export function excludedTitleWord(title: string): string | null {
  if (titleSaysNotAConcert(title)) {
    const m = title.match(NOT_A_CONCERT_WORD);
    return (m?.[1] ?? "trailer").toLowerCase();
  }
  return LANE_EXCLUDED.find((x) => x.pattern.test(title))?.word ?? null;
}

/**
 * On the band's own channel a title may skip the name ("Live at The Metro, Chicago 1983"), but it must
 * then say what the video is: a concert, a show, a place or a year. A bare title is a promo or a
 * chat stream, not a concert.
 */
const CONCERT_HINT =
  /\b(concert|concerts|gig|live|show|tour|festival|fest|stage|session|sessions|stream|livestream|unplugged|full|set|arena|stadium|hall|theatre|theater|club|19\d\d|20\d\d)\b|@|\bat\b/i;
export function titleSaysWhatItIs(title: string): boolean {
  return CONCERT_HINT.test(title);
}

// ---------- 3. Official channels ----------

/** "other-channel": any channel, allowed only for an artist whose own channel is missing or unreadable. */
export type OfficialReason = "channel-list" | "artist-channel" | "approved-channel" | "other-channel";

export interface OfficialChannels {
  /** Channels of data/channels.json (the channels table), with their kind. */
  listed: Map<string, ChannelKindName>;
  /** Each lane artist's own official channel (MusicBrainz link or owner override). */
  artistChannels: Map<string, string>;
  /** Other channels already marked official in our channels table (e.g. a channel of an earlier concert). */
  approved: Map<string, ChannelKindName>;
}

/**
 * Owner rule (17 Nov 2026): only official concerts are published. A video is official when it is on a
 * channel of our list, on a lane artist's own channel, or on a channel already approved as official.
 * Anything else (fan uploads) is not sent to Claude and only goes in the report.
 */
export function officialChannel(channelId: string, ch: OfficialChannels): { reason: OfficialReason; kind: ChannelKindName } | null {
  const listed = ch.listed.get(channelId);
  if (listed) return { reason: "channel-list", kind: listed };
  if (ch.artistChannels.has(channelId)) return { reason: "artist-channel", kind: "ARTIST" };
  const approved = ch.approved.get(channelId);
  if (approved) return { reason: "approved-channel", kind: approved === "UNKNOWN" ? "MIXED" : approved };
  return null;
}

// ---------- 4. The free filters, together ----------

export type LaneDrop =
  | "already-a-concert"
  | "already-decided"
  | "rule:too-short"
  | "rule:not-embeddable"
  | "rule:not-public"
  | "rule:made-for-kids"
  | "rule:live-or-upcoming"
  | "rule:not-processed"
  | "rule:region-blocked"
  | "name-not-in-title"
  | "own-channel-title-not-a-concert"
  | `excluded-word:${string}`;

export type LaneFilterResult =
  | { outcome: "drop"; reason: LaneDrop }
  | { outcome: "report-only" }
  | { outcome: "classify"; official: { reason: OfficialReason; kind: ChannelKindName } };

export interface LaneVideoFacts {
  youtubeId: string;
  title: string;
  channelId: string;
  durationSeconds: number;
  embeddable: boolean;
  privacyStatus: string;
  madeForKids: boolean;
  liveBroadcastContent: string;
  uploadStatus: string;
  /** Key countries where the video is blocked (rules.ts KEY_REGIONS). */
  blockedIn: string[];
}

/**
 * The free filters for one video and one artist, in the owner's order. `onOwnChannel`: the video is
 * on this artist's official channel, which names the artist even when the title does not ("Live at
 * Awakenings 2024" on Charlotte de Witte's channel).
 */
export function laneFilter(
  video: LaneVideoFacts,
  ctx: {
    names: string[];
    isConcert: boolean;
    decided: boolean;
    channels: OfficialChannels;
    minDurationSeconds: number;
    onOwnChannel?: boolean;
    /**
     * Owner (17 Nov 2026): for an artist with no official channel found, or whose channel cannot be
     * read, videos from any channel may go to Claude (marked "via other channel" in the report).
     */
    otherChannelsOk?: boolean;
  },
): LaneFilterResult {
  if (ctx.isConcert) return { outcome: "drop", reason: "already-a-concert" };
  if (ctx.decided) return { outcome: "drop", reason: "already-decided" };
  // YouTube rules (CLAUDE.md 1) and the 40-minute rule. No view threshold in this lane.
  if (!video.embeddable) return { outcome: "drop", reason: "rule:not-embeddable" };
  if (video.privacyStatus !== "public") return { outcome: "drop", reason: "rule:not-public" };
  if (video.madeForKids) return { outcome: "drop", reason: "rule:made-for-kids" };
  if (video.liveBroadcastContent !== "none") return { outcome: "drop", reason: "rule:live-or-upcoming" };
  if (video.uploadStatus !== "processed") return { outcome: "drop", reason: "rule:not-processed" };
  if (video.blockedIn.length) return { outcome: "drop", reason: "rule:region-blocked" };
  if (video.durationSeconds < ctx.minDurationSeconds) return { outcome: "drop", reason: "rule:too-short" };
  if (!titleHasArtist(video.title, ctx.names)) {
    if (!ctx.onOwnChannel) return { outcome: "drop", reason: "name-not-in-title" };
    if (!titleSaysWhatItIs(video.title)) return { outcome: "drop", reason: "own-channel-title-not-a-concert" };
  }
  const word = excludedTitleWord(video.title);
  if (word) return { outcome: "drop", reason: `excluded-word:${word}` };
  const official = officialChannel(video.channelId, ctx.channels);
  if (!official) {
    return ctx.otherChannelsOk ? { outcome: "classify", official: { reason: "other-channel", kind: "UNKNOWN" } } : { outcome: "report-only" };
  }
  return { outcome: "classify", official };
}

// ---------- 5. Searches: who is next ----------

export interface SearchState {
  name: string;
  /** When this artist was searched (dry runs included); null = not yet. */
  searchedAt: Date | null;
}

/**
 * Artists to search in this run: only those never searched, in the order of the owner's list, up to
 * `maxSearches`. A search is never repeated: its result IDs are stored and reused by later runs.
 */
export function searchesToRun<T extends SearchState>(artists: T[], maxSearches: number): T[] {
  return artists.filter((a) => !a.searchedAt).slice(0, Math.max(0, Math.floor(maxSearches)));
}

/**
 * How many searches fit in the YouTube units left. Each search costs 100 units plus 1 unit to read
 * its 50 results with videos.list; `reserve` is kept for what comes after (setlists of new concerts).
 */
export function searchesThatFit(unitsLeft: number, reserve = 100): number {
  return Math.max(0, Math.floor((unitsLeft - reserve) / 101));
}

/** The search query: the band's name in quotes, then "full concert". */
export function searchQuery(name: string): string {
  return `"${name.replace(/"/g, "")}" full concert`;
}

// ---------- 6. Claude budget ----------

/** US dollars per million tokens. Batch API: half. Cache writes 1.25x input, cache reads 0.1x. */
export const PRICES = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-5-5": { input: 4, output: 20 },
} as const;
export type PricedModel = keyof typeof PRICES;

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Real cost of one answer, from the usage the API reported. */
export function costOf(model: PricedModel, usage: Usage, batch: boolean): number {
  const p = PRICES[model];
  const input =
    usage.input_tokens * p.input +
    (usage.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * p.input * 0.1;
  const usd = (input + usage.output_tokens * p.output) / 1_000_000;
  return batch ? usd / 2 : usd;
}

/**
 * The run's Claude budget (CLAUDE_BUDGET_USD, default $3). Real costs are added as answers come in;
 * requests still out (a batch not back yet) count with their estimate, so nothing is sent that could
 * take the run over the cap. Once the cap is reached, nothing more is sent: the rest waits.
 */
export class ClaudeBudget {
  spentUsd = 0;
  committedUsd = 0;
  /** Some request did not fit at some point (for the report). It does not block later passes. */
  stopped = false;
  constructor(readonly limitUsd: number) {}

  /**
   * Whether a request estimated at `usd` may be sent now. A request that does not fit is not sent,
   * but this is not a permanent stop: once a batch comes back and its estimate is replaced by its
   * (usually much lower) real cost, later passes may send again. Real spend at the cap stops everything.
   */
  tryCommit(usd: number): boolean {
    if (this.spentUsd + this.committedUsd + usd > this.limitUsd) {
      this.stopped = true;
      return false;
    }
    this.committedUsd += usd;
    return true;
  }

  /** A sent request came back (or failed): replace its estimate with what it really cost. */
  settle(estimateUsd: number, actualUsd: number) {
    this.committedUsd = Math.max(0, this.committedUsd - estimateUsd);
    this.spentUsd += actualUsd;
  }

  /** Cost from answers sent by an earlier run (no estimate was committed in this run). */
  addSpent(usd: number) {
    this.spentUsd += usd;
  }

  get leftUsd(): number {
    return Math.max(0, this.limitUsd - this.spentUsd - this.committedUsd);
  }
}

/** The items whose estimate fits in the budget, in order; stops at the first that does not fit. */
export function takeWithinBudget<T>(items: T[], estimateUsd: (item: T) => number, budget: ClaudeBudget): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (!budget.tryCommit(estimateUsd(item))) break;
    out.push(item);
  }
  return out;
}

/** Rough tokens of a text (about 3.5 characters per token for English and JSON). */
export const roughTokens = (text: string) => Math.ceil(text.length / 3.5);

// ---------- 7. Haiku or Haiku + Opus? ----------

export type LaneClassifierMode = "haiku" | "haiku+opus";

/** Owner (17 Nov 2026): this lane uses Haiku only unless LANE_CLASSIFIER says otherwise. */
export const DEFAULT_LANE_CLASSIFIER = "haiku";

// ---------- 7b. Which sources a pass reads ----------

export type LaneSource = "long" | "matches" | "answers" | "channel" | "search" | "handles";
const ALL_SOURCES: LaneSource[] = ["long", "matches", "answers", "channel", "search", "handles"];
/** The default: remembered long videos, artist channels, searches, and @handle lookups for artists without a channel. */
export const DEFAULT_SOURCES: LaneSource[] = ["long", "channel", "search", "handles"];

/**
 * LANE_SOURCES, e.g. "answers,matches,search": a cheap pass that reads again only the videos the lane
 * already matched or classified, instead of all ~26,800 remembered long videos. Empty: the default.
 */
export function parseSources(value: string | undefined): Set<LaneSource> {
  const wanted = (value ?? "").split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const unknown = wanted.filter((x) => !ALL_SOURCES.includes(x as LaneSource));
  if (unknown.length) throw new Error(`unknown LANE_SOURCES: ${unknown.join(", ")} (known: ${ALL_SOURCES.join(", ")})`);
  return new Set(wanted.length ? (wanted as LaneSource[]) : DEFAULT_SOURCES);
}

// ---------- 7c. Artist channels found on YouTube ----------

/** The @handle tried for an artist without a channel: the name in plain letters, no spaces ("@charlottedewitte"). */
export function handleFor(name: string): string {
  return `@${matchText(name).replace(/ /g, "")}`;
}

/** YouTube's automatic "Artist - Topic" channels hold tracks, never concerts. */
export function isTopicChannel(title: string): boolean {
  return /\s-\s*topic$/i.test(title.trim());
}

/** Least public videos for a channel found by @handle to count as the artist's real channel. */
export const MIN_HANDLE_VIDEOS = 10;

/**
 * Whether a channel found by @handle is the artist's: its title is the artist's name (or an aka),
 * ignoring case, accents, spaces and an "official"/"music" ending; not a Topic channel; and it has
 * real content (at least MIN_HANDLE_VIDEOS public videos).
 */
export function handleChannelMatches(channel: { title: string; videoCount: number }, names: string[]): boolean {
  if (isTopicChannel(channel.title) || channel.videoCount < MIN_HANDLE_VIDEOS) return false;
  const title = matchText(channel.title).replace(/ /g, "").replace(/(official|music|tv)+$/, "");
  return names.some((n) => {
    const name = matchText(n).replace(/ /g, "");
    return name.length > 0 && title === name;
  });
}

/** At least this share of accept/reject outcomes must agree with Opus for Haiku to work alone (owner). */
export const AGREEMENT_NEEDED = 0.95;

/**
 * Which classifier the lane uses. LANE_CLASSIFIER = "haiku" or "haiku+opus" decides; "auto" (default)
 * follows the last Haiku test: Haiku alone when it agreed with Opus on at least 95% of outcomes,
 * otherwise Haiku first and Opus for Haiku answers below 0.75 confidence. No test yet: Haiku + Opus.
 */
export function chooseClassifierMode(value: string | undefined, lastTestAgreement: number | null): LaneClassifierMode {
  const s = (value ?? "").trim().toLowerCase();
  if (s === "haiku" || s === "haiku+opus") return s;
  return lastTestAgreement !== null && lastTestAgreement >= AGREEMENT_NEEDED ? "haiku" : "haiku+opus";
}

// ---------- 8. Haiku vs Opus agreement ----------

export interface AgreementPair {
  youtubeId: string;
  title: string;
  opus: Decision;
  haiku: Decision;
}

export interface Agreement {
  total: number;
  agree: number;
  rate: number;
  /** Opus accepted, Haiku did not, and the other way round. */
  onlyOpusAccepted: AgreementPair[];
  onlyHaikuAccepted: AgreementPair[];
}

/**
 * Agreement on the outcome that matters: published or not. Both answers go through the same decide()
 * with the same inputs, so only the classifier differs.
 */
export function agreement(pairs: AgreementPair[]): Agreement {
  const accepted = (d: Decision) => d.verdict === "ACCEPTED";
  const onlyOpusAccepted = pairs.filter((p) => accepted(p.opus) && !accepted(p.haiku));
  const onlyHaikuAccepted = pairs.filter((p) => !accepted(p.opus) && accepted(p.haiku));
  const agree = pairs.length - onlyOpusAccepted.length - onlyHaikuAccepted.length;
  return { total: pairs.length, agree, rate: pairs.length ? agree / pairs.length : 0, onlyOpusAccepted, onlyHaikuAccepted };
}
