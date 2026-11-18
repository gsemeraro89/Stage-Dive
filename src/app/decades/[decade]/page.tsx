// Decade page: every concert played in that decade, oldest first.
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Collection, pileData } from "@/components/gig/Collection";
import { EmptyNote, PageHead, TagLinks } from "@/components/gig/PageHead";
import { parseDecade } from "@/lib/catalogue";
import { DECADE_LINES } from "@/lib/home";
import { decadeIndex, getDecadePage } from "@/lib/queries";

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
  const others = (await decadeIndex()).filter((d) => d.label !== page.label);
  const otherDecades = <TagLinks label={"Other decades"} items={others.map((d) => ({ href: `/decades/${d.label}`, label: d.label }))} />;
  return (
    <main data-od="decade" className="pg">
      <PageHead
        trail={[{ label: "Decades", href: "/decades" }, { label: page.label }]}
        lines={["The", page.label]}
        data={<span data-od="result-count">{pileData(page.concerts)}</span>}
        note={DECADE_LINES[page.label]}
      />
      {page.concerts.length === 0 ? (
        <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
          <p>Nothing from the {page.label} is on the wall yet.</p>
          {otherDecades}
        </EmptyNote>
      ) : (
        <Collection concerts={page.concerts} label={`Every gig from the ${page.label}`}>
          {otherDecades}
        </Collection>
      )}
    </main>
  );
}
