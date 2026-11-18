import type { SetView } from "./queries";
import type { ThumbnailSources } from "./thumbnails";

/** The little a player needs to know about a set. */
export interface Track {
  youtubeId: string;
  slug: string;
  title: string;
  credits: string;
  durationSeconds: number;
  thumbnail: string;
}

export function toTrack(set: SetView): Track {
  return {
    youtubeId: set.youtubeId,
    slug: set.slug,
    title: set.title,
    credits: set.credits,
    durationSeconds: set.durationSeconds,
    thumbnail: set.thumbnail.src,
  };
}

/**
 * Smallest size the YouTube player may be shown at (YouTube API policy: at least 200x200).
 * The docked player is 356x200, the smallest 16:9 box that respects it.
 */
export const MIN_PLAYER_SIZE = 200;
export const DOCK_PLAYER = { width: 356, height: 200 } as const;

/** A suggested artist as sent to the player by /api/recommendations. */
export interface RecommendedArtist {
  slug: string;
  name: string;
  origin: string | null;
  bornYear: number | null;
  style: string | null;
  genres: { slug: string; name: string }[];
  sets: number;
  cover: { youtubeId: string; thumbnail: ThumbnailSources; portrait: boolean } | null;
  mostWatched: RecommendedTrack;
  latest: RecommendedTrack;
}

/** A track with every thumbnail size, for sharp pictures on 2x screens. */
export type RecommendedTrack = Track & { thumbnailSources: ThumbnailSources };
