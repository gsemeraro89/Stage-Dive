"use client";

import type { Track } from "@/lib/player-types";
import { usePlayer } from "./PlayerProvider";

/** A button that plays a set in the site's player. Unstyled: the designer gives it its look. */
export function PlayButton({
  track,
  children,
  className,
}: {
  track: Track;
  children: React.ReactNode;
  className?: string;
}) {
  const { play, current, status } = usePlayer();
  const isCurrent = current?.youtubeId === track.youtubeId;
  return (
    <button
      type="button"
      className={className}
      data-od="play"
      data-current={isCurrent || undefined}
      data-status={isCurrent ? status : undefined}
      aria-label={`Play ${track.title}`}
      onClick={() => play(track)}
    >
      {children}
    </button>
  );
}
