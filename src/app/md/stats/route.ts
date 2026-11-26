// /stats.md (rewritten here by next.config.ts): "STAGEDIVE in numbers" as Markdown for AI assistants.
// The HTML page stays the canonical one (Link header).
import { statsMarkdown } from "@/lib/llms";
import { abs, siteIsIndexable } from "@/lib/seo";
import { STATS_PATH } from "@/lib/stats";
import { siteStats } from "@/lib/stats-data";

export const revalidate = 600;

export async function GET() {
  return new Response(statsMarkdown(await siteStats()), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${abs(STATS_PATH)}>; rel="canonical"`,
      ...(siteIsIndexable() ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
    },
  });
}
