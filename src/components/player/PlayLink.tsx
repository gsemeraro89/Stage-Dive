"use client";

import Link from "next/link";
import type { Track } from "@/lib/player-types";
import { usePlayer } from "./PlayerProvider";

/**
 * A concert's picture outside the concert page: opens the concert page, in the page (next/link), so the
 * concert that is playing keeps playing. The visitor switches there with the page's own play button
 * (owner decisions, 16 and 25 Nov 2026: a picture opens the page; explicit play buttons still play).
 * When this concert is the one in the player, the picture says so (data-current / data-status).
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
      data-od="open-concert"
      data-current={isCurrent || undefined}
      data-status={isCurrent ? status : undefined}
      aria-label={`Open ${track.title}`}
      // The mouse's hint that this opens the page and does not play (design/DESIGN.md section 9).
      title="Open the gig"
    >
      {children}
    </Link>
  );
}
