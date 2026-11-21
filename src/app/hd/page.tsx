// Full concerts in HD (src/lib/hd.ts): official concerts YouTube reports in high definition, most
// watched first. Grows and re-ranks by itself after every collector and refresh run. Indexed from ten.
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { Collection, pileData } from "@/components/gig/Collection";
import { EmptyNote, PageHead } from "@/components/gig/PageHead";
import { JsonLd } from "@/components/seo/JsonLd";
import { HD_HEADING, HD_PATH, HD_TITLE, hdIsStrong, hdLead } from "@/lib/hd";
import { getHdPage } from "@/lib/queries";
import { clip, robotsFor, shareImages } from "@/lib/seo";
import { breadcrumbs, itemList } from "@/lib/structured-data";

// One database read per request, shared by the page and its title/description.
const load = cache(getHdPage);

// Served ready-made, rebuilt in the background at most every 10 minutes.
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  const { total, concerts } = await load();
  const description = clip(hdLead(total, concerts));
  return {
    title: HD_TITLE,
    description,
    alternates: { canonical: HD_PATH, types: { "text/markdown": `${HD_PATH}.md` } },
    robots: robotsFor(hdIsStrong(total)),
    openGraph: { title: HD_TITLE, description, url: HD_PATH, images: shareImages(concerts[0]?.thumbnail.src) },
  };
}

export default async function HdPage() {
  const { total, concerts } = await load();
  return (
    <main data-od="hd" className="pg">
      <JsonLd
        data={[
          breadcrumbs([
            ["Home", "/"],
            [HD_HEADING, HD_PATH],
          ]),
          concerts.length ? itemList(HD_HEADING, concerts.map((c) => ({ path: `/concerts/${c.slug}`, name: c.credits })), true) : null,
        ]}
      />
      <PageHead trail={[{ label: "In HD" }]} lines={["Full concerts", "in HD"]} data={<span data-od="result-count">{pileData(concerts)}</span>}>
        <p className="pg-lead" data-od="hd-lead">
          {hdLead(total, concerts)}
        </p>
      </PageHead>
      {concerts.length === 0 ? (
        <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
          <p>No gig in HD on the wall yet.</p>
        </EmptyNote>
      ) : (
        <Collection concerts={concerts} title={total > concerts.length ? `Top ${concerts.length}` : `${concerts.length} in HD`} label={HD_HEADING} lead="rank">
          <Link href="/best" className="hm-more" data-od="hd-best">
            MOST WATCHED &gt;&gt;
          </Link>
        </Collection>
      )}
    </main>
  );
}
