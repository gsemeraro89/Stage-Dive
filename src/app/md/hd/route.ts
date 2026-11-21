// /hd.md (rewritten here by next.config.ts): the full concerts in HD as Markdown for AI assistants.
// The HTML page stays the canonical one (Link header).
import { HD_PATH } from "@/lib/hd";
import { hdMarkdown } from "@/lib/llms";
import { getHdPage } from "@/lib/queries";
import { abs, siteIsIndexable } from "@/lib/seo";

export const revalidate = 600;

export async function GET() {
  const { total, concerts } = await getHdPage();
  return new Response(hdMarkdown(total, concerts), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${abs(HD_PATH)}>; rel="canonical"`,
      ...(siteIsIndexable() ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
    },
  });
}
