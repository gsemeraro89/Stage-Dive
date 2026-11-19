"use client";

import { useEffect, useRef } from "react";
import type { Track } from "@/lib/player-types";
import { parseStartTime, START_PARAM } from "@/lib/player/start-time";
import { usePlayer } from "./PlayerProvider";

/**
 * Honours a deep link to a moment of the concert (/concerts/<slug>?t=315, used by search engines for
 * each song of the setlist): starts the concert at that second. Read in the browser, so the page
 * itself stays served ready-made. YouTube rule 5: it starts only once more than half of the player
 * area (`[data-od="player-area"]`) is on screen, and never takes over a concert that is already playing.
 * Renders nothing.
 */
export function StartFromUrl({ track }: { track: Track }) {
  const { current, playFrom } = usePlayer();
  const done = useRef(false);
  const busy = useRef(Boolean(current));
  busy.current = Boolean(current) && current?.youtubeId !== track.youtubeId;

  useEffect(() => {
    if (done.current) return;
    const seconds = parseStartTime(new URLSearchParams(window.location.search).get(START_PARAM), track.durationSeconds);
    if (seconds === null) return;
    const area = document.querySelector('[data-od="player-area"]');
    const go = () => {
      if (done.current || busy.current) return;
      done.current = true;
      playFrom(track, seconds);
    };
    if (!area || typeof IntersectionObserver === "undefined") return go();
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.intersectionRatio > 0.5)) {
          watch.disconnect();
          go();
        }
      },
      { threshold: [0, 0.51, 1] },
    );
    watch.observe(area);
    return () => watch.disconnect();
  }, [track, playFrom]);

  return null;
}
