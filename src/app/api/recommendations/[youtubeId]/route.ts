// "You might also like" for the set that is playing: similar artists, each with a set to play.
// Called by the player. Only the ranking is sent, never scores or reasons (owner decision).
import { toTrack } from "@/lib/player-types";
import { recommendationsFor } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ youtubeId: string }> }) {
  const { youtubeId } = await params;
  if (!/^[A-Za-z0-9_-]{11}$/.test(youtubeId)) return Response.json({ error: "bad id" }, { status: 400 });
  const cards = await recommendationsFor(youtubeId);
  if (!cards) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({
    artists: cards.map(({ mostWatched, latest, ...artist }) => ({
      ...artist,
      mostWatched: { ...toTrack(mostWatched), thumbnailSources: mostWatched.thumbnail },
      latest: { ...toTrack(latest), thumbnailSources: latest.thumbnail },
    })),
  });
}
