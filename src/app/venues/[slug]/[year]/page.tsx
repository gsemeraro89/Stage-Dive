// A festival year or a venue year ("Pinkpop 1995"): every concert played at that place in that year
// (src/lib/venue-years.ts). Indexed from two concerts that year; a one-concert year stays reachable but
// noindex,follow, like every thin hub.
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Collection, pileData } from "@/components/gig/Collection";
import { Faq } from "@/components/gig/Faq";
import { PageHead, TagLinks } from "@/components/gig/PageHead";
import { cutName, kindWord } from "@/components/gig/words";
import { JsonLd } from "@/components/seo/JsonLd";
import { venueYearAnswers } from "@/lib/answers";
import { getVenueYearPage, venueAliasTarget } from "@/lib/queries";
import { clip, robotsFor, shareImages, venueYearIsStrong, venueYearName, venueYearSearchTitle } from "@/lib/seo";
import { breadcrumbs, faqPage, itemList, venueYearJsonLd } from "@/lib/structured-data";
import { isFestival, parseYear, venueYearPath } from "@/lib/venue-years";

// One database read per request, shared by the page and its title/description.
const load = cache(async (slug: string, year: string) => {
  const y = parseYear(year);
  return y === null ? null : getVenueYearPage(slug, y);
});

// Built on its first visit, then served ready-made and rebuilt at most every 10 minutes.
export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string; year: string }> };

function facts(page: NonNullable<Awaited<ReturnType<typeof load>>>) {
  const { venue, year, concerts } = page;
  const name = venueYearName(venue.name, year);
  const festival = isFestival(concerts);
  return { name, festival, path: venueYearPath(venue.slug, year), answers: venueYearAnswers(venue, name, year, concerts, festival) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, year } = await params;
  const page = await load(slug, year);
  if (!page) return {};
  const { path, answers } = facts(page);
  const title = venueYearSearchTitle(page.venue.name, page.year, page.concerts.some((c) => c.hasSetlist));
  const description = clip(answers.lead);
  return {
    title,
    description,
    alternates: { canonical: path, types: { "text/markdown": `${path}.md` } },
    robots: robotsFor(venueYearIsStrong(page.concerts.length)),
    openGraph: { title, description, url: path, images: shareImages(page.concerts[0]?.thumbnail.src) },
  };
}

export default async function VenueYearPage({ params }: Props) {
  const { slug, year } = await params;
  const page = await load(slug, year);
  if (!page) {
    // A venue merged into another (admin op merge-venue): its year pages move for good (308).
    const target = parseYear(year) !== null ? await venueAliasTarget(slug) : null;
    if (target) permanentRedirect(venueYearPath(target, parseYear(year)!));
    notFound();
  }
  const { venue, concerts } = page;
  const { name, festival, path, answers } = facts(page);
  const kind = kindWord(concerts.find((c) => c.venueKind)?.venueKind) ?? "Place";
  const where = [venue.city, venue.country].filter(Boolean).join(", ");
  // The place's other years that have a page of their own (two concerts or more).
  const otherYears = page.years.filter((y) => y.year !== page.year && venueYearIsStrong(y.count));
  return (
    <main data-od="venue-year" className="pg">
      <JsonLd
        data={[
          breadcrumbs([
            ["Home", "/"],
            ["Fields + Rooms", "/venues"],
            [venue.name, `/venues/${venue.slug}`],
            [String(page.year), path],
          ]),
          venueYearJsonLd(venue, name, page.year, path, concerts, festival),
          itemList(`Full concerts from ${name}`, concerts.map((c) => ({ path: `/concerts/${c.slug}`, name: c.credits }))),
          answers.questions.length ? faqPage(answers.questions) : null,
        ]}
      />
      <PageHead
        trail={[{ label: "Fields + Rooms", href: "/venues" }, { label: venue.name, href: `/venues/${venue.slug}` }, { label: String(page.year) }]}
        lines={[...cutName(venue.name), String(page.year)]}
        data={
          <>
            {[kind, where].filter(Boolean).join(" /// ")} /// <span data-od="result-count">{pileData(concerts)}</span>
          </>
        }
      >
        <p className="pg-lead" data-od="venue-year-lead">
          {answers.lead}
        </p>
      </PageHead>
      <Collection concerts={concerts} label={`Every gig from ${name}`}>
        <TagLinks label={`Other years at ${venue.name}`} items={otherYears.map((y) => ({ href: venueYearPath(venue.slug, y.year), label: String(y.year) }))} />
        <Link href={`/venues/${venue.slug}`} className="hm-more" data-od="venue-year-all">
          EVERY GIG AT {venue.name.toUpperCase()} &gt;&gt;
        </Link>
      </Collection>
      <Faq title={`Questions about ${name}`} questions={answers.questions} />
    </main>
  );
}
