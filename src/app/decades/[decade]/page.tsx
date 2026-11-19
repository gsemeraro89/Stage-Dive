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
import { JsonLd } from "@/components/seo/JsonLd";
import { decadeLead } from "@/lib/answers";
import { clip, decadeSearchTitle, hubIsStrong, robotsFor, shareImages } from "@/lib/seo";
import { breadcrumbs, itemList } from "@/lib/structured-data";

const load = cache(async (label: string) => {
  const start = parseDecade(label);
  return start === null ? null : getDecadePage(start);
});

// Built on its first visit, then served ready-made and rebuilt at most every 10 minutes.
export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ decade: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).decade);
  if (!page) return {};
  const title = decadeSearchTitle(page.label, page.concerts.some((c) => c.hasSetlist));
  const description = clip(decadeLead(page.label, page.concerts));
  const path = `/decades/${page.label}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: robotsFor(hubIsStrong(page.concerts.length)),
    openGraph: { title, description, url: path, images: shareImages(page.concerts[0]?.thumbnail.src) },
  };
}

export default async function DecadePage({ params }: Props) {
  const page = await load((await params).decade);
  if (!page) notFound();
  const others = (await decadeIndex()).filter((d) => d.label !== page.label);
  const otherDecades = <TagLinks label={"Other decades"} items={others.map((d) => ({ href: `/decades/${d.label}`, label: d.label }))} />;
  const path = `/decades/${page.label}`;
  return (
    <main data-od="decade" className="pg">
      <JsonLd
        data={[
          breadcrumbs([
            ["Home", "/"],
            ["Decades", "/decades"],
            [`The ${page.label}`, path],
          ]),
          page.concerts.length ? itemList(`Full rock concerts from the ${page.label}`, page.concerts.map((c) => ({ path: `/concerts/${c.slug}`, name: c.credits }))) : null,
        ]}
      />
      <PageHead
        trail={[{ label: "Decades", href: "/decades" }, { label: page.label }]}
        lines={["The", page.label]}
        data={<span data-od="result-count">{pileData(page.concerts)}</span>}
        note={DECADE_LINES[page.label]}
      >
        <p className="pg-lead" data-od="decade-lead">
          {decadeLead(page.label, page.concerts)}
        </p>
      </PageHead>
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
