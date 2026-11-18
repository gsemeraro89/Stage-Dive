// Genre page: every concert in that genre.
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Collection, pileData } from "@/components/gig/Collection";
import { EmptyNote, PageHead, TagLinks } from "@/components/gig/PageHead";
import { cutName } from "@/components/gig/words";
import { getGenrePage, listGenres } from "@/lib/queries";

// One database read per request, shared by the page and its title/description.
const load = cache(getGenrePage);

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return {};
  const { genre, concerts } = page;
  const artists = [...new Set(concerts.flatMap((s) => s.artists.map((a) => a.name)))].slice(0, 4).join(", ");
  return {
    title: `${genre.name} — full concerts`,
    description: `${concerts.length} full ${genre.name} ${concerts.length === 1 ? "concert" : "concerts"} to watch free${artists ? `, with ${artists}` : ""}.`,
    alternates: { canonical: `/genres/${genre.slug}` },
    // A genre with no concerts yet has nothing worth indexing.
    robots: concerts.length === 0 ? { index: false, follow: true } : undefined,
  };
}

export default async function GenrePage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { genre, concerts } = page;
  // The genres that do have gigs: somewhere to go next.
  const others = (await listGenres()).filter((g) => g.slug !== genre.slug);
  const otherGenres = <TagLinks label={concerts.length ? "Other noise" : "Play these instead"} items={others.map((g) => ({ href: `/genres/${g.slug}`, label: g.name }))} />;
  return (
    <main data-od="genre" className="pg">
      <PageHead
        trail={[{ label: "Genres", href: "/genres" }, { label: genre.name }]}
        lines={cutName(genre.name.replace(" / ", " + "))}
        data={<span data-od="result-count">{pileData(concerts)}</span>}
      />
      {concerts.length === 0 ? (
        <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
          <p>No {genre.name} on the wall yet.</p>
          {otherGenres}
        </EmptyNote>
      ) : (
        <Collection concerts={concerts} label={`Every ${genre.name} gig`}>
          {otherGenres}
        </Collection>
      )}
    </main>
  );
}
