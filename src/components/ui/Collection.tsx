import { ArchiveRows, ChartList, Feature, LeadGrid } from "@/components/catalogue/SetTile";
import { computeArtistStats } from "@/lib/artist-stats";
import type { SetView } from "@/lib/queries";
import { compactNumber } from "@/lib/site";
import { count2, SectionHead } from "./SectionHead";

/** The four figures shown on venue and genre pages. */
export function collectionStats(sets: SetView[]) {
  const stats = computeArtistStats(sets);
  const artists = new Set(sets.flatMap((s) => s.artists.map((a) => a.slug))).size;
  return [
    { label: stats.sets === 1 ? "Full set" : "Full sets", value: String(stats.sets).padStart(2, "0") },
    { label: "Of music", value: `${stats.hours}h` },
    { label: "Total views", value: compactNumber(stats.totalViews) },
    { label: artists === 1 ? "Artist" : "Artists", value: String(artists).padStart(2, "0") },
  ];
}

/** "2013–2026", or "2026" when everything is from one year. */
export function yearRange(sets: SetView[]): string {
  const years = sets.map((s) => s.publishedAt.getUTCFullYear());
  if (years.length === 0) return "";
  const first = Math.min(...years);
  const last = Math.max(...years);
  return first === last ? String(last) : `${first}–${last}`;
}

/**
 * The body of a venue or genre page, built from the same parts as the artist page:
 * the latest set shown large, then Latest uploads (lead + stack), Most watched (chart)
 * and Every set (archive rows). Sections only appear when there are enough sets to fill them.
 */
export function CollectionBody({ sets, name }: { sets: SetView[]; name: string }) {
  if (sets.length === 0) return null;
  const [latest, ...rest] = sets;
  const mostWatched = [...sets].sort((a, b) => b.viewCount - a.viewCount || a.id - b.id).slice(0, 5);
  return (
    <>
      <section className="od-section" style={{ paddingTop: "clamp(28px, 4vw, 56px)" }} aria-label="Latest upload" data-od="latest">
        <Feature set={latest} kicker={sets.length === 1 ? "The set" : "Latest upload"} />
      </section>
      {rest.length > 0 && (
        <section className="od-section" aria-labelledby="more" data-od="more">
          <SectionHead id="more" title="Latest uploads" note={count2(Math.min(rest.length, 5))} />
          <LeadGrid sets={rest.slice(0, 5)} label={`More sets, ${name}`} />
        </section>
      )}
      {sets.length >= 4 && (
        <section className="od-section" aria-labelledby="most-watched" data-od="most-watched">
          <SectionHead id="most-watched" title="Most watched" note="All-time" />
          <ChartList sets={mostWatched} label="Most watched" />
        </section>
      )}
      {sets.length >= 6 && (
        <section className="od-section" aria-labelledby="every-set" data-od="archive">
          <SectionHead id="every-set" title="Every set" note={`${count2(sets.length)} · ${yearRange(sets)}`} />
          <ArchiveRows sets={sets} label={`Every set, ${name}`} />
        </section>
      )}
    </>
  );
}
