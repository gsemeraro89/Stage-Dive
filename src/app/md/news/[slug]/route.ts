// /news/<slug>.md (rewritten here by next.config.ts): a news article as Markdown for AI assistants.
// The HTML page stays the canonical one (Link header).
import { getNewsArticle } from "@/lib/news/queries";
import { newsMarkdown } from "@/lib/news/seo";
import { abs, siteIsIndexable } from "@/lib/seo";

export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getNewsArticle(slug);
  if (!page) return new Response("Not found", { status: 404 });
  return new Response(newsMarkdown(page.article, page.bands, page.festival), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${abs(`/news/${slug}`)}>; rel="canonical"`,
      ...(siteIsIndexable() ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
    },
  });
}
