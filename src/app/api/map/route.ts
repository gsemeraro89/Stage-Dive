// Map data for the /map page: /api/map?artist=<slug>[&genres=a,b] or /api/map?q=<text>.
// Answers { centre, artists } (artists best first, with x/y), or { match: null } when nothing matches.
// Never sends scores or reasons (owner decision 13 Nov 2026).
import { getMap, findArtistByText } from "@/lib/queries";

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let slug = params.get("artist")?.trim().toLowerCase() ?? "";
  const q = params.get("q")?.trim().slice(0, 80);
  if (!slug && q) slug = (await findArtistByText(q))?.slug ?? "";
  if (!slug || !SLUG.test(slug)) return Response.json({ match: null });
  const genres = (params.get("genres") ?? "").split(",").map((g) => g.trim()).filter((g) => SLUG.test(g)).slice(0, 9);
  const map = await getMap(slug, genres);
  if (!map) return Response.json({ match: null });
  return Response.json({ match: map.centre.slug, ...map });
}
