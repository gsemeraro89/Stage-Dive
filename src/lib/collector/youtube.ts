// Minimal YouTube Data API v3 client for the collector.
// Quota rule (CLAUDE.md 6): read upload playlists (playlistItems.list, 1 unit per 50 videos) and
// batch videos.list (1 unit per 50 IDs). search.list costs 100 units and is used only for
// occasional discovery, inside a fixed budget.

import { blockedRegions, parseIsoDuration, type VideoFacts } from "./rules";

const API = "https://www.googleapis.com/youtube/v3";

export const UNIT_COST = { channels: 1, playlistItems: 1, videos: 1, search: 100, commentThreads: 1 } as const;

export interface YouTubeComment {
  text: string;
  likeCount: number;
  authorChannelId: string;
}

export class QuotaBudgetExceeded extends Error {}

/** YouTube answered 404: the thing asked for does not exist (or is not public). */
export class YouTubeNotFound extends Error {}

/**
 * A channel's uploads playlist ("UU" + the channel ID without "UC") that YouTube does not return.
 * Normal for a channel with no public uploads (all private, unlisted or removed), a closed channel,
 * or a stored playlist ID that is wrong. The collector skips the channel with a report line.
 */
export class PlaylistNotFound extends Error {
  constructor(readonly playlistId: string) {
    super(`uploads playlist ${playlistId} not found (no public uploads, closed channel or wrong ID)`);
  }
}

export interface YouTubeVideo extends VideoFacts {
  channelId: string;
  channelTitle: string;
  description: string;
  tags: string[];
  publishedAt: Date;
  /** contentDetails.definition: "hd" or "sd" (the /hd page); absent when YouTube gives none. */
  definition?: string;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  uploadsPlaylistId: string;
}

export class YouTubeClient {
  unitsUsed = 0;
  /** videos.list batches skipped after repeated errors (collector only; the refresh job fails fast). */
  skippedBatches = 0;
  /** Refresh must not treat "could not ask" as "deleted from YouTube", so it stops on any error. */
  failFast = false;

  constructor(
    private readonly apiKey: string,
    private readonly unitBudget: number,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly retryDelayMs = 2000,
  ) {
    if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set");
  }

