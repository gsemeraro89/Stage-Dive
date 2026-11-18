// Finds the tracklist of one video: description first, then its most relevant comments, then
// (optionally) Claude for a text the rules could not read. Used by the collector when it publishes
// a concert, by the refresh job (YouTube's 30-day rule) and by the one-off fill of existing concerts.

import { Prisma } from "../../generated/prisma/client";
import { QuotaBudgetExceeded, type YouTubeClient, type YouTubeVideo } from "../collector/youtube";
import { fromComments, fromDescription, type TracklistSource } from "./choose";
import type { TracklistExtractor } from "./extract";
import type { Track } from "./parse";

export type StoredSource = TracklistSource | "CLAUDE";

export interface Lookup {
  tracks: Track[] | null;
  source: StoredSource | null;
  /** The video has comments switched off (only known when comments were read). */
  commentsOff: boolean;
  /** At least one text looked like a tracklist but could not be read. */
  unclear: boolean;
}

export interface LookupOptions {
  /** Ask Claude about unclear texts. Leave out to skip that step. */
  extractor?: TracklistExtractor | null;
  /** Stop asking Claude after this many calls in the run. */
  claudeMax?: number;
}

/**
 * Throws QuotaBudgetExceeded when the comments could not be read for lack of quota, so callers can
 * keep what they had and try again next run. Other comment errors count as "no comments".
 */
export async function lookUpTracklist(yt: YouTubeClient, video: YouTubeVideo, options: LookupOptions = {}): Promise<Lookup> {
  const duration = video.durationSeconds;
  let choice = fromDescription(video.description, duration);
  let commentsOff = false;
  if (!choice.chosen) {
    let comments: Awaited<ReturnType<YouTubeClient["topComments"]>> = [];
    try {
      comments = await yt.topComments(video.youtubeId);
    } catch (error) {
      if (error instanceof QuotaBudgetExceeded) throw error;
    }
    commentsOff = comments.length === 0;
    const fromThread = fromComments(
      comments.map((c) => ({ text: c.text, likeCount: c.likeCount, byChannel: c.authorChannelId === video.channelId })),
      duration,
    );
    choice = { chosen: fromThread.chosen, unclear: [...choice.unclear, ...fromThread.unclear] };
  }
  if (choice.chosen) {
    return { tracks: choice.chosen.tracks, source: choice.chosen.source, commentsOff, unclear: false };
  }

  const unclear = choice.unclear.length > 0;
  const { extractor, claudeMax = Infinity } = options;
  if (unclear && extractor && extractor.calls < claudeMax) {
    try {
      const tracks = await extractor.extract(choice.unclear[0].text, duration);
      if (tracks) return { tracks, source: "CLAUDE", commentsOff, unclear };
    } catch {
      // Claude unavailable or declined: no tracklist this time, tried again on the next refresh.
    }
  }
  return { tracks: null, source: null, commentsOff, unclear };
}

/** The database fields for a lookup result. A missing tracklist clears any old one. */
export function tracklistFields(result: Lookup, now: Date) {
  return {
    // A JSON column is cleared with DbNull (a plain null would be rejected).
    tracklist: result.tracks ? (result.tracks as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    tracklistSource: result.source,
    tracklistCheckedAt: now,
  };
}
