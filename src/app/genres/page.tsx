import type { Metadata } from "next";
import Link from "next/link";
import { SIZES } from "@/components/catalogue/SetTile";
import { GenreWords } from "@/components/ui/GenreWords";
import { count2, SectionHead } from "@/components/ui/SectionHead";
import { listGenres } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Genres",
  description: "Browse full-length DJ sets by genre: melodic techno, house, techno, progressive and more.",
  alternates: { canonical: "/genres" },
};

export default async function GenresPage() {
  const genres = await listGenres();
  return (
    <main data-od="genres-index">
      <section className="od-section od-section--first">
        <SectionHead as="h1" title="Genres" note={count2(genres.length)} />
        {genres.length === 0 ? (
          <div className="od-empty" data-od="empty">
            <p className="display">No genres yet</p>
          </div>
        ) : (
          <GenreWords genres={genres} size="xl" />
        )}
      </section>
      {genres.length > 0 && (
        <section className="od-section" aria-labelledby="latest-by-genre">
          <SectionHead id="latest-by-genre" title="Latest in each" />
          <ul className="od-rows" aria-label="Latest set in each genre">
            {genres.map((g) => {
              // The picture is the genre's most recent set.
              const image = g.cover?.thumbnail;
              return (
                <li key={g.slug}>
                  <Link href={`/genres/${g.slug}`} className="od-index-row">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image.src} srcSet={image.srcSet} sizes={SIZES.row} alt="" loading="lazy" />
                    ) : (
                      // No picture: the initial, outlined, in a hairline frame.
                      <span className="od-index-noimg display" aria-hidden="true">
                        {g.name.charAt(0)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="od-index-name title">{g.name}</span>
                    </span>
                    <span className="od-index-count display">
                      {String(g.count).padStart(2, "0")}
                      <small className="meta">{g.count === 1 ? "set" : "sets"}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