  private async get(endpoint: keyof typeof UNIT_COST, params: Record<string, string>): Promise<any> {
    const cost = UNIT_COST[endpoint];
    if (this.unitsUsed + cost > this.unitBudget) {
      throw new QuotaBudgetExceeded(`YouTube unit budget of ${this.unitBudget} reached`);
    }
    this.unitsUsed += cost;
    const url = `${API}/${endpoint}?${new URLSearchParams({ ...params, key: this.apiKey })}`;
    // YouTube sometimes answers 500/503 ("backendError"): wait and try again, up to 4 times.
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchFn(url);
      if (res.ok) return res.json();
      const body = await res.text().catch(() => "");
      if (res.status === 403 && /quotaExceeded|dailyLimitExceeded/.test(body)) {
        throw new QuotaBudgetExceeded("YouTube daily quota used up; the rest waits for the next run");
      }
      if (res.status === 404) throw new YouTubeNotFound(`YouTube ${endpoint} failed: 404 ${body.slice(0, 300)}`);
      if (res.status >= 500 && attempt < 4) {
        await new Promise((r) => setTimeout(r, this.retryDelayMs * 2 ** attempt));
        continue;
      }
      throw new Error(`YouTube ${endpoint} failed: ${res.status} ${body.slice(0, 300)}`);
    }
  }

  /** Look a channel up by @handle, legacy user name or ID. */
  async channel(ref: { handle?: string; id?: string; user?: string }): Promise<YouTubeChannel | null> {
    const params: Record<string, string> = { part: "snippet,contentDetails" };
    if (ref.id) params.id = ref.id;
    else if (ref.handle) params.forHandle = ref.handle.startsWith("@") ? ref.handle : `@${ref.handle}`;
    else if (ref.user) params.forUsername = ref.user;
    else return null;
    const data = await this.get("channels", params);
    const item = data.items?.[0];
    if (!item) return null;
    return {
      id: item.id,
      title: item.snippet?.title ?? "",
      uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? "",
    };
  }

  /**
   * Title, uploads playlist and number of public videos of channels, 50 IDs per call (1 unit).
   * Channels YouTube does not return (closed, wrong ID) are left out.
   */
  async channelsInfo(ids: string[]): Promise<Map<string, ChannelInfo>> {
    const out = new Map<string, ChannelInfo>();
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 50) {
      const data = await this.get("channels", { part: "snippet,contentDetails,statistics", id: unique.slice(i, i + 50).join(","), maxResults: "50" });
      for (const item of data.items ?? []) out.set(item.id, toChannelInfo(item));
    }
    return out;
  }

  /** One channel by @handle, with the same facts (1 unit). Null when no channel has that handle. */
  async channelInfoByHandle(handle: string): Promise<ChannelInfo | null> {
    const data = await this.get("channels", { part: "snippet,contentDetails,statistics", forHandle: handle.startsWith("@") ? handle : `@${handle}` });
    return data.items?.[0] ? toChannelInfo(data.items[0]) : null;
  }

  /**
   * Avatars of channels, 50 IDs per call (1 unit). A handle or legacy user name costs one call each.
   * Returns channel ID -> best avatar URL; channels YouTube no longer has are left out.
   */
  async channelAvatars(refs: { id?: string; handle?: string; user?: string }[]): Promise<Map<string, { id: string; url: string }>> {
    const out = new Map<string, { id: string; url: string }>();
    const best = (item: any): string | null => {
      const t = item?.snippet?.thumbnails ?? {};
      return t.high?.url ?? t.medium?.url ?? t.default?.url ?? null;
    };
    const ids = refs.filter((r) => r.id).map((r) => r.id!);
    for (let i = 0; i < ids.length; i += 50) {
      const data = await this.get("channels", { part: "snippet", id: ids.slice(i, i + 50).join(","), maxResults: "50" });
      for (const item of data.items ?? []) {
        const url = best(item);
        if (url) out.set(item.id, { id: item.id, url });
      }
    }
    for (const r of refs.filter((x) => !x.id)) {
      const params: Record<string, string> = { part: "snippet" };
      if (r.handle) params.forHandle = r.handle.startsWith("@") ? r.handle : `@${r.handle}`;
      else if (r.user) params.forUsername = r.user;
      else continue;
      const item = (await this.get("channels", params)).items?.[0];
      const url = best(item);
      if (item && url) out.set(r.handle ? `@${r.handle.replace(/^@/, "")}` : `user:${r.user}`, { id: item.id, url });
    }
    return out;
  }

  /**
   * Video IDs from an uploads playlist, newest first. Stops at `since` (with a safety margin applied
   * by the caller) so later runs only read new uploads.
   */
  async playlistVideoIds(playlistId: string, since: Date | null, maxPages = 400): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    if (!playlistId) throw new PlaylistNotFound("(none)");
    for (let page = 0; page < maxPages; page++) {
      let data: any;
      try {
        data = await this.get("playlistItems", {
          part: "contentDetails",
          playlistId,
          maxResults: "50",
          ...(pageToken ? { pageToken } : {}),
        });
      } catch (error) {
        if (error instanceof YouTubeNotFound) throw new PlaylistNotFound(playlistId);
        throw error;
      }
      let reachedOld = false;
      for (const item of data.items ?? []) {
        const published = item.contentDetails?.videoPublishedAt;
        if (since && published && new Date(published) < since) {
          reachedOld = true;
          continue;
        }
        if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
      }
      pageToken = data.nextPageToken;
      if (!pageToken || reachedOld) break;
    }
    return ids;
  }

  /** Full facts for up to any number of IDs, 50 per call. Videos YouTube no longer has are left out. */
  async videos(ids: string[]): Promise<Map<string, YouTubeVideo>> {
    const result = new Map<string, YouTubeVideo>();
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      let data: any;
      try {
        data = await this.get("videos", {
          part: "snippet,contentDetails,statistics,status",
          id: batch.join(","),
          maxResults: "50",
        });
      } catch (error) {
        if (error instanceof QuotaBudgetExceeded || this.failFast) throw error;
        // One bad batch must not stop the run: these 50 videos are simply looked at next time.
        this.skippedBatches++;
        continue;
      }
      for (const item of data.items ?? []) {
        const video = toVideo(item);
        if (video) result.set(video.youtubeId, video);
      }
    }
    return result;
  }

  /**
   * The most relevant top-level comments of a video (1 unit). YouTube's "relevance" order puts the
   * most liked first, and the pinned comment normally at the top; the API has no "pinned" flag, so
   * callers use the author (the uploading channel) instead. Comments switched off: empty list.
   */
  async topComments(videoId: string, maxResults = 20): Promise<YouTubeComment[]> {
    let data: any;
    try {
      data = await this.get("commentThreads", {
        part: "snippet",
        videoId,
        order: "relevance",
        textFormat: "plainText",
        maxResults: String(maxResults),
      });
    } catch (error) {
      if (error instanceof QuotaBudgetExceeded) throw error;
      if (/commentsDisabled|videoNotFound/.test((error as Error).message)) return [];
      throw error;
    }
    return (data.items ?? []).map((item: any) => {
      const s = item.snippet?.topLevelComment?.snippet ?? {};
      return {
        text: s.textOriginal ?? s.textDisplay ?? "",
        likeCount: Number(s.likeCount ?? 0),
        authorChannelId: s.authorChannelId?.value ?? "",
      };
    });
  }

  /** Find channels by name (100 units). Used once per channel when its handle is unknown. */
  async searchChannels(query: string, maxResults = 5): Promise<string[]> {
    const data = await this.get("search", { part: "id", q: query, type: "channel", maxResults: String(maxResults) });
    return (data.items ?? []).map((i: any) => i.id?.channelId).filter(Boolean);
  }

  /**
   * The per-artist lane's search (100 units): long, embeddable videos, most relevant first, 50 results
   * (owner, 17 Nov 2026).
   */
  async searchArtistConcerts(query: string): Promise<string[]> {
    const data = await this.get("search", {
      part: "id",
      q: query,
      type: "video",
      videoDuration: "long",
      videoEmbeddable: "true",
      order: "relevance",
      maxResults: "50",
    });
    return (data.items ?? []).map((item: any) => item.id?.videoId).filter(Boolean);
  }

  /** Discovery search for long videos (100 units). Used sparingly, inside its own budget. */
  async searchLongVideos(query: string, maxResults = 25): Promise<string[]> {
    const data = await this.get("search", {
      part: "id",
      q: query,
      type: "video",
      videoDuration: "long",
      videoEmbeddable: "true",
      order: "viewCount",
      maxResults: String(maxResults),
    });
    return (data.items ?? []).map((item: any) => item.id?.videoId).filter(Boolean);
  }
}

