// The news list (owner, 21 Nov 2026): short original articles about the bands and festivals on the site,
// from the rock press in our own words (src/lib/news), newest first. Page 1 is /news, later pages
// /news/page/<n> (served ready-made; no query string). Structure only; the look is the designer's.
// Hooks: data-od="news-index", "page-lead", "news-list", "news-item", "pagination", "news-feed-link".
import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/gig/PageHead";
import { NewsList } from "@/components/news/NewsList";
import { JsonLd } from "@/components/seo/JsonLd";
import { listNews } from "@/lib/news/queries";
import { NEWS_INDEX_DESCRIPTION, NEWS_INDEX_TITLE, newsIndexLead } from "@/lib/news/seo";
import { robotsFor, SHARE_FALLBACK_IMAGE, shareImages } from "@/lib/seo";
import { breadcrumbs, itemList } from "@/lib/structured-data";

export const newsPagePath = (page: number) => (page > 1 ? `/news/page/${page}` : "/news");

export async function newsIndexMetadata(page: number): Promise<Metadata> {
  const { total, pages } = await listNews({ page });
  if (page > pages) return {};
  return {
    title: page > 1 ? `Rock News · Page ${page}` : NEWS_INDEX_TITLE,
    description: NEWS_INDEX_DESCRIPTION,
    alternates: { canonical: newsPagePath(page), types: { "application/rss+xml": "/news/feed.xml" } },
    // Later pages are lists of links: followed, not indexed. An empty list is not indexed either.
    robots: robotsFor(page === 1 && total > 0),
    openGraph: { title: NEWS_INDEX_TITLE, description: NEWS_INDEX_DESCRIPTION, url: newsPagePath(page), images: shareImages(SHARE_FALLBACK_IMAGE) },
  };
}

export async function NewsIndex({ page: wanted }: { page: number }) {
  const { articles, page, pages } = await listNews({ page: wanted });
  const names = [...new Set(articles.flatMap((a) => (a.cover ? [a.cover.of] : a.venueName ? [a.venueName] : [])))];
  return (
    <main data-od="news-index" className="pg nw">
      <JsonLd
        data={[
          breadcrumbs([["Home", "/"], ["News", "/news"], ...(page > 1 ? [[`Page ${page}`, newsPagePath(page)] as [string, string]] : [])]),
          articles.length ? itemList("Rock news", articles.map((a) => ({ path: `/news/${a.slug}`, name: a.title }))) : null,
        ]}
      />
      <PageHead trail={[{ label: "News", href: page > 1 ? "/news" : undefined }, ...(page > 1 ? [{ label: `Page ${page}` }] : [])]} lines={["News"]}>
        {/* AEO: the answer-first lead. */}
        <p className="pg-lead" data-od="page-lead">
          {newsIndexLead(names)}
        </p>
      </PageHead>
      {articles.length === 0 ? (
        <section className="pg-section" data-od="empty">
          <p>No news yet.</p>
          <p>
            <Link href="/artists">Bands</Link> · <Link href="/venues">Fields + Rooms</Link>
          </p>
        </section>
      ) : (
        <section className="pg-section">
          <NewsList items={articles} label="News" />
        </section>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="nw-pages" data-od="pagination">
          {page > 1 && <Link href={newsPagePath(page - 1)}>Newer</Link>}{" "}
          <span>
            Page {page} of {pages}
          </span>{" "}
          {page < pages && <Link href={newsPagePath(page + 1)}>Older</Link>}
        </nav>
      )}
      <p className="nw-feed">
        <a href="/news/feed.xml" data-od="news-feed-link">
          News RSS feed
        </a>
      </p>
    </main>
  );
}
