// The "up next" queue for a concert: same artist first, then related concerts. Called by the player.
import { toTrack } from "@/lib/player-types";
import { getQueue } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ youtubeId: string }> }) {
  const { youtubeId } = await params;
  if (!/^[A-Za-z0-9_-]{11}$/.test(youtubeId)) return Response.json({ error: "bad id" }, { status: 400 });
  const queue = await getQueue(youtubeId);
  if (!queue) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ queue: queue.map(toTrack) });
}
