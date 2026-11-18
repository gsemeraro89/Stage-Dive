// Decade page: every concert played in that decade, oldest first.
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { CollectionBody } from "@/components/ui/Collection";
import { parseDecade } from "@/lib/catalogue";
import { getDecadePage } from "@/lib/queries";

const load = cache(async (label: string) => {
  const start = parseDecade(label);
  return start === null ? null : getDecadePage(start);
});

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ decade: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).decade);
  if (!page) return {};
  const bands = [...new Set(page.concerts.flatMap((c) => c.artists.map((a) => a.name)))].slice(0, 4).join(", ");
  return {
    title: `The ${page.label} — full rock concerts`,
    description: `${page.concerts.length} full ${page.concerts.length === 1 ? "gig" : "gigs"} played in the ${page.label}, free to watch${bands ? `: ${bands}` : ""}.`,
    alternates: { canonical: `/decades/${page.label}` },
    robots: page.concerts.length === 0 ? { index: false, follow: true } : undefined,
  };
}

export default async function DecadePage({ params }: Props) {
  const page = await load((await params).decade);
  if (!page) notFound();
  return (
    <main data-od="decade">
      <header className="od-pagehero">
        <p className="od-rail meta">
          <span>Decade</span>
          <span data-od="result-count">{page.concerts.length === 1 ? "1 gig" : `${page.concerts.length} gigs`}</span>
        </p>
        <h1>The {page.label}</h1>
      </header>
      {page.concerts.length === 0 ? (
        <section className="od-section">
          <div className="od-empty" data-od="empty">
            <p>Nothing from the {page.label} yet. Not even a bootleg.</p>
          </div>
        </section>
      ) : (
        <CollectionBody concerts={page.concerts} name={`the ${page.label}`} />
      )}
    </main>
  );
}
