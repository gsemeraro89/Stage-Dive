// Tour page: every concert of one tour, in the order it was played.
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Collection, pileData } from "@/components/gig/Collection";
import { EmptyNote, PageHead } from "@/components/gig/PageHead";
import { cutName } from "@/components/gig/words";
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
    <main data-od="tour" className="pg">
      <PageHead
        trail={[{ label: "Tours", href: "/tours" }, ...(tour.artist ? [{ label: tour.artist.name, href: `/artists/${tour.artist.slug}` }] : []), { label: tour.name }]}
        lines={cutName(tour.name)}
        data={
          <>
            {tour.artist ? `${tour.artist.name} /// ` : ""}
            <span data-od="result-count">{pileData(concerts)}</span>
          </>
        }
        note="in the order they played it"
      />
      {concerts.length === 0 ? (
        <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
          <p>Every gig of this tour is off the wall right now. They come back when the videos do.</p>
          <Link href="/tours" className="hm-more">
            ALL TOURS &gt;&gt;
          </Link>
        </EmptyNote>
      ) : (
        <Collection concerts={concerts} label={`Every gig of ${tour.name}`} />
      )}
    </main>
  );
}
