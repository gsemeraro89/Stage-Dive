import type { ConcertView } from "./queries";
import type { ThumbnailSources } from "./thumbnails";

/** The little a player needs to know about a concert. */
export interface Track {
  youtubeId: string;
  slug: string;
  title: string;
  credits: string;
  durationSeconds: number;
  thumbnail: string;
}

export function toTrack(concert: ConcertView): Track {
  return {
    youtubeId: concert.youtubeId,
    slug: concert.slug,
    title: concert.title,
    credits: concert.credits,
    durationSeconds: concert.durationSeconds,
    thumbnail: concert.thumbnail.src,
  };
}

/** What a screen reader says for a play button: "Play <title>", or the button's visible words first. */
export function playLabel(title: string, visible?: string): string {
  // Accessibility (WCAG 2.5.3, "label in name"): a button that shows words is named starting with them,
  // so a voice-control user can say what they see ("Play it loud", "1:11:01").
  if (!visible) return `Play ${title}`;
  return /^play\b/i.test(visible) ? `${visible}: ${title}` : `${visible}: play ${title}`;
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
  concerts: number;
  cover: { youtubeId: string; thumbnail: ThumbnailSources; portrait: boolean } | null;
  mostWatched: RecommendedTrack;
  latest: RecommendedTrack;
}

/** A track with every thumbnail size, for sharp pictures on 2x screens. */
export type RecommendedTrack = Track & { thumbnailSources: ThumbnailSources };
