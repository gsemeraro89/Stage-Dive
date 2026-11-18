// Tours index: every tour with a concert on the site.
import type { Metadata } from "next";
import Link from "next/link";
import { count2, SectionHead } from "@/components/ui/SectionHead";
import { listTours } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tours",
  description: "Full rock concerts by tour, free to watch.",
  alternates: { canonical: "/tours" },
};

export default async function ToursPage() {
  const tours = await listTours();
  return (
    <main data-od="tours-index">
      <section className="od-section od-section--first">
        <SectionHead as="h1" title="Tours" note={count2(tours.length)} />
        {tours.length === 0 ? (
          <div className="od-empty" data-od="empty">
            <p>No tours on the wall yet.</p>
          </div>
        ) : (
          <ul aria-label="Tours">
            {tours.map((t) => (
              <li key={t.slug}>
                <Link href={`/tours/${t.slug}`}>
                  <span>{t.name}</span>
                  {t.artist && <span> /// {t.artist.name}</span>}
                  <span> /// {t.count === 1 ? "1 gig" : `${t.count} gigs`}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
