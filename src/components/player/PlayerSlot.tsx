"use client";

import { useCallback } from "react";
import { PlayIcon } from "@/components/ui/Icons";
import { formatDuration } from "@/lib/format";
import type { Track } from "@/lib/player-types";
import { PlayButton } from "./PlayButton";
import { usePlayer } from "./PlayerProvider";

/**
 * The player area on a concert page. Before playing: the thumbnail, an acid play square
 * bottom-left and the length bottom-right; the whole image is the button.
 * Once this concert is playing: an empty 16:9 area that the site's player sits in.
 * Nothing is ever drawn over the player itself. Sizes are in src/styles/deck.css (.od-slot).
 */
export function PlayerSlot({ track, srcSet, alt }: { track: Track; srcSet?: string; alt: string }) {
  const { current, registerSlot } = usePlayer();
  const isCurrent = current?.youtubeId === track.youtubeId;
  const ref = useCallback(
    (element: HTMLDivElement | null) => registerSlot(track.youtubeId, element),
    [registerSlot, track.youtubeId],
  );

  if (isCurrent) return <div ref={ref} className="od-slot" data-od="player-slot" data-state="playing" />;

  return (
    <div className="od-slot" data-od="player-slot" data-state="poster">
      <PlayButton track={track} className="od-poster" visibleText={`Play concert — ${formatDuration(track.durationSeconds)}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={track.thumbnail} srcSet={srcSet} sizes="(min-width: 1001px) 72vw, 100vw" alt={alt} fetchPriority="high" />
        <span className="od-poster-play">
          <PlayIcon size={28} />
        </span>
        <span className="od-poster-label meta">Play concert — {formatDuration(track.durationSeconds)}</span>
      </PlayButton>
    </div>
  );
}
