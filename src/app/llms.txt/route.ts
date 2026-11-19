// /llms.txt: the site explained to AI assistants (src/lib/llms.ts). Rebuilt at most every hour.
import { llmsTxt } from "@/lib/llms";
import { llmsData } from "@/lib/queries";

export const revalidate = 3600;

export async function GET() {
  return new Response(llmsTxt(await llmsData()), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
