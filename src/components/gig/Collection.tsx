// The body shared by every "pile of gigs" page (a field or room, a decade, a genre, a tour): the gigs
// as rows, and a clean sheet with who is in the pile. Styles: src/styles/pages.css.
import Link from "next/link";
import type { ReactNode } from "react";
import { Sheet } from "@/components/zine";
import type { ConcertView } from "@/lib/queries";
import { GigRows } from "./GigRows";
import { SectionTitle } from "./PageHead";
import { gigs, hoursOf, yearSpan } from "./words";

/** "6 GIGS /// 7 HOURS /// 1994–2012" */
export function pileData(concerts: ConcertView[]): string {
  return [gigs(concerts.length), concerts.length ? hoursOf(concerts) : null, yearSpan(concerts)].filter(Boolean).join(" /// ");
}

export function Collection({
  concerts,
  title,
  label,
  lead = "year",
  children,
}: {
  concerts: ConcertView[];
  /** The strip over the rows: "6 full gigs". */
  title?: string;
  /** Names the list for screen readers. */
  label: string;
  lead?: "year" | "rank" | "none";
  /** Extra pieces for the side column, under the bands. */
  children?: ReactNode;
}) {
  // The bands in the pile, most gigs first.
  const bands = new Map<string, { slug: string; name: string; count: number }>();
  for (const c of concerts)
    for (const a of c.artists)
      if (a.role === "MAIN" && a.hasPage) bands.set(a.slug, { slug: a.slug, name: a.name, count: (bands.get(a.slug)?.count ?? 0) + 1 });
  const bill = [...bands.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const shown = bill.slice(0, 24);

  return (
    <div className="pg-pile">
      <section aria-labelledby="pile-gigs" data-od="archive">
        <div className="pg-block-head">
          <SectionTitle id="pile-gigs">{title ?? (concerts.length === 1 ? "1 full gig" : `${concerts.length} full gigs`)}</SectionTitle>
        </div>
        <GigRows concerts={concerts} label={label} lead={lead} />
        {concerts.length === 1 && <p className="zn-marker pg-thin">one so far. more when we find them.</p>}
      </section>
      <div className="pg-pile-side">
        {shown.length > 0 && (
          <Sheet as="aside" title="On the bill" level={2} tilt={1} label="Bands on this page">
            <ul className="pg-list">
              {shown.map((b) => (
                <li key={b.slug}>
                  <Link href={`/artists/${b.slug}`}>
                    <span className="pg-list-name">{b.name}</span>
                    <span className="zn-data">{gigs(b.count)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {bill.length > shown.length && <p className="zn-label pg-list-more">and {bill.length - shown.length} more, in the rows</p>}
          </Sheet>
        )}
        {children}
      </div>
    </div>
  );
}
