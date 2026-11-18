"use client";

import { usePlayer } from "@/components/player/PlayerProvider";
import { OnNowStamp } from "@/components/zine";

/**
 * The pink "On now" stamp, shown only while this gig is the one in the player. It is placed by its
 * parent on the edge of the frame, never on the video (YouTube rule: nothing on top of the player).
 */
export function OnNowMark({ youtubeId, className }: { youtubeId: string; className?: string }) {
  const { current } = usePlayer();
  if (current?.youtubeId !== youtubeId) return null;
  return (
    <span className={className}>
      <OnNowStamp animate />
    </span>
  );
}
