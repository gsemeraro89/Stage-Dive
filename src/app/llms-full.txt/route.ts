// /llms-full.txt: every band, venue, genre, decade and tour, the most watched and the most recently
// published concerts (src/lib/llms.ts). Rebuilt at most every hour.
import { llmsFullTxt } from "@/lib/llms";
import { latestConcerts, llmsData, mostWatchedConcerts } from "@/lib/queries";

export const revalidate = 3600;

export async function GET() {
  const [data, mostWatched, latest] = await Promise.all([llmsData(), mostWatchedConcerts(200), latestConcerts(200)]);
  return new Response(llmsFullTxt({ ...data, mostWatched, latest }), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
