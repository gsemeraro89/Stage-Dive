"use client";

import { usePlayer } from "@/components/player/PlayerProvider";
import type { Track } from "@/lib/player-types";
import { TypewriterSetlist, type SetlistSong } from "./TypewriterSetlist";

/**
 * A gig's typewriter setlist, wired to the site's player: a song starts the gig at its time, the song
 * on now sits on pink and the ones already played are struck out with the marker.
 * `songs` must be in playing order, each with the second it starts at. A setlist without times is
 * not for this component: show it as a plain typed list.
 */
export function PlayableSetlist({ track, songs, label }: { track: Track; songs: SetlistSong[]; label?: string }) {
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
      label={label ?? `Setlist: ${track.credits}`}
      onSelect={(seconds) => playFrom(track, seconds)}
    />
  );
}
