// The collector's rules, as pure functions so they can be tested without YouTube, Claude or a database.
// CLAUDE.md: "Write tests for the ingestion rules (filters, de-duplication, refresh) — they are the core of the product."

import { GENRES, SITE_GENRES } from "../catalogue";
import { slugify } from "../slug";

// ---------- Settings that control the rules ----------

export interface CollectorConfig {
  /** Minimum length of a concert, in seconds. Product rule: a full concert is normally at least 40 minutes. */
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

/**
 * Countries where every concert must play (owner, 18 Nov 2026): Spain, Italy, UK, US, Germany.
 * YouTube uses ISO 3166-1 codes, so the UK is "GB".
 */
export const KEY_REGIONS = ["ES", "IT", "GB", "US", "DE"] as const;

/**
 * Key countries where a video is blocked, from videos.list contentDetails.regionRestriction:
 * either a "blocked" list, or an "allowed" list that leaves a country out. No restriction: [].
 */
export function blockedRegions(
  restriction: { allowed?: string[]; blocked?: string[] } | null | undefined,
  regions: readonly string[] = KEY_REGIONS,
): string[] {
  if (!restriction) return [];
  const blocked = new Set(restriction.blocked ?? []);
  const allowed = restriction.allowed ? new Set(restriction.allowed) : null;
  return regions.filter((r) => blocked.has(r) || (allowed !== null && !allowed.has(r)));
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
  /** Key countries (KEY_REGIONS) where YouTube blocks the video. Empty: playable in all of them. */
  blockedIn: string[];
}

export type RuleFailure =
  | "too-short"
  | "below-view-threshold"
  | "not-embeddable"
  | "not-public"
  | "made-for-kids"
  | "live-or-upcoming"
  | "not-processed"
  | "region-blocked"
  | "not-a-concert-title";

/**
 * Titles that say the video is not a concert, so it is left out without asking the classifier.
 * Kept narrow on purpose: words a concert title practically never contains.
 */
const NOT_A_SET_TITLE = /\b(official )?(trailer|teaser|after ?movie|aftermovie|interview|documentary|recap|behind the scenes)\b/i;

export function titleSaysNotAConcert(title: string): boolean {
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
  if (video.blockedIn.length) failures.push("region-blocked");
  if (video.durationSeconds < config.minDurationSeconds) failures.push("too-short");
  if (video.viewCount < config.viewThreshold) failures.push("below-view-threshold");
  if (titleSaysNotAConcert(video.title)) failures.push("not-a-concert-title");
  return failures;
}

/** Failures that can go away later (more views, a lower threshold, a live stream that ended...). */
const CAN_CHANGE: RuleFailure[] = [
  "below-view-threshold",
  "not-embeddable",
  "not-public",
  "live-or-upcoming",
  "not-processed",
  "region-blocked",
];

/**
 * Whether a video that failed the rules is worth remembering for a cheap later look (long_videos):
 * long enough to be a concert (length never changes), not a trailer or the like, and kept out only by
 * things that can change. Made-for-kids videos are never concerts.
 */
export function worthRemembering(failures: RuleFailure[]): boolean {
  return failures.length > 0 && failures.every((f) => CAN_CHANGE.includes(f));
}

// ---------- 2. Genre words in the video's own text ----------

/** Extra spellings people use for our genres. Matched as whole words, case-insensitive. */
const GENRE_SPELLINGS: Record<(typeof GENRES)[number], string[]> = {
  "classic rock": ["classic rock"],
  "hard rock": ["hard rock"],
  "punk": ["punk", "punk rock", "hardcore punk"],
  "post-punk": ["post-punk", "post punk", "postpunk"],
  "new wave / synth": ["new wave", "synth-pop", "synthpop", "synth pop", "darkwave"],
  "indie": ["indie", "indie rock"],
  "alternative": ["alternative rock", "alt-rock", "alt rock"],
  "grunge": ["grunge"],
  "metal": ["metal", "heavy metal", "thrash metal", "nu metal", "nu-metal"],
  "garage": ["garage rock", "garage punk"],
  "shoegaze": ["shoegaze", "dream pop"],
  "stoner": ["stoner rock", "stoner metal", "desert rock"],
  "emo / post-hardcore": ["emo", "post-hardcore", "post hardcore", "screamo"],
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const wordPattern = (spellings: string[], flags = "i") =>
  new RegExp(`(^|[^a-z0-9])(${spellings.map(escapeRegExp).join("|")})($|[^a-z0-9])`, flags);

const GENRE_PATTERNS = Object.entries(GENRE_SPELLINGS).map(([genre, spellings]) => ({
  genre,
  pattern: wordPattern(spellings),
}));

/**
 * Phrases that contain one of our genre words but mean something else, blanked out before matching:
 * "post-punk" is not punk (it is matched on its own first), "pop punk" is not on our list,
 * "Hard Rock Cafe" is a venue.
 */
const NOT_OURS = wordPattern(
  ["post-punk", "post punk", "postpunk", "pop punk", "pop-punk", "hard rock cafe", "hard rock hotel"],
  "gi",
);

/** Our genres named in a video's title, description or tags (hashtags included), in list order. */
export function genresInText(...texts: (string | string[] | null | undefined)[]): string[] {
  const text = texts.flat().filter(Boolean).join(" \n ").replace(/#/g, " ");
  const found = new Set<string>();
  if (GENRE_PATTERNS.find((g) => g.genre === "post-punk")!.pattern.test(text)) found.add("post-punk");
  const rest = text.replace(NOT_OURS, " ");
  for (const { genre, pattern } of GENRE_PATTERNS) {
    if (genre !== "post-punk" && pattern.test(rest)) found.add(genre);
  }
  return GENRES.filter((g) => found.has(g));
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
  isFullConcert: boolean;
  isElectronic: boolean;
  confidence: number;
  genres: string[];
  mainArtists: string[];
}

export interface DecisionInput {
  channelKind: ChannelKindName;
  /** The main artist is on the owner's list (data/artist-rules.json): accepted whenever it is a full concert. */
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
 *   "full concert, electronic" with high confidence and give at least one of our genres.
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

  if (!c.isFullConcert) {
    return { verdict: confident ? "NOT_A_SET" : "UNCERTAIN", reason: "not a single full concert", signals };
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

export interface ConcertIdentity {
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
 * Two uploads are the same concert when they share a main artist and either
 * (a) were recorded at the same venue and were uploaded by another channel within a year (a fan
 *     re-upload), or by the same channel within 60 days with the same line-up and the same length
 *     (within 30 seconds: the same recording posted again), or
 * (b) were uploaded by another channel with the same length (within 90 seconds) within two years,
 *     unless both name a venue and the venues differ.
 * Not the same: the same channel a year later (Tomorrowland 2024 / 2025), weekend 1 and weekend 2 of
 * a festival (different tracks, owner 16 Nov 2026), a solo concert and a b2b at the same festival, or two
 * shows that happen to share a common slot length (2 hours) elsewhere.
 */
export function isSameConcert(a: ConcertIdentity, b: ConcertIdentity): boolean {
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
export function resolveDuplicate(existing: ConcertIdentity, candidate: ConcertIdentity): DuplicateAction {
  return candidate.isOfficial && !existing.isOfficial ? "replace-existing" : "keep-existing";
}

// ---------- 6. Refresh (YouTube rule 4: refresh or delete stored data at least every 30 days) ----------

/**
 * "remove": the video is gone, private, not embeddable or blocked in a key country. That is normal
 * (takedowns, livestreams kept "for a time"; docs/SUPPLY-CHECK.md): the concert is hidden with status
 * REMOVED, its YouTube data is cleared, and it comes back by itself if the video does.
 */
export type RefreshAction = "update" | "remove";

/** What to do with a stored concert after asking YouTube about it again. `null` = YouTube no longer has it. */
export function refreshAction(
  video: Pick<VideoFacts, "embeddable" | "privacyStatus" | "blockedIn"> | null,
): { action: RefreshAction; reason: string } {
  if (!video) return { action: "remove", reason: "deleted from YouTube" };
  if (video.privacyStatus !== "public") return { action: "remove", reason: `now ${video.privacyStatus}` };
  if (!video.embeddable) return { action: "remove", reason: "embedding switched off" };
  if (video.blockedIn.length) return { action: "remove", reason: `blocked in ${video.blockedIn.join(", ")}` };
  return { action: "update", reason: "still public and embeddable" };
}

/**
 * The concert's status after a refresh. A removed video that is back is shown again; a concert the
 * owner hid stays hidden either way.
 */
export function statusAfterRefresh(current: ConcertStatusName, action: RefreshAction): ConcertStatusName {
  if (current === "HIDDEN") return "HIDDEN";
  return action === "remove" ? "REMOVED" : "PUBLISHED";
}

export type ConcertStatusName = "PUBLISHED" | "HIDDEN" | "REMOVED";

/** Concerts due for a refresh: last refreshed more than `days` ago (kept below 30 for a safety margin). */
export function isDueForRefresh(lastRefreshed: Date, now: Date, days = 25): boolean {
  return now.getTime() - lastRefreshed.getTime() >= days * 86_400_000;
}

// ---------- 7. Artists the owner has confirmed (data/artist-rules.json) ----------

export interface ArtistRule {
  name: string;
  aka?: string[];
  genres: string[];
  /**
   * Owner rule (17 Nov 2026): every official full concert of this artist is looked for by the per-artist
   * lane (scripts/artist-lane.ts), with no view threshold.
   */
  allConcerts?: boolean;
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

/** Find the owner's rule for any of a concert's main artists. Names are compared as slugs. */
export function findArtistRule(mainArtists: string[], rules: ArtistRule[]): ArtistRule | null {
  const wanted = new Set(mainArtists.map(slugify).filter(Boolean));
  return rules.find((r) => [r.name, ...(r.aka ?? [])].some((n) => wanted.has(slugify(n)))) ?? null;
}

/**
 * Genres for a concert by an owner-approved artist: the classifier's genres when it gave some of ours,
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
 * Owner rule (13 Nov 2026): once an artist is in the catalogue, all their other full concerts that pass
 * the view threshold come in too. Genres for such a concert: the classifier's (ours only), else the
 * genres the artist's concerts already have on the site.
 */
export function genresWithFallback(classifierGenres: string[], fallback: string[]): string[] {
  const ours = new Set<string>(GENRES);
  const fromClassifier = classifierGenres.filter((g) => ours.has(g));
  const site = new Set<string>(SITE_GENRES);
  return fromClassifier.length ? fromClassifier : fallback.filter((g) => site.has(g)).slice(0, 3);
}
