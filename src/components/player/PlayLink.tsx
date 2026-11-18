"use client";

import Link from "next/link";
import type { Track } from "@/lib/player-types";
import { usePlayer } from "./PlayerProvider";

/**
 * A concert's thumbnail (or its "Play concert" button) outside the concert page: opens the concert page. The visitor
 * starts the concert there with the page's own play button (owner decision, 16 Nov 2026: nothing starts
 * by itself, and the video never flashes in the bottom bar on the way to the page).
 * When this concert is already playing, the thumbnail shows it (data-current / data-status).
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
      href={`/concerts/${track.slug}`}
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
