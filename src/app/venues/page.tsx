import type { Metadata } from "next";
import Link from "next/link";
import { SIZES } from "@/components/catalogue/SetTile";
import { count2, SectionHead } from "@/components/ui/SectionHead";
import { listVenues } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Festivals",
  description: "Festivals with full-length DJ sets on FullDJSet.",
  alternates: { canonical: "/venues" },
};

export default async function VenuesPage() {
  const venues = await listVenues();
  return (
    <main data-od="venues-index">
      <section className="od-section od-section--first">
        <SectionHead as="h1" title="Festivals" note={`${count2(venues.length)} · A–Z`} />
        {venues.length === 0 ? (
          <div className="od-empty" data-od="empty">
            <p className="display">No festivals yet</p>
          </div>
        ) : (
          <ul className="od-rows" aria-label="Festivals">
            {venues.map((v) => {
              // The picture is the venue's most recent set.
              const image = v.cover?.thumbnail;
              return (
                <li key={v.slug}>
                  <Link href={`/venues/${v.slug}`} className="od-index-row">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image.src} srcSet={image.srcSet} sizes={SIZES.row} alt="" loading="lazy" />
                    ) : (
                      // No picture: the initial, outlined, in a hairline frame.
                      <span className="od-index-noimg display" aria-hidden="true">
                        {v.name.charAt(0)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="od-index-name title">{v.name}</span>
                      <span className="od-index-sub meta">{[v.city, v.country].filter(Boolean).join(", ") || "Location not listed"}</span>
                    </span>
                    <span className="od-index-count display">
                      {String(v.sets).padStart(2, "0")}
                      <small className="meta">{v.sets === 1 ? "set" : "sets"}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
