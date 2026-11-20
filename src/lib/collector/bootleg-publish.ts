// Publishing bootlegs (owner, 20 Nov 2026): pro-shot and complete shows only, one per concert, from fan channels
// only, and an official version of the same concert always wins (existing or later: the bootleg is hidden and comes
// back by itself if the official one goes). Also the fan sources read in full (data/fan-channels.json).
// Pure functions only (tests/bootleg-publish.test.ts); the database side is in src/lib/collector/store.ts and
// scripts/artist-lane.ts.
import { VENUE_KINDS } from "../catalogue";
import { slugify } from "../slug";
import { normalVenue, sameConcert, type BootlegAnswer, type ConcertKey, type ExistingConcert } from "./bootleg";
import type { FullClassification } from "./classify";
import { genresForApprovedArtist, isSameConcert, looseName, type ArtistRule, type ConcertIdentity } from "./rules";

// ---------- Official sources are never bootlegs ----------

/** A channel of data/channels.json, as the official-source check reads it. */
export interface ListedChannel {
  name: string;
  expect?: string;
  kind?: string;
  id?: string;
}

/**
 * Whether a video comes from an official source, so it must never be stored as a bootleg (it goes through the
 * normal official path): a channel marked official in our channels table or a band's own channel
 * (`officialChannelIds`), or a channel of data/channels.json, matched by ID or, before the collector has stored
 * its ID, by name (ARCHIVE and MIXED entries: the name contains `expect`, "WDR Rockpalast"; ARTIST entries: the
 * name is the band's, exactly).
 */
export function isOfficialSource(
  video: { channelId: string; channelTitle: string },
  ctx: { officialChannelIds: Set<string>; listed: ListedChannel[] },
): boolean {
  if (ctx.officialChannelIds.has(video.channelId)) return true;
  const title = looseName(video.channelTitle);
  return ctx.listed.some((c) => {
    if (c.id && c.id === video.channelId) return true;
    const expect = looseName(c.expect || c.name);
    if (!expect || !title) return false;
    return c.kind === "ARTIST" ? title === expect || title === looseName(c.name) : title.includes(expect);
  });
}

// ---------- What is stored ----------

/** The fields saveConcert needs, from a bootleg answer and the band's rule (genres: the owner's for that band). */
export function bootlegClassification(answer: BootlegAnswer, rule: ArtistRule): FullClassification {
  return {
    isFullConcert: true,
    notConcertReason: "",
    isRock: true,
    confidence: answer.confidence,
    mainArtists: [rule.name],
    collaborators: [],
    venue: answer.venue.trim(),
    city: answer.city.trim(),
    country: answer.country.trim(),
    venueKind: (VENUE_KINDS as readonly string[]).includes(answer.venueKind) ? (answer.venueKind as FullClassification["venueKind"]) : "Unknown",
    performed: answer.performed.trim(),
    genres: genresForApprovedArtist([], rule) as FullClassification["genres"],
    uploaderIsOfficial: false,
    writeUp: "",
  };
}

/** "nirvana-teatro-castello-1991-bootleg": a bootleg's address never takes the one its official twin would get. */
export function bootlegSlug(base: string): string {
  return base.endsWith("-bootleg") ? base : `${base}-bootleg`;
}

// ---------- The official twin ----------

/** Concerts of the same night: a shared main band, then the bootleg identity rule or the collector's duplicate rule. */
export function sameConcertAs(a: ExistingConcert, b: ExistingConcert): boolean {
  const aSlugs = a.artists.map(slugify).filter(Boolean);
  const bSlugs = b.artists.map(slugify).filter(Boolean);
  const artist = aSlugs.find((s) => bSlugs.includes(s));
  if (!artist) return false;
  const key = (c: ExistingConcert): ConcertKey => ({
    artist,
    year: c.performedYear,
    day: c.performedOn ? c.performedOn.toISOString().slice(0, 10) : null,
    venue: normalVenue(c.venue ?? ""),
    city: slugify(c.city ?? ""),
  });
  const identity = (c: ExistingConcert, slugs: string[]): ConcertIdentity => ({
    youtubeId: c.youtubeId,
    artistSlugs: slugs,
    venueName: c.venue,
    publishedAt: c.publishedAt,
    durationSeconds: c.durationSeconds,
    isOfficial: c.isOfficial,
    channelId: c.channelId,
  });
  const yearsDisagree = a.performedYear !== null && b.performedYear !== null && a.performedYear !== b.performedYear;
  return sameConcert(key(a), key(b)) || (!yearsDisagree && isSameConcert(identity(a, aSlugs), identity(b, bSlugs)));
}

