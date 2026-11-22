// /artists/<slug>.md (rewritten here by next.config.ts): a band page as Markdown for AI assistants.
// The HTML page stays the canonical one (Link header).
import { bandMarkdown } from "@/lib/llms";
import { bandNewsBlock, bandNewsQuestions } from "@/lib/news/queries";
import { getArtistPage } from "@/lib/queries";
import { abs, siteIsIndexable } from "@/lib/seo";
import { bandSameAs } from "@/lib/structured-data";

export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [page, news] = await Promise.all([getArtistPage(slug), bandNewsBlock(slug, 5)]);
  if (!page) return new Response("Not found", { status: 404 });
  const { artist, concerts, setlists, ids, liveAlbums } = page;
  const md = bandMarkdown({ ...artist, sameAs: bandSameAs({ ...ids, youtubeChannelId: null }) }, concerts, setlists, liveAlbums, {
    latest: news.latest,
    total: news.total,
    questions: bandNewsQuestions(artist.name, news),
  });
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${abs(`/artists/${slug}`)}>; rel="canonical"`,
      ...(siteIsIndexable() ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
    },
  });
}
