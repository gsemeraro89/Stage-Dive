// A field (festival) or a room: every gig recorded there.
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Collection, pileData } from "@/components/gig/Collection";
import { EmptyNote, PageHead } from "@/components/gig/PageHead";
import { cutName, kindWord } from "@/components/gig/words";
import { getVenuePage } from "@/lib/queries";
import { JsonLd } from "@/components/seo/JsonLd";
import { venueAnswers } from "@/lib/answers";
import { clip, hubIsStrong, robotsFor, shareImages, venueSearchTitle } from "@/lib/seo";
import { breadcrumbs, faqPage, itemList } from "@/lib/structured-data";

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

function Faq({ title, questions }: { title: string; questions: { question: string; answer: string }[] }) {
  if (!questions.length) return null;
  // Closed by default (owner choice); native <details>, readable without JavaScript.
  return (
    <details className="pg-faq" data-od="faq">
      <summary>{title}</summary>
      <dl>
        {questions.map((q) => (
          <div key={q.question}>
            <dt>{q.question}</dt>
            <dd>{q.answer}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default async function VenuePage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { venue, concerts } = page;
  const kind = kindWord(concerts.find((s) => s.venueKind)?.venueKind) ?? "Place";
  const answers = venueAnswers(venue, concerts);
  const path = `/venues/${venue.slug}`;
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
        <Collection concerts={concerts} label={`Every gig at ${venue.name}`} />
      )}
      <Faq title={`Questions about ${venue.name}`} questions={answers.questions} />
    </main>
  );
}
