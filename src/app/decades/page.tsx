// Decades index: every decade that has a concert, by the year it was played (not uploaded).
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { EmptyNote, PageHead } from "@/components/gig/PageHead";
import { gigs } from "@/components/gig/words";
import { DECADE_LINES } from "@/lib/home";
import { decadeIndex } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Decades",
  description: "Full rock concerts by the decade they were played: the eighties, the nineties and on, free to watch.",
  alternates: { canonical: "/decades" },
};

// No pink here: the "Decades" label in the header is the pink thing on this page.
const TONES = ["black", "white"] as const;
const TILTS = [-2, 1.5, -1, 2, -1.5, 1, -2];

export default async function DecadesPage() {
  const decades = await decadeIndex();
  const total = decades.reduce((n, d) => n + d.count, 0);
  return (
    <main data-od="decades-index" className="pg">
      <PageHead
        trail={[{ label: "Decades" }]}
        lines={["Pick a", "decade"]}
        data={decades.length ? `${decades.length} ${decades.length === 1 ? "decade" : "decades"} /// ${gigs(total)} /// by the year they were played` : undefined}
      />
      {decades.length === 0 ? (
        <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
          <p>No decade has a gig on the wall yet.</p>
        </EmptyNote>
      ) : (
        <section className="pg-section">
          <ul className="hm-decades pg-decades" data-few={decades.length <= 4 || undefined} style={{ "--n": Math.min(decades.length, 4) } as CSSProperties}>
            {decades.map((d, i) => (
              <li key={d.start}>
                <Link
                  href={`/decades/${d.label}`}
                  className="hm-decade zn-lift"
                  data-tone={TONES[i % 2]}
                  style={{ "--tilt": `${TILTS[i % TILTS.length]}deg` } as CSSProperties}
                >
                  <span className="hm-decade-top">
                    <span className="hm-decade-n" aria-hidden="true">
                      {d.label.slice(2, 4)}
                    </span>
                    <span className="od-sr">The {d.label}: </span>
                    <span className="zn-data">{gigs(d.count)}</span>
                  </span>
                  {DECADE_LINES[d.label] && <span className="hm-decade-line">{DECADE_LINES[d.label]}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
