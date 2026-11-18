// All concerts (moved from "/" on 17 Nov 2026, when "/" became the home page): today's featured concert, latest uploads, most watched, genres, artists, and the full list with search, filters and sorting.
import type { Metadata } from "next";
import Link from "next/link";
import { FilterForm } from "@/components/catalogue/FilterForm";
import { ChartList, Feature, LeadGrid, ConcertRows, SIZES } from "@/components/catalogue/ConcertTile";
import { ArtistSquares } from "@/components/ui/ArtistSquares";
import { GenreWords } from "@/components/ui/GenreWords";
import { MapSearch } from "@/components/ui/MapSearch";
import { count2, SectionHead } from "@/components/ui/SectionHead";
import { filtersToQuery, hasActiveFilters, parseFilters, SORT_LABELS } from "@/lib/filters";
import { formatDate } from "@/lib/format";
import { featuredConcert, filterOptions, latestConcerts, listArtists, listConcerts, mapArtistIndex, mostWatchedConcerts } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const filters = parseFilters(await searchParams);
  const filtered = hasActiveFilters(filters) || filters.sort !== "newest";
  return {
    title: filters.q ? `Concerts matching "${filters.q}"` : "All concerts",
    alternates: { canonical: "/concerts" },
    // Filtered views repeat content that has its own pages (artist, venue, genre).
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function HomePage({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  const browsing = hasActiveFilters(filters) || filters.sort !== "newest";
  const [options, results] = await Promise.all([filterOptions(), listConcerts(filters)]);

  const browse = (
    <section className={`od-section${browsing ? " od-section--first" : ""}`} aria-labelledby="all-concerts" data-od="browse">
      <SectionHead
        id="all-concerts"
        as={browsing ? "h1" : "h2"}
        title={browsing ? (filters.q ? `“${filters.q}”` : "Results") : "All concerts"}
        note={
          <span data-od="result-count" aria-live="polite">
            {results.total} {results.total === 1 ? "concert" : "concerts"} · {SORT_LABELS[filters.sort]}
          </span>
        }
        href={browsing ? "/" : undefined}
        linkLabel="Clear filters"
      />
      <FilterForm filters={filters} options={options} />
      {results.total === 0 ? (
        <div className="od-empty" data-od="empty">
          <p className="display">No concerts match</p>
          <p>Try another search, or drop a filter.</p>
          <Link href="/concerts" className="od-link">
            Clear the filters
          </Link>
        </div>
      ) : (
        <ConcertRows concerts={results.concerts} label="Concerts" />
      )}
    </section>
  );

  if (browsing) return <main data-od="home">{browse}</main>;

  const [featured, latest, mostWatched, artists, mapIndex] = await Promise.all([
    featuredConcert(),
    latestConcerts(5),
    mostWatchedConcerts(6),
    listArtists(),
    mapArtistIndex(),
  ]);
  // The acid strip announces the real latest upload; the hero is the daily featured pick.
  const newest = latest[0];
  // The nine artists with the most concerts; the tenth square is the "All artists" tile.
  const topArtists = [...artists].sort((a, b) => b.concerts - a.concerts || a.name.localeCompare(b.name)).slice(0, 9);

  return (
    <main data-od="home">
      <div className="od-strip meta" data-od="latest-strip">
        <h1>Free full-length electronic DJ concerts</h1>
        {newest && (
          <>
            <Link href={`/concerts/${newest.slug}`}>
              Latest upload: {newest.credits}
              {newest.venue ? ` — ${newest.venue.name}` : ""}
            </Link>
            <span>{formatDate(newest.publishedAt)}</span>
          </>
        )}
        <span className="od-strip-end">
          {results.total} concerts · {artists.length} artists
        </span>
      </div>

      {featured && (
        <section className="od-hero" aria-label="Featured today" data-od="hero">
          <Feature concert={featured} kicker="Featured today" flip credit sizes={SIZES.hero} />
        </section>
      )}

      <section className="od-section" aria-labelledby="latest" data-od="latest">
        <SectionHead
          id="latest"
          title="Latest uploads"
          note={count2(latest.length)}
          href={`/concerts${filtersToQuery({ sort: "newest" })}#all-concerts`}
          linkLabel="All concerts"
        />
        <LeadGrid concerts={latest} label="Latest uploads" />
      </section>

      <section className="od-section" aria-labelledby="most-watched" data-od="most-watched">
        <SectionHead
          id="most-watched"
          title="Most watched"
          note="All-time"
          href={`/concerts${filtersToQuery({ sort: "most-viewed" })}`}
          linkLabel="Full chart"
        />
        <ChartList concerts={mostWatched} label="Most watched" />
      </section>

      <section className="od-section" aria-labelledby="by-genre" data-od="genres">
        <SectionHead id="by-genre" title="By genre" note={count2(options.genres.length)} href="/genres" linkLabel="All genres" />
        <GenreWords genres={options.genres} />
      </section>

      <section className="od-section od-section--bleed" aria-labelledby="artists" data-od="artists">
        <SectionHead id="artists" title="Artists" note={count2(artists.length)} href="/artists" linkLabel="A–Z index" />
        <ArtistSquares artists={topArtists} allTile={{ count: artists.length }} label="Artists" />
      </section>

      <section className="od-section" aria-labelledby="find-map" data-od="map-search-home">
        <SectionHead id="find-map" title="Find your next DJ" note="Type an artist, find the ones around them" />
        <MapSearch artists={mapIndex} id="home-map-q" lead />
      </section>

      {browse}
    </main>
  );
}
