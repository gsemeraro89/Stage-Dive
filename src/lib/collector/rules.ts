// The collector's rules, as pure functions so they can be tested without YouTube, Claude or a database.
// CLAUDE.md: "Write tests for the ingestion rules (filters, de-duplication, refresh) — they are the core of the product."

import { GENRES, SITE_GENRES } from "../catalogue";
import { slugify } from "../slug";

// ---------- Settings that control the rules ----------

export interface CollectorConfig {
  /** Minimum length of a set, in seconds. Product rule: a full set is normally at least 40 minutes. */
  minDurationSeconds: number;
  /** Minimum YouTube views to enter the catalogue. Owner decision, 12 Nov 2026: 10,000,000 to start. */
  viewThreshold: number;
  /** Classifier confidence needed for its answer to count as a "yes". */
  minConfidence: number;
}

export const DEFAULT_CONFIG: CollectorConfig = {
  minDurationSeconds: 40 * 60,
  viewThreshold: 10_000_000,
  minConfidence: 0.75,
};

export function configFromEnv(env: Record<string, string | undefined> = process.env): CollectorConfig {
  const num = (value: string | undefined, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    minDurationSeconds: num(env.MIN_DURATION_SECONDS, DEFAULT_CONFIG.minDurationSeconds),
    viewThreshold: num(env.VIEW_THRESHOLD, DEFAULT_CONFIG.viewThreshold),
    minConfidence: num(env.MIN_CONFIDENCE, DEFAULT_CONFIG.minConfidence),
  };
}

// ---------- 1. Rules on YouTube's own data (free, no classifier) ----------

/** "PT2H3M36S" -> 7416. Returns 0 for anything it cannot read. */
export function parseIsoDuration(iso: string | undefined | null): number {
  const match = iso?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return 0;
  const [, d, h, m, s] = match.map((v) => Number(v ?? 0));
  return d * 86400 + h * 3600 + m * 60 + s;
}

/** The fields of a YouTube video the rules look at (from videos.list). */
export interface VideoFacts {
  youtubeId: string;
  title: string;
  durationSeconds: number;
  viewCount: number;
  embeddable: boolean;
  privacyStatus: string;
  madeForKids: boolean;
  /** "none" for a normal video; "live" or "upcoming" for a broadcast that is not over. */
  liveBroadcastContent: string;
  uploadStatus: string;
}

export type RuleFailure =
  | "too-short"
  | "below-view-threshold"
  | "not-embeddable"
  | "not-public"
  | "made-for-kids"
  | "live-or-upcoming"
  | "not-processed"
  | "not-a-set-title";

/**
 * Titles that say the video is not a set, so it is left out without asking the classifier.
 * Kept narrow on purpose: words a set title practically never contains.
 */
const NOT_A_SET_TITLE = /\b(official )?(trailer|teaser|after ?movie|aftermovie|interview|documentary|recap|behind the scenes)\b/i;

export function titleSaysNotASet(title: string): boolean {
  return NOT_A_SET_TITLE.test(title);
}

/**
 * YouTube rules (CLAUDE.md 1) and product rules that need no classifier.
 * Returns the reasons a video is left out; an empty list means it may go on to classification.
 */
export function checkRules(video: VideoFacts, config: CollectorConfig): RuleFailure[] {
  const failures: RuleFailure[] = [];
  if (!video.embeddable) failures.push("not-embeddable");
  if (video.privacyStatus !== "public") failures.push("not-public");
  if (video.madeForKids) failures.push("made-for-kids");
  if (video.liveBroadcastContent !== "none") failures.push("live-or-upcoming");
  if (video.uploadStatus !== "processed") failures.push("not-processed");
  if (video.durationSeconds < config.minDurationSeconds) failures.push("too-short");
  if (video.viewCount < config.viewThreshold) failures.push("below-view-threshold");
  if (titleSaysNotASet(video.title)) failures.push("not-a-set-title");
  return failures;
}

/** Failures that can go away later (more views, a lower threshold, a live stream that ended...). */
const CAN_CHANGE: RuleFailure[] = ["below-view-threshold", "not-embeddable", "not-public", "live-or-upcoming", "not-processed"];

/**
 * Whether a video that failed the rules is worth remembering for a cheap later look (long_videos):
 * long enough to be a set (length never changes), not a trailer or the like, and kept out only by
 * things that can change. Made-for-kids videos are never sets.
 */
