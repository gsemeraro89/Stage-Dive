// Google News sitemap: news articles of the last 48 hours, as Google asks (src/lib/news/seo.ts). The main
// sitemap (/sitemap.xml) lists every article worth indexing; this one helps fresh news be found fast.
// Empty on the test service and local copies, which are never indexed.
import { latestNews } from "@/lib/news/queries";
import { newsIsStrong, newsSitemapWindow, newsSitemapXml, NEWS_SITEMAP_HOURS } from "@/lib/news/seo";
import { siteIsIndexable } from "@/lib/seo";

export const revalidate = 600;

export async function GET() {
  const now = new Date();
  const rows = siteIsIndexable() ? await latestNews({ take: 1000, since: new Date(now.getTime() - NEWS_SITEMAP_HOURS * 3_600_000) }) : [];
  return new Response(newsSitemapXml(newsSitemapWindow(rows.filter(newsIsStrong), now)), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
