// Every gig: the full list, with search, filters and sorting. The header's "find a gig:" lands here.
import type { Metadata } from "next";
import Link from "next/link";
import { GigFilters } from "@/components/gig/GigFilters";
import { GigRows } from "@/components/gig/GigRows";
import { EmptyNote, PageHead } from "@/components/gig/PageHead";
import { RisingLinks } from "@/components/seo/RisingLinks";
import { gigs } from "@/components/gig/words";
import { hasActiveFilters, parseFilters, SORT_LABELS } from "@/lib/filters";
import { filterOptions, listConcerts } from "@/lib/queries";
import { robotsFor } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const filters = parseFilters(await searchParams);
  const filtered = hasActiveFilters(filters) || filters.sort !== "newest";
  return {
    title: filters.q
      ? `Concerts matching "${filters.q}"`
      : filters.source === "bootleg"
        ? "Rock Concert Bootlegs · Pro-Shot Full Shows"
        : "Every Full Rock Concert · Search and Sort",
    description:
      "Every full rock concert on STAGEDIVE in one list, the entire concert each time, not clips: watch whole shows online, search by band, venue or year, or sort by length and views.",
    alternates: { canonical: "/concerts" },
    // Filtered views repeat content that has its own pages (band, venue, genre): noindex, follow.
    robots: robotsFor(!filtered),
  };
}

export default async function ConcertsPage({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  const browsing = hasActiveFilters(filters);
  const [options, results] = await Promise.all([filterOptions(), listConcerts(filters)]);
  const shown = results.concerts.length;
  const query = filters.q ? `“${filters.q}”` : null;

  return (
    <main data-od="home" className="pg">
      <PageHead
        trail={[{ label: "Every gig", href: browsing ? "/concerts" : undefined }, ...(browsing ? [{ label: query ?? "Sorted out" }] : [])]}
        lines={query ? ["Looking for", query] : browsing ? ["Sorted", "out"] : ["Every", "full gig"]}
        data={
          <span data-od="result-count" aria-live="polite">
            {gigs(results.total)} /// {SORT_LABELS[filters.sort]} first
          </span>
        }
        note={browsing ? undefined : "the whole wall, top to bottom"}
      />

      <section className="pg-section" aria-label="Search and sort" data-od="browse">
        <GigFilters filters={filters} options={options} />
        {/* Unstyled for now (designer): the full concerts in HD (src/lib/hd.ts). */}
        <p className="pg-thin" data-od="concerts-hd">
          <Link href="/hd">Full concerts in HD</Link>
        </p>
      </section>

      {/* Pages climbing in search (src/lib/rising.ts), on the unfiltered list only. Unstyled for now (designer). */}
      {!browsing && <RisingLinks />}

      <section className="pg-section pg-section--cut" aria-label="Gigs">
        {results.total === 0 ? (
          <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
            <p>Check the spelling or yell a different band.</p>
            <Link href="/concerts" className="hm-more">
              SHOW EVERY GIG &gt;&gt;
            </Link>
          </EmptyNote>
        ) : (
          <>
            <GigRows concerts={results.concerts} label="Gigs" lead="year" />
            {results.total > shown && (
              <p className="zn-marker pg-thin">
                that&rsquo;s the first {shown} of {results.total}. search or pick a pile for the rest.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
