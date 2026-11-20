// /best/<slug>.md (rewritten here by next.config.ts): a "best of" ranking as Markdown for AI assistants.
// The HTML page stays the canonical one (Link header).
import { bestPath } from "@/lib/best";
import { bestMarkdown } from "@/lib/llms";
import { getBestPage } from "@/lib/queries";
import { abs, siteIsIndexable } from "@/lib/seo";

export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const page = await getBestPage((await params).slug);
  if (!page) return new Response("Not found", { status: 404 });
  return new Response(bestMarkdown(page.list, page.concerts), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${abs(bestPath(page.list.slug))}>; rel="canonical"`,
      ...(siteIsIndexable() ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
    },
  });
}
