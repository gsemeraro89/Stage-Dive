// Genre page: every concert in that genre.
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Collection, pileData } from "@/components/gig/Collection";
import { EmptyNote, PageHead, TagLinks } from "@/components/gig/PageHead";
import { cutName } from "@/components/gig/words";
import { bestCatalogue, getGenrePage, listGenres } from "@/lib/queries";
import { bestIsStrong, bestPath, genreSlug } from "@/lib/best";
import { JsonLd } from "@/components/seo/JsonLd";
import { genreLead } from "@/lib/answers";
import { clip, genreSearchTitle, hubIsStrong, robotsFor, shareImages, titleCase } from "@/lib/seo";
import { breadcrumbs, itemList } from "@/lib/structured-data";

// One database read per request, shared by the page and its title/description.
const load = cache(getGenrePage);

// Built on its first visit, then served ready-made and rebuilt at most every 10 minutes.
export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return {};
  const { genre, concerts } = page;
  const title = genreSearchTitle(genre.name, concerts.some((c) => c.hasSetlist));
  const description = clip(genreLead(genre.name, concerts));
  const path = `/genres/${genre.slug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    // A genre with fewer than two concerts has nothing of its own worth indexing.
    robots: robotsFor(hubIsStrong(concerts.length)),
    openGraph: { title, description, url: path, images: shareImages(concerts[0]?.thumbnail.src) },
  };
}

export default async function GenrePage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { genre, concerts } = page;
  // The genres that do have gigs: somewhere to go next.
  const [genres, rankings] = await Promise.all([listGenres(), bestCatalogue()]);
  const others = genres.filter((g) => g.slug !== genre.slug);
  // "Best live metal concerts" (src/lib/best.ts), when it has ten concerts or more.
  const ranking = rankings.find((l) => l.slug === genreSlug(genre.slug) && bestIsStrong(l));
  const otherGenres = <TagLinks label={concerts.length ? "Other noise" : "Play these instead"} items={others.map((g) => ({ href: `/genres/${g.slug}`, label: g.name }))} />;
  const path = `/genres/${genre.slug}`;
  return (
    <main data-od="genre" className="pg">
      <JsonLd
        data={[
          breadcrumbs([
            ["Home", "/"],
            ["Genres", "/genres"],
            [titleCase(genre.name), path],
          ]),
          concerts.length ? itemList(`Full ${genre.name} concerts`, concerts.map((c) => ({ path: `/concerts/${c.slug}`, name: c.credits }))) : null,
        ]}
      />
      <PageHead
        trail={[{ label: "Genres", href: "/genres" }, { label: genre.name }]}
        lines={cutName(genre.name.replace(" / ", " + "))}
        data={<span data-od="result-count">{pileData(concerts)}</span>}
      >
        <p className="pg-lead" data-od="genre-lead">
          {genreLead(genre.name, concerts)}
        </p>
      </PageHead>
      {concerts.length === 0 ? (
        <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
          <p>No {genre.name} on the wall yet.</p>
          {otherGenres}
        </EmptyNote>
      ) : (
        <Collection concerts={concerts} label={`Every ${genre.name} gig`}>
          {ranking && (
            <Link href={bestPath(ranking.slug)} className="hm-more" data-od="best-link">
              MOST WATCHED {genre.name.toUpperCase()} &gt;&gt;
            </Link>
          )}
          {otherGenres}
        </Collection>
      )}
    </main>
  );
}