export function worthRemembering(failures: RuleFailure[]): boolean {
  return failures.length > 0 && failures.every((f) => CAN_CHANGE.includes(f));
}

// ---------- 2. Genre words in the video's own text ----------

/** Extra spellings people use for our genres. Matched as whole words, case-insensitive. */
const GENRE_SPELLINGS: Record<(typeof GENRES)[number], string[]> = {
  "Techno": ["techno"],
  "Melodic Techno": ["melodic techno"],
  "Melodic House": ["melodic house"],
  "Progressive House": ["progressive house", "prog house"],
  "Progressive": ["progressive"],
  "Deep House": ["deep house", "deephouse"],
  "Tech House": ["tech house", "tech-house", "techhouse"],
  "Afro House": ["afro house", "afrohouse", "afro-house"],
  "Electronica": ["electronica"],
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const GENRE_PATTERNS = Object.entries(GENRE_SPELLINGS).map(([genre, spellings]) => ({
  genre,
  pattern: new RegExp(`(^|[^a-z0-9])(${spellings.map(escapeRegExp).join("|")})($|[^a-z0-9])`, "i"),
}));

/** Genres off our list that contain one of ours as a word ("hard techno" is not Techno). */
const NOT_OURS = /(^|[^a-z0-9])(hard ?techno|industrial techno|acid techno)($|[^a-z0-9])/gi;

/** Our genres named in a video's title, description or tags (hashtags included). */
export function genresInText(...texts: (string | string[] | null | undefined)[]): string[] {
  const text = texts
    .flat()
    .filter(Boolean)
    .join(" \n ")
    .replace(/#/g, " ")
    .replace(NOT_OURS, " ");
  return GENRE_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ genre }) => genre);
}

// ---------- 3. Is an artist electronic, according to MusicBrainz genres? ----------

const ELECTRONIC_WORDS = [
  "electronic", "techno", "house", "trance", "electronica", "edm", "dance", "drum and bass", "jungle",
  "dubstep", "ambient", "electro", "breakbeat", "breaks", "garage", "hardstyle", "idm", "downtempo",
  "minimal", "disco", "psytrance", "psychedelic trance", "goa", "synth", "club", "bass music", "acid",
];

export function isElectronicGenreList(genres: string[]): boolean {
  return genres.some((g) => {
    const name = g.toLowerCase();
    return ELECTRONIC_WORDS.some((word) => name === word || name.includes(word));
  });
}

// ---------- 4. The decision ----------

export type ChannelKindName = "ELECTRONIC_ONLY" | "ARTIST" | "MIXED" | "UNKNOWN";

/** What the classifier said about a video (see classify.ts). */
export interface Classification {
  isFullSet: boolean;
  isElectronic: boolean;
  confidence: number;
  genres: string[];
  mainArtists: string[];
}

export interface DecisionInput {
  channelKind: ChannelKindName;
  /** The main artist is on the owner's list (data/artist-rules.json): accepted whenever it is a full set. */
  ownerApproved?: boolean;
  classification: Classification;
  /** Genres found in the video's own title, description and tags. */
  textGenres: string[];
  /** MusicBrainz genres of the main artist, or null when the artist was not found. */
  artistGenres: string[] | null;
}

export type Verdict = "ACCEPTED" | "NOT_A_SET" | "NOT_ELECTRONIC" | "UNCERTAIN";

export interface Decision {
  verdict: Verdict;
  reason: string;
  /** Independent signals that said "electronic", for the admin page and the accuracy report. */
  signals: string[];
}

/**
 * Owner rule (12 Nov 2026): nothing enters without being sure it is electronic music in our genres.
 * In doubt, the video stays out. There is no manual approval step.
 *
 * - Channels that only post electronic music (and official artist channels): the classifier must say
 *   "full set, electronic" with high confidence and give at least one of our genres.
 * - Mixed channels and unknown channels (fan uploads): in addition, at least two independent signals
 *   must agree: the classifier, MusicBrainz genres for the artist, genre words in the video's own text.
 */
