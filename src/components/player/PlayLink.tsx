"use client";

import Link from "next/link";
import type { Track } from "@/lib/player-types";
import { usePlayer } from "./PlayerProvider";

/**
 * A set's thumbnail (or its "Play set" button) outside the set page: opens the set page. The visitor
 * starts the set there with the page's own play button (owner decision, 16 Nov 2026: nothing starts
 * by itself, and the video never flashes in the bottom bar on the way to the page).
 * When this set is already playing, the thumbnail shows it (data-current / data-status).
 */
export function PlayLink({
  track,
  children,
  className,
}: {
  track: Track;
  children: React.ReactNode;
  className?: string;
}) {
  const { current, status } = usePlayer();
  const isCurrent = current?.youtubeId === track.youtubeId;
  return (
    <Link
      href={`/sets/${track.slug}`}
      className={className}
      data-od="play"
      data-current={isCurrent || undefined}
      data-status={isCurrent ? status : undefined}
      aria-label={`Open ${track.title}`}
    >
      {children}
    </Link>
  );
}
