import { ArchiveRows, ChartList, Feature, LeadGrid } from "@/components/catalogue/ConcertTile";
import { computeArtistStats } from "@/lib/artist-stats";
import type { ConcertView } from "@/lib/queries";
import { compactNumber } from "@/lib/site";
import { count2, SectionHead } from "./SectionHead";

/** The four figures shown on venue and genre pages. */
export function collectionStats(concerts: ConcertView[]) {
  const stats = computeArtistStats(concerts);
  const artists = new Set(concerts.flatMap((s) => s.artists.map((a) => a.slug))).size;
  return [
    { label: stats.concerts === 1 ? "Full concert" : "Full concerts", value: String(stats.concerts).padStart(2, "0") },
    { label: "Of music", value: `${stats.hours}h` },
    { label: "Total views", value: compactNumber(stats.totalViews) },
    { label: artists === 1 ? "Artist" : "Artists", value: String(artists).padStart(2, "0") },
  ];
}

/** "2013–2026", or "2026" when everything is from one year. */
export function yearRange(concerts: ConcertView[]): string {
  const years = concerts.map((s) => s.publishedAt.getUTCFullYear());
  if (years.length === 0) return "";
  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last ? String(last) : `${first}–${last}`;
}

/**
 * The body of a venue or genre page, built from the same parts as the artist page:
 * the latest concert shown large, then Latest uploads (lead + stack), Most watched (chart)
 * and Every concert (archive rows). Sections only appear when there are enough concerts to fill them.
 */
export function CollectionBody({ concerts, name }: { concerts: ConcertView[]; name: string }) {
  if (concerts.length === 0) return null;
  const [latest, ...rest] = concerts;
  const mostWatched = [...concerts].sort((a, b) => b.viewCount - a.viewCount || a.id - b.id).slice(0, 5);
  return (
    <>
      <section className="od-section" style={{ paddingTop: "clamp(28px, 4vw, 56px)" }} aria-label="Latest upload" data-od="latest">
        <Feature concert={latest} kicker={concerts.length === 1 ? "The concert" : "Latest upload"} />
      </section>
      {rest.length > 0 && (
        <section className="od-section" aria-labelledby="more" data-od="more">
          <SectionHead id="more" title="Latest uploads" note={count2(Math.min(rest.length, 5))} />
          <LeadGrid concerts={rest.slice(0, 5)} label={`More concerts, ${name}`} />
        </section>
      )}
      {concerts.length >= 4 && (
        <section className="od-section" aria-labelledby="most-watched" data-od="most-watched">
          <SectionHead id="most-watched" title="Most watched" note="All-time" />
          <ChartList concerts={mostWatched} label="Most watched" />
        </section>
      )}
      {concerts.length >= 6 && (
        <section className="od-section" aria-labelledby="every-concert" data-od="archive">
          <SectionHead id="every-concert" title="Every concert" note={`${count2(concerts.length)} · ${yearRange(concerts)}`} />
          <ArchiveRows concerts={concerts} label={`Every concert, ${name}`} />
        </section>
      )}
    </>
  );
}
