// Decades index: every decade that has a concert, by the year it was played (not uploaded).
// Structure only; the look comes from the design step (design/brandbook, board 04 "Pick a decade").
import type { Metadata } from "next";
import Link from "next/link";
import { count2, SectionHead } from "@/components/ui/SectionHead";
import { decadeIndex } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Decades",
  description: "Full rock concerts by the decade they were played: the eighties, the nineties and on, free to watch.",
  alternates: { canonical: "/decades" },
};

export default async function DecadesPage() {
  const decades = await decadeIndex();
  return (
    <main data-od="decades-index">
      <section className="od-section od-section--first">
        <SectionHead as="h1" title="Pick a decade" note={count2(decades.length)} />
        {decades.length === 0 ? (
          <div className="od-empty" data-od="empty">
            <p>Nothing. Not even a bootleg.</p>
          </div>
        ) : (
          <ul aria-label="Decades">
            {decades.map((d) => (
              <li key={d.start}>
                <Link href={`/decades/${d.label}`}>
                  <span>{d.label}</span> <span>{d.count === 1 ? "1 gig" : `${d.count} gigs`}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
