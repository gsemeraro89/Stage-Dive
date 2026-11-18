// Genre page: every concert in that genre.
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BigName } from "@/components/ui/BigName";
import { CollectionBody, collectionStats } from "@/components/ui/Collection";
import { GenreWords } from "@/components/ui/GenreWords";
import { count2, SectionHead } from "@/components/ui/SectionHead";
import { StatStrip } from "@/components/ui/StatStrip";
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
  // An empty genre points the visitor to the genres that do have concerts.
  const others = concerts.length === 0 ? await listGenres() : [];
  return (
    <main data-od="genre">
      <header className="od-pagehero">
        <p className="od-rail meta">
          <span>Genre</span>
          <span data-od="result-count">
            {concerts.length} {concerts.length === 1 ? "concert" : "concerts"}
          </span>
        </p>
        <BigName name={genre.name} max="15vw" outline />
        {concerts.length > 0 && <StatStrip stats={collectionStats(concerts)} />}
      </header>
      {concerts.length === 0 ? (
        <>
          <section className="od-section" style={{ paddingTop: "clamp(28px, 4vw, 56px)" }}>
            <div className="od-empty" data-od="empty">
              <p style={{ marginTop: 0 }}>No {genre.name} concerts in the archive yet.</p>
              <Link href="/genres" className="od-link">
                All genres
              </Link>
            </div>
          </section>
          {others.length > 0 && (
            <section className="od-section" aria-labelledby="other-genres">
              <SectionHead id="other-genres" title="Play these instead" note={count2(others.length)} />
              <GenreWords genres={others} />
            </section>
          )}
        </>
      ) : (
        <CollectionBody concerts={concerts} name={genre.name} />
      )}
    </main>
  );
}
