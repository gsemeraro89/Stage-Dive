// Venue or festival page: every set recorded there.
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BigName } from "@/components/ui/BigName";
import { CollectionBody, collectionStats } from "@/components/ui/Collection";
import { StatStrip } from "@/components/ui/StatStrip";
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
  const { venue, sets } = page;
  const artists = [...new Set(sets.flatMap((s) => s.artists.map((a) => a.name)))].slice(0, 4).join(", ");
  return {
    title: `${venue.name} — full DJ sets`,
    description:
      `${sets.length} full ${sets.length === 1 ? "set" : "sets"} recorded at ${venue.name}${where(venue) ? ` (${where(venue)})` : ""}` +
      `${artists ? `, with ${artists}` : ""}. Watch free.`,
    alternates: { canonical: `/venues/${venue.slug}` },
  };
}

export default async function VenuePage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { venue, sets } = page;
  const kind = sets.find((s) => s.setting)?.setting?.name ?? "Venue";
  return (
    <main data-od="venue">
      <header className="od-pagehero">
        <p className="od-rail meta">
          <span>{kind}</span>
          {where(venue) && <span data-od="place">{where(venue)}</span>}
          <span data-od="result-count">
            {sets.length} {sets.length === 1 ? "set" : "sets"}
          </span>
        </p>
        <BigName name={venue.name} max="15vw" />
        {sets.length > 0 && <StatStrip stats={collectionStats(sets)} />}
      </header>
      {sets.length === 0 ? (
        <section className="od-section">
          <div className="od-empty" data-od="empty">
            <p className="display">No sets yet</p>
            <p>Nothing recorded at {venue.name} is in the archive right now.</p>
            <Link href="/venues" className="od-link">
              All festivals
            </Link>
          </div>
        </section>
      ) : (
        <CollectionBody sets={sets} name={venue.name} />
      )}
    </main>
  );
}