export interface ChannelInfo {
  id: string;
  title: string;
  /** From contentDetails.relatedPlaylists.uploads; empty when YouTube gives none. */
  uploadsPlaylistId: string;
  videoCount: number;
}

function toChannelInfo(item: any): ChannelInfo {
  return {
    id: item.id,
    title: item.snippet?.title ?? "",
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? "",
    videoCount: Number(item.statistics?.videoCount ?? 0),
  };
}

export function toVideo(item: any): YouTubeVideo | null {
  if (!item?.id) return null;
  return {
    youtubeId: item.id,
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    tags: item.snippet?.tags ?? [],
    channelId: item.snippet?.channelId ?? "",
    channelTitle: item.snippet?.channelTitle ?? "",
    publishedAt: new Date(item.snippet?.publishedAt ?? 0),
    liveBroadcastContent: item.snippet?.liveBroadcastContent ?? "none",
    durationSeconds: parseIsoDuration(item.contentDetails?.duration),
    viewCount: Number(item.statistics?.viewCount ?? 0),
    embeddable: item.status?.embeddable === true,
    privacyStatus: item.status?.privacyStatus ?? "unknown",
    madeForKids: item.status?.madeForKids === true,
    uploadStatus: item.status?.uploadStatus ?? "unknown",
    blockedIn: blockedRegions(item.contentDetails?.regionRestriction),
    ...(item.contentDetails?.definition ? { definition: String(item.contentDetails.definition) } : {}),
  };
}
