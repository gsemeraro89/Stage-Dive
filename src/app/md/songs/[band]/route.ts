// /songs/<band>.md (rewritten here by next.config.ts): a band's songs played live as Markdown for AI
// assistants. The HTML page stays the canonical one (Link header).
import { bandSongsMarkdown } from "@/lib/llms";
import { bandSongData } from "@/lib/queries";
import { abs, siteIsIndexable } from "@/lib/seo";
import { bandSongsPath } from "@/lib/songs";

export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

export async function GET(_req: Request, { params }: { params: Promise<{ band: string }> }) {
  const { band } = await params;
  const data = await bandSongData(band);
  if (!data || !data.songs.length) return new Response("Not found", { status: 404 });
  return new Response(bandSongsMarkdown(data.band, data.songs, data.setlists), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${abs(bandSongsPath(band))}>; rel="canonical"`,
      ...(siteIsIndexable() ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
    },
  });
}
