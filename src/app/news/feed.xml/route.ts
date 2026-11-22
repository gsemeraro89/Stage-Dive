// /news/feed.xml: our own news as RSS 2.0, for feed readers and news aggregators (src/lib/news/seo.ts).
// Empty on the test service and local copies, which are not public.
import { latestNews } from "@/lib/news/queries";
import { newsRssXml } from "@/lib/news/seo";
import { siteIsIndexable } from "@/lib/seo";

export const revalidate = 600;

export async function GET() {
  const rows = siteIsIndexable() ? await latestNews({ take: 50 }) : [];
  return new Response(newsRssXml(rows), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
