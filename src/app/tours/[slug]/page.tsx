// Tour page: every concert of one tour, in the order it was played.
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Collection, pileData } from "@/components/gig/Collection";
import { EmptyNote, PageHead } from "@/components/gig/PageHead";
import { cutName } from "@/components/gig/words";
import { getTourPage } from "@/lib/queries";
import { JsonLd } from "@/components/seo/JsonLd";
import { tourLead } from "@/lib/answers";
import { clip, hubIsStrong, robotsFor, shareImages, tourSearchTitle } from "@/lib/seo";
import { breadcrumbs, itemList } from "@/lib/structured-data";

const load = cache(getTourPage);

// Built on its first visit, then served ready-made and rebuilt at most every 10 minutes.
export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return {};
  const band = page.tour.artist?.name ?? null;
  const title = tourSearchTitle(page.tour.name, band);
  const description = clip(tourLead(page.tour.name, band, page.concerts));
  const path = `/tours/${page.tour.slug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: robotsFor(hubIsStrong(page.concerts.length)),
    openGraph: { title, description, url: path, images: shareImages(page.concerts[0]?.thumbnail.src) },
  };
}

export default async function TourPage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { tour, concerts } = page;
  const path = `/tours/${tour.slug}`;
  return (
    <main data-od="tour" className="pg">
      <JsonLd
        data={[
          breadcrumbs([
            ["Home", "/"],
            ["Tours", "/tours"],
            ...(tour.artist ? [[tour.artist.name, `/artists/${tour.artist.slug}`] as [string, string]] : []),
            [tour.name, path],
          ]),
          concerts.length ? itemList(`Full concerts from ${tour.name}`, concerts.map((c) => ({ path: `/concerts/${c.slug}`, name: c.credits }))) : null,
        ]}
      />
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
      >
        <p className="pg-lead" data-od="tour-lead">
          {tourLead(tour.name, tour.artist?.name ?? null, concerts)}
        </p>
      </PageHead>
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
