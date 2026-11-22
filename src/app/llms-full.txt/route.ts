// /llms-full.txt: every band, venue, genre, decade and tour, the songs played live, the most watched and the most recently
// published concerts (src/lib/llms.ts). Rebuilt at most every hour.
import { latestNews } from "@/lib/news/queries";
import { llmsFullTxt } from "@/lib/llms";
import { latestConcerts, llmsData, mostWatchedConcerts, songCatalogue } from "@/lib/queries";

export const revalidate = 3600;

export async function GET() {
  const [data, mostWatched, latest, songs, news] = await Promise.all([llmsData(), mostWatchedConcerts(200), latestConcerts(200), songCatalogue(), latestNews({ take: 50 })]);
  return new Response(llmsFullTxt({ ...data, songs, mostWatched, latest, news }), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
