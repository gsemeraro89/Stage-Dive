// Tour page: every concert of one tour, in the order it was played.
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CollectionBody } from "@/components/ui/Collection";
import { getTourPage } from "@/lib/queries";

const load = cache(getTourPage);

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return {};
  const by = page.tour.artist ? `${page.tour.artist.name}, ` : "";
  return {
    title: `${by}${page.tour.name} — full concerts`,
    description: `${page.concerts.length} full ${page.concerts.length === 1 ? "gig" : "gigs"} from ${by}${page.tour.name}, free to watch.`,
    alternates: { canonical: `/tours/${page.tour.slug}` },
    robots: page.concerts.length === 0 ? { index: false, follow: true } : undefined,
  };
}

export default async function TourPage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { tour, concerts } = page;
  return (
    <main data-od="tour">
      <header className="od-pagehero">
        <p className="od-rail meta">
          <span>Tour</span>
          {tour.artist && <Link href={`/artists/${tour.artist.slug}`}>{tour.artist.name}</Link>}
        </p>
        <h1>{tour.name}</h1>
      </header>
      {concerts.length === 0 ? (
        <section className="od-section">
          <div className="od-empty" data-od="empty">
            <p>Every gig of this tour is off the wall right now.</p>
          </div>
        </section>
      ) : (
        <CollectionBody concerts={concerts} name={tour.name} />
      )}
    </main>
  );
}
