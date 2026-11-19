// /songs/<band>/<song>.md (rewritten here by next.config.ts): a song page as Markdown for AI
// assistants. The HTML page stays the canonical one (Link header).
import { songMarkdown } from "@/lib/llms";
import { bandSongData } from "@/lib/queries";
import { abs, siteIsIndexable } from "@/lib/seo";
import { songPath } from "@/lib/songs";

export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

/** Other songs of the band listed under a song (most played first). */
const OTHER_SONGS = 10;

export async function GET(_req: Request, { params }: { params: Promise<{ band: string; song: string }> }) {
  const { band, song } = await params;
  const data = await bandSongData(band);
  const found = data?.songs.find((s) => s.slug === song);
  if (!data || !found) return new Response("Not found", { status: 404 });
  const others = data.songs
    .filter((s) => s.slug !== found.slug)
    .slice(0, OTHER_SONGS)
    .map((s) => ({ slug: s.slug, title: s.title, versions: s.versions.length }));
  return new Response(songMarkdown(data.band, found, data.setlists, others), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${abs(songPath(band, song))}>; rel="canonical"`,
      ...(siteIsIndexable() ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
    },
  });
}
