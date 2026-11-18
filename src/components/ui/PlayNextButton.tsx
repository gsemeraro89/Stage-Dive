"use client";

import { usePlayer } from "@/components/player/PlayerProvider";
import type { Track } from "@/lib/player-types";

/**
 * "Play next": puts a concert first in the queue without stopping the one on deck.
 * Shown only while something is playing. Once queued it reads "Next on deck" in acid.
 */
export function PlayNextButton({ track }: { track: Track }) {
  const { current, queue, playNext } = usePlayer();
  if (!current || current.youtubeId === track.youtubeId) return null;
  const queued = queue[0]?.youtubeId === track.youtubeId;
  return (
    <button
      type="button"
      className="od-link od-playnext"
      data-od="play-next"
      data-queued={queued || undefined}
      aria-disabled={queued || undefined}
      aria-label={queued ? `${track.title} plays next` : `Play ${track.title} next`}
      onClick={() => {
        if (!queued) playNext(track);
      }}
    >
      {queued ? "Next on deck" : "Play next"}
    </button>
  );
}
