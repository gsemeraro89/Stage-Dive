// A field (festival) or a room: every gig recorded there.
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Collection, pileData } from "@/components/gig/Collection";
import { EmptyNote, PageHead } from "@/components/gig/PageHead";
import { cutName, kindWord } from "@/components/gig/words";
import { getVenuePage } from "@/lib/queries";

// One database read per request, shared by the page and its title/description.
const load = cache(getVenuePage);

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function where(venue: { city: string | null; country: string | null }) {
  return [venue.city, venue.country].filter(Boolean).join(", ");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return {};
  const { venue, concerts } = page;
  const artists = [...new Set(concerts.flatMap((s) => s.artists.map((a) => a.name)))].slice(0, 4).join(", ");
  return {
    title: `${venue.name} — full concerts`,
    description:
      `${concerts.length} full ${concerts.length === 1 ? "concert" : "concerts"} recorded at ${venue.name}${where(venue) ? ` (${where(venue)})` : ""}` +
      `${artists ? `, with ${artists}` : ""}. Watch free.`,
    alternates: { canonical: `/venues/${venue.slug}` },
  };
}

export default async function VenuePage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { venue, concerts } = page;
  const kind = kindWord(concerts.find((s) => s.venueKind)?.venueKind) ?? "Place";
  return (
    <main data-od="venue" className="pg">
      <PageHead
        trail={[{ label: "Fields + Rooms", href: "/venues" }, { label: venue.name }]}
        lines={cutName(venue.name)}
        data={
          <>
            {[kind, where(venue)].filter(Boolean).join(" /// ")} /// <span data-od="result-count">{pileData(concerts)}</span>
          </>
        }
      />
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
    </main>
  );
}