export function decide(input: DecisionInput, config: CollectorConfig): Decision {
  const c = input.classification;
  const confident = c.confidence >= config.minConfidence;
  const signals: string[] = [];
  if (c.isElectronic && confident) signals.push("classifier");
  if (input.artistGenres && isElectronicGenreList(input.artistGenres)) signals.push("musicbrainz");
  if (input.textGenres.length > 0) signals.push("video text");

  if (!c.isFullSet) {
    return { verdict: confident ? "NOT_A_SET" : "UNCERTAIN", reason: "not a single full set", signals };
  }
  if (c.mainArtists.length === 0) {
    return { verdict: "UNCERTAIN", reason: "artist not identified", signals };
  }
  if (input.ownerApproved) {
    if (c.genres.length === 0) return { verdict: "UNCERTAIN", reason: "artist approved by owner, but no genre", signals };
    return { verdict: "ACCEPTED", reason: "artist approved by owner", signals: [...signals, "owner"] };
  }
  if (!c.isElectronic) {
    return {
      verdict: confident ? "NOT_ELECTRONIC" : "UNCERTAIN",
      reason: "classifier: not electronic music in our genres",
      signals,
    };
  }
  if (!confident) return { verdict: "UNCERTAIN", reason: `low confidence (${c.confidence})`, signals };
  if (c.genres.length === 0) return { verdict: "UNCERTAIN", reason: "none of our genres fits", signals };

  const trusted = input.channelKind === "ELECTRONIC_ONLY" || input.channelKind === "ARTIST";
  const needed = trusted ? 1 : 2;
  if (signals.length < needed) {
    return {
      verdict: "UNCERTAIN",
      reason: `needs ${needed} independent signals, has ${signals.length} (${signals.join(", ") || "none"})`,
      signals,
    };
  }
  return { verdict: "ACCEPTED", reason: `confirmed by ${signals.join(" + ")}`, signals };
}

// ---------- 5. De-duplication ----------

export interface SetIdentity {
  youtubeId: string;
  /** Slugs of the main artists. */
  artistSlugs: string[];
  venueName: string | null;
  publishedAt: Date;
  durationSeconds: number;
  isOfficial: boolean;
  /** YouTube channel that uploaded it: festivals post a new show by the same artist every year. */
  channelId: string;
}

