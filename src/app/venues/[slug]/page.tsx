// A field (festival) or a room: every gig recorded there.
import type { Metadata } from "next";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { Collection, pileData } from "@/components/gig/Collection";
import { Faq } from "@/components/gig/Faq";
import { EmptyNote, PageHead } from "@/components/gig/PageHead";
import { cutName, gigs, kindWord } from "@/components/gig/words";
import { getVenuePage, venueAliasTarget } from "@/lib/queries";
import { JsonLd } from "@/components/seo/JsonLd";
import { venueAnswers } from "@/lib/answers";
import { clip, hubIsStrong, robotsFor, shareImages, venueSearchTitle } from "@/lib/seo";
import { breadcrumbs, faqPage, itemList } from "@/lib/structured-data";
import { venueYearLinks } from "@/lib/venue-years";

// One database read per request, shared by the page and its title/description.
const load = cache(getVenuePage);

// Built on its first visit, then served ready-made and rebuilt at most every 10 minutes.
export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

function where(venue: { city: string | null; country: string | null }) {
  return [venue.city, venue.country].filter(Boolean).join(", ");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return {};
  const { venue, concerts } = page;
  const title = venueSearchTitle(venue.name, concerts.some((c) => c.hasSetlist));
  const description = clip(venueAnswers(venue, concerts).lead);
  const path = `/venues/${venue.slug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: robotsFor(hubIsStrong(concerts.length)),
    openGraph: { title, description, url: path, images: shareImages(concerts[0]?.thumbnail.src) },
  };
}

export default async function VenuePage({ params }: Props) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) {
    // A venue merged into another (admin op merge-venue): its old address moves for good (308).
    const target = await venueAliasTarget(slug);
    if (target) permanentRedirect(`/venues/${target}`);
    notFound();
  }
  const { venue, concerts } = page;
  const kind = kindWord(concerts.find((s) => s.venueKind)?.venueKind) ?? "Place";
  const answers = venueAnswers(venue, concerts);
  const path = `/venues/${venue.slug}`;
  // "By year": each edition with two concerts or more has its own page ("Pinkpop 1995").
  const years = venueYearLinks(venue.slug, concerts);
  const byYear = years.length > 0 && (
    // Unstyled for now (designer): one link per year, to its year page or, for a one-concert year, to that concert.
    <nav aria-labelledby="by-year" data-od="venue-years" className="pg-years">
      <h2 id="by-year">By year</h2>
      <ul>
        {years.map((y) => (
          <li key={y.year} data-page={y.page || undefined}>
            <Link href={y.href}>
              <span className="pg-years-year">{y.year}</span> <span className="zn-data">{gigs(y.count)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
  return (
    <main data-od="venue" className="pg">
      <JsonLd
        data={[
          breadcrumbs([
            ["Home", "/"],
            ["Fields + Rooms", "/venues"],
            [venue.name, path],
          ]),
          concerts.length ? itemList(`Full concerts at ${venue.name}`, concerts.map((c) => ({ path: `/concerts/${c.slug}`, name: c.credits }))) : null,
          answers.questions.length ? faqPage(answers.questions) : null,
        ]}
      />
      <PageHead
        trail={[{ label: "Fields + Rooms", href: "/venues" }, { label: venue.name }]}
        lines={cutName(venue.name)}
        data={
          <>
            {[kind, where(venue)].filter(Boolean).join(" /// ")} /// <span data-od="result-count">{pileData(concerts)}</span>
          </>
        }
      >
        <p className="pg-lead" data-od="venue-lead">
          {answers.lead}
        </p>
      </PageHead>
      {concerts.length === 0 ? (
        <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
          <p>Every gig from {venue.name} is off the wall right now. They come back when the videos do.</p>
          <Link href="/venues" className="hm-more">
            ALL FIELDS + ROOMS &gt;&gt;
          </Link>
        </EmptyNote>
      ) : (
        <Collection concerts={concerts} label={`Every gig at ${venue.name}`}>
          {byYear}
        </Collection>
      )}
      <Faq title={`Questions about ${venue.name}`} questions={answers.questions} />
    </main>
  );
}
