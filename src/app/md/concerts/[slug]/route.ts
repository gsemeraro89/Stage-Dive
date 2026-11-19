// /concerts/<slug>.md (rewritten here by next.config.ts): a concert page as Markdown for AI assistants.
// The HTML page stays the canonical one (Link header), so search engines do not see a duplicate.
import { concertMarkdown } from "@/lib/llms";
import { getConcertPage } from "@/lib/queries";
import { abs, siteIsIndexable } from "@/lib/seo";

export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getConcertPage(slug);
  if (!page) return new Response("Not found", { status: 404 });
  return new Response(concertMarkdown(page.concert, page.setlist, page.notes, page.songLinks), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${abs(`/concerts/${slug}`)}>; rel="canonical"`,
      ...(siteIsIndexable() ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
    },
  });
}
