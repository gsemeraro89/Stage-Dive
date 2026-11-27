"use client";

import { playLabel, type Track } from "@/lib/player-types";
import { usePlayer } from "./PlayerProvider";

/** A button that plays a concert in the site's player. Unstyled: the designer gives it its look. */
export function PlayButton({
  track,
  children,
  className,
  visibleText,
}: {
  track: Track;
  children: React.ReactNode;
  className?: string;
  /** The words the button shows, when it shows any: its accessible name starts with them. */
  visibleText?: string;
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
      aria-label={playLabel(track.title, visibleText)}
      onClick={() => play(track)}
    >
      {children}
    </button>
  );
}