/** Venue names written differently ("Cercle — Tour Saint-Jacques" / "Tour Saint-Jacques") still match. */
function sameVenue(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = slugify(a);
  const y = slugify(b);
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Two uploads are the same set when they share a main artist and either
 * (a) were recorded at the same venue and were uploaded by another channel within a year (a fan
 *     re-upload), or by the same channel within 60 days with the same line-up and the same length
 *     (within 30 seconds: the same recording posted again), or
 * (b) were uploaded by another channel with the same length (within 90 seconds) within two years,
 *     unless both name a venue and the venues differ.
 * Not the same: the same channel a year later (Tomorrowland 2024 / 2025), weekend 1 and weekend 2 of
 * a festival (different tracks, owner 16 Nov 2026), a solo set and a b2b at the same festival, or two
 * shows that happen to share a common slot length (2 hours) elsewhere.
 */
export function isSameSet(a: SetIdentity, b: SetIdentity): boolean {
  if (a.youtubeId === b.youtubeId) return true;
  if (!a.artistSlugs.some((s) => b.artistSlugs.includes(s))) return false;
  const days = Math.abs(a.publishedAt.getTime() - b.publishedAt.getTime()) / 86_400_000;
  const otherChannel = a.channelId !== b.channelId;
  const sameLineUp = a.artistSlugs.length === b.artistSlugs.length && a.artistSlugs.every((s) => b.artistSlugs.includes(s));
  if (sameVenue(a.venueName, b.venueName)) {
    const sameRecording = sameLineUp && days <= 60 && Math.abs(a.durationSeconds - b.durationSeconds) <= 30;
    if (otherChannel ? days <= 366 : sameRecording) return true;
  }
  const venuesDiffer = Boolean(a.venueName && b.venueName) && !sameVenue(a.venueName, b.venueName);
  return otherChannel && !venuesDiffer && Math.abs(a.durationSeconds - b.durationSeconds) <= 90 && days <= 731;
}

export type DuplicateAction = "keep-existing" | "replace-existing";

/** Product rule: keep the official upload. Between two of the same kind, keep the one already listed. */
export function resolveDuplicate(existing: SetIdentity, candidate: SetIdentity): DuplicateAction {
  return candidate.isOfficial && !existing.isOfficial ? "replace-existing" : "keep-existing";
}

// ---------- 6. Refresh (YouTube rule 4: refresh or delete stored data at least every 30 days) ----------

export type RefreshAction = "update" | "delete";

/** What to do with a stored set after asking YouTube about it again. `null` = YouTube no longer has it. */
export function refreshAction(
  video: Pick<VideoFacts, "embeddable" | "privacyStatus"> | null,
): { action: RefreshAction; reason: string } {
  if (!video) return { action: "delete", reason: "deleted from YouTube" };
  if (video.privacyStatus !== "public") return { action: "delete", reason: `now ${video.privacyStatus}` };
  if (!video.embeddable) return { action: "delete", reason: "embedding switched off" };
  return { action: "update", reason: "still public and embeddable" };
}

/** Sets due for a refresh: last refreshed more than `days` ago (kept below 30 for a safety margin). */
export function isDueForRefresh(lastRefreshed: Date, now: Date, days = 25): boolean {
  return now.getTime() - lastRefreshed.getTime() >= days * 86_400_000;
}

// ---------- 7. Artists the owner has confirmed (data/artist-rules.json) ----------

export interface ArtistRule {
  name: string;
  aka?: string[];
  genres: string[];
  /**
   * Owner rule (17 Nov 2026): every official full set of this artist is looked for by the per-artist
   * lane (scripts/artist-lane.ts), with no view threshold.
   */
  allSets?: boolean;
  /** Owner override: the artist's MusicBrainz ID, for names MusicBrainz cannot tell apart (ANNA, Quest). */
  mbid?: string;
  /** Owner override: the artist's official YouTube channel ID (UC...). Wins over MusicBrainz. */
  youtubeChannelId?: string;
}

export interface ArtistGroup {
  name: string;
  members: string[];
}

/** A group name that is not an artist ("3 Are Legend") becomes its members, in order, without repeats. */
export function expandGroups(artists: string[], groups: ArtistGroup[]): string[] {
  const out: string[] = [];
  for (const a of artists) {
    const g = groups.find((x) => slugify(x.name) === slugify(a));
    for (const name of g ? g.members : [a]) if (!out.some((o) => slugify(o) === slugify(name))) out.push(name);
  }
  return out;
}

/** Find the owner's rule for any of a set's main artists. Names are compared as slugs. */
export function findArtistRule(mainArtists: string[], rules: ArtistRule[]): ArtistRule | null {
  const wanted = new Set(mainArtists.map(slugify).filter(Boolean));
  return rules.find((r) => [r.name, ...(r.aka ?? [])].some((n) => wanted.has(slugify(n)))) ?? null;
}

/**
 * Genres for a set by an owner-approved artist: the classifier's genres when it gave some of ours,
 * otherwise the genres the owner listed for that artist (only those on our list).
 */
export function genresForApprovedArtist(classifierGenres: string[], rule: ArtistRule): string[] {
  const ours = new Set<string>(GENRES);
  // The owner's genres win when they include an artist-only genre (e.g. Big Room / EDM): the
  // classifier cannot give those and would otherwise stretch one of ours.
  const site = new Set<string>(SITE_GENRES);
  const owner = rule.genres.filter((g) => site.has(g));
  if (owner.some((g) => !ours.has(g))) return owner;
  const fromClassifier = classifierGenres.filter((g) => ours.has(g));
  return fromClassifier.length ? fromClassifier : owner;
}

/** Compare channel names loosely: "Hï Ibiza" ~ "hi ibiza", "Be-At.TV" ~ "beat tv". */
export function looseName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function channelMatches(title: string, expect: string): boolean {
  return looseName(title).includes(looseName(expect));
}

/**
 * Owner rule (13 Nov 2026): once an artist is in the catalogue, all their other full sets that pass
 * the view threshold come in too. Genres for such a set: the classifier's (ours only), else the
 * genres the artist's sets already have on the site.
 */
export function genresWithFallback(classifierGenres: string[], fallback: string[]): string[] {
  const ours = new Set<string>(GENRES);
  const fromClassifier = classifierGenres.filter((g) => ours.has(g));
  const site = new Set<string>(SITE_GENRES);
  return fromClassifier.length ? fromClassifier : fallback.filter((g) => site.has(g)).slice(0, 3);
}
