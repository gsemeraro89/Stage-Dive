"use client";

import { usePlayer } from "@/components/player/PlayerProvider";
import { TypewriterSetlist, type SetlistSong } from "@/components/zine";
import type { Track } from "@/lib/player-types";

/**
 * The gig of the week's setlist, wired to the site's player: a song jumps to its time, the song on
 * now sits on pink and the ones already played are struck out. `songs` must be in playing order.
 */
export function HomeSetlist({ track, songs }: { track: Track; songs: SetlistSong[] }) {
  const { current, time, playFrom } = usePlayer();
  let now: number | null = null;
  if (current?.youtubeId === track.youtubeId) {
    songs.forEach((song, i) => {
      if (time >= song.seconds) now = i;
    });
  }
  return (
    <TypewriterSetlist
      songs={songs}
      currentIndex={now}
      label={`Setlist: ${track.credits}`}
      onSelect={(seconds) => playFrom(track, seconds)}
    />
  );
}
