// "Most watched": every "best of" ranking with ten concerts or more (src/lib/best.ts), overall, by
// decade, by genre and by kind of place. Grows by itself as the catalogue grows.
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyNote, PageHead } from "@/components/gig/PageHead";
import { JsonLd } from "@/components/seo/JsonLd";
import { bestHeading, bestIsStrong, bestPath, shownIn, type BestKind } from "@/lib/best";
import { bestCatalogue } from "@/lib/queries";
import { robotsFor } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";
import { breadcrumbs, itemList } from "@/lib/structured-data";

// Served ready-made, rebuilt in the background at most every 10 minutes.
export const revalidate = 600;

const LEAD = `Rankings of the most watched full rock concerts on ${SITE_NAME}: of all time, by decade, by genre and by kind of place, ranked by views on YouTube and updated every night.`;

export async function generateMetadata(): Promise<Metadata> {
  const lists = (await bestCatalogue()).filter(bestIsStrong);
  return {
    title: "Most Watched Rock Concerts · Rankings by Decade and Genre",
    description: LEAD,
    alternates: { canonical: "/best" },
    robots: robotsFor(lists.length > 0),
  };
}

const GROUPS: { kind: BestKind; title: string }[] = [
  { kind: "all", title: "All time" },
  { kind: "decade", title: "By decade" },
  { kind: "genre", title: "By genre" },
  { kind: "place", title: "By kind of place" },
];

export default async function BestIndexPage() {
  const lists = (await bestCatalogue()).filter(bestIsStrong);
  return (
    <main data-od="best-index" className="pg">
      <JsonLd
        data={[
          breadcrumbs([
            ["Home", "/"],
            ["Most watched", "/best"],
          ]),
          lists.length ? itemList("Rankings of the most watched rock concerts", lists.map((l) => ({ path: bestPath(l.slug), name: bestHeading(l) }))) : null,
        ]}
      />
      <PageHead trail={[{ label: "Most watched" }]} lines={["Most", "watched"]} note="by views on YouTube">
        <p className="pg-lead" data-od="best-index-lead">
          {LEAD}
        </p>
      </PageHead>
      {lists.length === 0 ? (
        <EmptyNote lines={["Nothing.", "Not even a bootleg."]}>
          <p>Not enough gigs on the wall to rank yet.</p>
        </EmptyNote>
      ) : (
        // Unstyled for now (designer): the rankings, grouped.
        <div className="pg-best" data-od="best-groups">
          {GROUPS.map((g) => {
            const rows = lists.filter((l) => l.kind === g.kind);
            if (!rows.length) return null;
            return (
              <section key={g.kind} aria-labelledby={`best-${g.kind}`} data-od={`best-${g.kind}`}>
                <h2 id={`best-${g.kind}`}>{g.title}</h2>
                <ul>
                  {rows.map((l) => (
                    <li key={l.slug}>
                      <Link href={bestPath(l.slug)}>
                        <span className="pg-list-name">{bestHeading(l)}</span> <span className="zn-data">top {shownIn(l)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