/** The official concert (not a bootleg) that makes this bootleg redundant, or null. */
export function officialTwinOf<T extends ExistingConcert>(bootleg: ExistingConcert, concerts: T[]): T | null {
  return concerts.find((c) => !c.bootleg && c.youtubeId !== bootleg.youtubeId && sameConcertAs(bootleg, c)) ?? null;
}

/**
 * What to do with a stored bootleg once its official twin is known (refresh and official store path): hide it
 * while an official version is listed; show it again when it was hidden only for a twin that is gone and its
 * own video is still playable; leave alone a bootleg the owner hid, a removed one, or one already right.
 */
export function twinAction(
  bootleg: { status: "PUBLISHED" | "HIDDEN" | "REMOVED"; officialTwinId: number | null; playable: boolean },
  twinId: number | null,
): { action: "hide"; twinId: number } | { action: "restore" } | { action: "keep" } {
  if (bootleg.status === "REMOVED") return { action: "keep" };
  if (bootleg.status === "HIDDEN" && bootleg.officialTwinId === null) return { action: "keep" }; // hidden by the owner
  if (twinId !== null) return bootleg.status === "HIDDEN" && bootleg.officialTwinId === twinId ? { action: "keep" } : { action: "hide", twinId };
  if (bootleg.status === "HIDDEN" && bootleg.playable) return { action: "restore" };
  return { action: "keep" };
}

// ---------- Fan sources read in full (data/fan-channels.json) ----------

/**
 * Fan channels read from their first video ({ name, fromVideo }: the channel is found from one of its videos,
 * 1 unit) and playlists read whole ({ name, playlistId }). A fan channel is never official.
 */
export type FanSource = { kind: "channel"; name: string; fromVideo: string } | { kind: "playlist"; name: string; playlistId: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^(PL|UU|OL|FL)[A-Za-z0-9_-]{10,}$/;

/** The sources of data/fan-channels.json; entries with a malformed ID are skipped and named in `skipped`. */
export function parseFanSources(file: { channels?: unknown[]; playlists?: unknown[] }): { sources: FanSource[]; skipped: string[] } {
  const sources: FanSource[] = [];
  const skipped: string[] = [];
  for (const raw of file.channels ?? []) {
    const e = raw as { name?: unknown; fromVideo?: unknown };
    if (typeof e.name === "string" && typeof e.fromVideo === "string" && VIDEO_ID.test(e.fromVideo)) sources.push({ kind: "channel", name: e.name, fromVideo: e.fromVideo });
    else skipped.push(String(e.name ?? JSON.stringify(raw)));
  }
  for (const raw of file.playlists ?? []) {
    const e = raw as { name?: unknown; playlistId?: unknown };
    if (typeof e.name === "string" && typeof e.playlistId === "string" && PLAYLIST_ID.test(e.playlistId)) sources.push({ kind: "playlist", name: e.name, playlistId: e.playlistId });
    else skipped.push(String(e.name ?? JSON.stringify(raw)));
  }
  return { sources, skipped };
}

/** One line per source for the report, so sources that yield nothing can be dropped. */
export interface SourceTally {
  source: string;
  videosRead: number;
  longVideos: number;
  /** Videos on an official channel (playlists): left to the normal official path. */
  official: number;
  sentToClaude: number;
  proShotComplete: number;
  /** Bootlegs after one-per-concert and official-wins (published in a publishing run). */
  bootlegs: number;
}

export function emptyTally(source: string): SourceTally {
  return { source, videosRead: 0, longVideos: 0, official: 0, sentToClaude: 0, proShotComplete: 0, bootlegs: 0 };
}

export function sourceLine(s: SourceTally): string {
  return `${s.source} | read ${s.videosRead} / long ${s.longVideos} / official ${s.official} / sent to Claude ${s.sentToClaude} / pro-shot complete ${s.proShotComplete} / bootlegs ${s.bootlegs}`;
}
