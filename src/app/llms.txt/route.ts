// /llms.txt: the site explained to AI assistants (src/lib/llms.ts). Rebuilt at most every hour.
import { latestHeadlines, newsHubCounts } from "@/lib/news/queries";
import { llmsTxt } from "@/lib/llms";
import { llmsData } from "@/lib/queries";

export const revalidate = 3600;

export async function GET() {
  const [data, news, newsHubs] = await Promise.all([llmsData(), latestHeadlines(1), newsHubCounts()]);
  return new Response(llmsTxt({ ...data, news, newsHubs }), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
