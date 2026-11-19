// sitemap.xml: the pages search engines should index (src/lib/sitemap.ts). Empty on the test service
// and local copies, which are never indexed. Rebuilt at most every hour, from the database.
import type { MetadataRoute } from "next";
import { abs, siteIsIndexable } from "@/lib/seo";
import { sitemapEntries } from "@/lib/sitemap";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!siteIsIndexable()) return [];
  return (await sitemapEntries()).map((e) => ({
    url: abs(e.path),
    lastModified: e.lastModified,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));
}
