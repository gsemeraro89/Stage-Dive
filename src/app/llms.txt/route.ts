// /llms.txt: the site explained to AI assistants (src/lib/llms.ts). Rebuilt at most every hour.
import { latestNews } from "@/lib/news/queries";
import { llmsTxt } from "@/lib/llms";
import { llmsData } from "@/lib/queries";

export const revalidate = 3600;

export async function GET() {
  const [data, news] = await Promise.all([llmsData(), latestNews({ take: 1 })]);
  return new Response(llmsTxt({ ...data, news }), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
