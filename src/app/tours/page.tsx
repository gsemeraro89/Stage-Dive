// Tours index: every tour with a concert on the site.
import type { Metadata } from "next";
import Link from "next/link";
import { PageHead, TagLinks } from "@/components/gig/PageHead";
import { gigs } from "@/components/gig/words";
import { Sheet, Tape } from "@/components/zine";
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
    <main data-od="tours-index" className="pg">
      <PageHead
        trail={[{ label: "Tours" }]}
        lines={["Tours"]}
        data={tours.length ? `${tours.length} ${tours.length === 1 ? "tour" : "tours"} /// gig after gig, in the order they played them` : undefined}
      />
      {tours.length === 0 ? (
        // No gig is filed under a tour yet: say so, and point at the piles that are full.
        <section className="pg-section pg-tours-empty" data-od="empty">
          <Sheet tilt={-1} fixings={<Tape at="top-left" tilt={-4} />} className="pg-note">
            <p className="zn-label">Tours /// nothing filed yet</p>
            <p className="pg-note-big">The van isn&rsquo;t loaded yet.</p>
            <p className="pg-note-text">
              When we know which tour a gig belongs to, it gets filed here, night after night, in the order the band played them. None of
              the gigs on the wall has a tour written on it yet. They are all still here, just in other piles.
            </p>
            <p className="zn-marker" data-size="big">
              try a band, a field or a decade.
            </p>
          </Sheet>
          <TagLinks
            label="The piles that are full"
            items={[
              { href: "/artists", label: "Bands" },
              { href: "/venues", label: "Fields + Rooms" },
              { href: "/decades", label: "Decades" },
              { href: "/genres", label: "Genres" },
              { href: "/concerts", label: "Every gig" },
            ]}
          />
        </section>
      ) : (
        <section className="pg-section">
          <ul className="pg-leaders pg-leaders--big" aria-label="Tours">
            {tours.map((t) => (
              <li key={t.slug}>
                <Link href={`/tours/${t.slug}`}>
                  <span className="pg-leaders-name">{t.name}</span>
                  <span className="pg-leaders-dots" aria-hidden="true" />
                  <span className="zn-data">{[t.artist?.name, gigs(t.count)].filter(Boolean).join(" /// ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
