// A news topic page (owner, 22 Nov 2026): /news/tours, /news/festivals, /news/live-albums,
// /news/new-music, /news/reunions. Built by itself from the articles' topic (src/lib/news/hubs.ts):
// an answer-first lead from the articles we hold, the articles newest first, and links to the bands' and
// festivals' concert pages. Indexed from three articles (newsHubIsStrong); thinner ones are noindex,follow
// and stay out of the sitemap. Served ready-made, rebuilt at most every 10 minutes.
// Unstyled for now (designer). Hooks: data-od="news-hub", "page-lead", "news-list", "news-item",
// "news-hub-watch", "news-hubs", "news-all-link".
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/gig/PageHead";
import { NewsList } from "@/components/news/NewsList";
import { JsonLd } from "@/components/seo/JsonLd";
import { NEWS_HUBS, newsHubIsStrong, newsHubPath } from "@/lib/news/hubs";
import { getNewsHub, newsHubCounts } from "@/lib/news/queries";
import { clip, robotsFor, shareImages } from "@/lib/seo";
import { breadcrumbs, itemList } from "@/lib/structured-data";
import { plural } from "@/lib/text";

const load = cache((slug: string) => getNewsHub(slug));

export async function newsHubMetadata(slug: string): Promise<Metadata> {
  const page = await load(slug);
  if (!page) return {};
  const { hub, year, lead, total, articles } = page;
  const path = newsHubPath(hub.slug);
  const title = hub.title(year);
  const description = clip(lead);
  return {
    title,
    description,
    alternates: { canonical: path, types: { "text/markdown": `${path}.md`, "application/rss+xml": "/news/feed.xml" } },
    robots: robotsFor(newsHubIsStrong(total)),
    // The newest story's own picture (a frame of its band's concert here), else the site's card.
    openGraph: { title, description, url: path, images: shareImages(articles.find((a) => a.cover)?.cover?.thumbnail.src) },
  };
}

export async function NewsHubPage({ slug }: { slug: string }) {
  const [page, counts] = await Promise.all([load(slug), newsHubCounts()]);
  if (!page) notFound();
  const { hub, year, lead, articles, bands, festivals } = page;
  const path = newsHubPath(hub.slug);
  const others = NEWS_HUBS.filter((h) => h.slug !== hub.slug && (counts.get(h.slug) ?? 0) > 0);
  return (
    <main data-od="news-hub" data-hub={hub.slug} className="pg nw nw-hub">
      <JsonLd
        data={[
          breadcrumbs([
            ["Home", "/"],
            ["News", "/news"],
            [hub.label, path],
          ]),
          articles.length ? itemList(hub.heading(year), articles.map((a) => ({ path: `/news/${a.slug}`, name: a.title }))) : null,
        ]}
      />
      <PageHead trail={[{ label: "News", href: "/news" }, { label: hub.label }]} lines={[hub.heading(year)]}>
        {/* AEO: the answer-first lead, built from the articles we hold. */}
        <p className="pg-lead" data-od="page-lead">
          {lead}
        </p>
      </PageHead>
      {articles.length === 0 ? (
        <section className="pg-section" data-od="empty">
          <p>No {hub.label.toLowerCase()} news yet.</p>
        </section>
      ) : (
        <section className="pg-section">
          <NewsList items={articles} label={hub.heading(year)} />
        </section>
      )}
      {(bands.length > 0 || festivals.length > 0) && (
        // Unstyled for now (designer): the bands and festivals in this news, each to its full concerts here.
        <section aria-labelledby="news-hub-watch" className="pg-section nw-hub-watch" data-od="news-hub-watch">
          <h2 id="news-hub-watch">Watch them live</h2>
          <ul>
            {bands.map((b) => (
              <li key={`b-${b.slug}`} data-band={b.slug}>
                <Link href={`/artists/${b.slug}`}>{b.name}</Link> <span>{plural(b.concerts, "full concert")}</span>
              </li>
            ))}
            {festivals.map((f) => (
              <li key={`f-${f.slug}`} data-venue={f.slug}>
                <Link href={`/venues/${f.slug}`}>{f.name}</Link> <span>{plural(f.concerts, "full concert")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <NewsHubLinks hubs={others} counts={counts} label="More news" />
      <p className="nw-all">
        <Link href="/news" data-od="news-all-link">
          All news
        </Link>
      </p>
    </main>
  );
}

/** Links to the news topic pages that have articles (the news list, the topic pages). Unstyled for now (designer). */
export function NewsHubLinks({ hubs, counts, label }: { hubs: typeof NEWS_HUBS; counts: Map<string, number>; label: string }) {
  if (!hubs.length) return null;
  return (
    <nav aria-label={label} className="nw-hubs" data-od="news-hubs">
      <ul>
        {hubs.map((h) => (
          <li key={h.slug}>
            <Link href={newsHubPath(h.slug)}>{h.label}</Link> <span>{counts.get(h.slug) ?? 0}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
