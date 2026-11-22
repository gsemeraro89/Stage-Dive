// /news/<topic>.md (rewritten here by next.config.ts): a news topic page (/news/tours...) as Markdown for
// AI assistants (src/lib/news/hubs.ts). The HTML page stays the canonical one (Link header).
import { newsHubMarkdown, newsHubPath } from "@/lib/news/hubs";
import { getNewsHub } from "@/lib/news/queries";
import { abs, siteIsIndexable } from "@/lib/seo";

export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

export async function GET(_req: Request, { params }: { params: Promise<{ hub: string }> }) {
  const page = await getNewsHub((await params).hub);
  if (!page) return new Response("Not found", { status: 404 });
  const { hub, year, lead, articles, bands, festivals } = page;
  return new Response(newsHubMarkdown(hub, year, lead, articles, bands, festivals), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${abs(newsHubPath(hub.slug))}>; rel="canonical"`,
      ...(siteIsIndexable() ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
    },
  });
}
