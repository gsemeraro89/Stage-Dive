// A "best of" ranking (src/lib/best.ts): the most watched full rock concerts overall, of a decade, a
// genre or a kind of place, by views on YouTube. Re-ranked by itself after every refresh (views) and
// collector run (new concerts). Indexed from ten concerts.
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Collection, pileData } from "@/components/gig/Collection";
import { PageHead, TagLinks } from "@/components/gig/PageHead";
import { cutName } from "@/components/gig/words";
import { JsonLd } from "@/components/seo/JsonLd";
import { bestHeading, bestIsStrong, bestLead, bestPath, bestSearchTitle } from "@/lib/best";
import { bestCatalogue, getBestPage } from "@/lib/queries";
import { clip, robotsFor, shareImages } from "@/lib/seo";
import { breadcrumbs, itemList } from "@/lib/structured-data";

// One database read per request, shared by the page and its title/description.
const load = cache(getBestPage);

// Built on its first visit, then served ready-made and rebuilt at most every 10 minutes.
export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return {};
  const { list, concerts } = page;
  const title = bestSearchTitle(list);
  const description = clip(bestLead(list, concerts));
  const path = bestPath(list.slug);
  return {
    title,
    description,
    alternates: { canonical: path, types: { "text/markdown": `${path}.md` } },
    robots: robotsFor(bestIsStrong(list)),
    openGraph: { title, description, url: path, images: shareImages(concerts[0]?.thumbnail.src) },
  };
}

export default async function BestPage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { list, concerts } = page;
  const heading = bestHeading(list);
  const path = bestPath(list.slug);
  // The other rankings of the same kind that are worth a visit (ten concerts or more).
  const others = (await bestCatalogue()).filter((l) => l.slug !== list.slug && bestIsStrong(l) && (l.kind === list.kind || l.kind === "all"));
  return (
    <main data-od="best" className="pg">
      <JsonLd
        data={[
          breadcrumbs([
            ["Home", "/"],
            ["Most watched", "/best"],
            [heading, path],
          ]),
          itemList(heading, concerts.map((c) => ({ path: `/concerts/${c.slug}`, name: c.credits })), true),
        ]}
      />
      <PageHead trail={[{ label: "Most watched", href: "/best" }, { label: list.label }]} lines={cutName(heading, 16)} data={<span data-od="result-count">{pileData(concerts)}</span>}>
        <p className="pg-lead" data-od="best-lead">
          {bestLead(list, concerts)}
        </p>
      </PageHead>
      <Collection concerts={concerts} title={`Top ${concerts.length}`} label={heading} lead="rank">
        <TagLinks label="More rankings" items={others.map((l) => ({ href: bestPath(l.slug), label: l.label }))} />
        <Link href="/best" className="hm-more" data-od="best-all">
          EVERY RANKING &gt;&gt;
        </Link>
      </Collection>
    </main>
  );
}
