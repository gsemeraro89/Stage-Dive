"use client";

import { formatDuration } from "@/lib/format";
import type { Track } from "@/lib/player-types";
import { usePlayer } from "./PlayerProvider";

/**
 * A tracklist time ("12:30") that plays the set from that point, in the site's own player.
 * Unstyled: the designer gives it its look. `data-current` marks the track playing now.
 */
export function TrackTime({
  track,
  seconds,
  nextSeconds,
  label,
  className,
}: {
  track: Track;
  seconds: number;
  /** Start of the next track, to know whether this one is playing now. */
  nextSeconds: number | null;
  /** What the track is, for screen readers: "Artist – Title". */
  label: string;
  className?: string;
}) {
  const { playFrom, current, time } = usePlayer();
  const isPlaying =
    current?.youtubeId === track.youtubeId && time >= seconds && (nextSeconds === null || time < nextSeconds);
  return (
    <button
      type="button"
      className={className}
      data-od="track-time"
      data-current={isPlaying || undefined}
      aria-current={isPlaying || undefined}
      aria-label={`Play from ${formatDuration(seconds)}: ${label}`}
      onClick={() => playFrom(track, seconds)}
    >
      <time dateTime={`PT${seconds}S`}>{formatDuration(seconds)}</time>
    </button>
  );
}
