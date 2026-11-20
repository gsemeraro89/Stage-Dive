// /venues/<slug>/<year>.md (rewritten here by next.config.ts): a festival-year or venue-year page as
// Markdown for AI assistants. The HTML page stays the canonical one (Link header).
import { venueYearMarkdown } from "@/lib/llms";
import { getVenueYearPage } from "@/lib/queries";
import { abs, siteIsIndexable } from "@/lib/seo";
import { isFestival, parseYear, venueYearPath } from "@/lib/venue-years";

export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; year: string }> }) {
  const { slug, year } = await params;
  const y = parseYear(year);
  const page = y === null ? null : await getVenueYearPage(slug, y);
  if (!page) return new Response("Not found", { status: 404 });
  return new Response(venueYearMarkdown(page.venue, page.year, page.concerts, isFestival(page.concerts), page.years), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${abs(venueYearPath(page.venue.slug, page.year))}>; rel="canonical"`,
      ...(siteIsIndexable() ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
    },
  });
}
