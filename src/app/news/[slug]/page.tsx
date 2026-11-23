// One news article (owner, 21 Nov 2026). Server-rendered text in our own words, the source named and
// linked, NewsArticle structured data, and links into the catalogue: the band and festival pages and a
// few of their concerts ("Watch <band>'s full concerts"). Structure only; the look is the designer's.
// Hooks: data-od="news-article", "news-title", "page-lead", "news-date", "news-picture", "news-body",
// "news-source", "news-watch", "news-hub-link" (its topic page, e.g. /news/tours), "news-more".
// Visual news (owner, 23 Nov 2026; unstyled for now, designer): "news-topic" (the topic stamp, data-topic),
// "news-figure" (data-kind = band-photo | festival-photo | band-concert | festival-concert) and
// "news-picture-credit" (a Commons photo's author, licence and link, required next to the photo).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Crumbs } from "@/components/gig/PageHead";
import { NewsList, newsDate } from "@/components/news/NewsList";
import { JsonLd } from "@/components/seo/JsonLd";
import { hubForTopic, newsHubPath } from "@/lib/news/hubs";
import { getNewsArticle } from "@/lib/news/queries";
import { newsArticleJsonLd, newsIsStrong, newsSearchTitle, watchLine } from "@/lib/news/seo";
import { clip, robotsFor, shareImages } from "@/lib/seo";
import { breadcrumbs } from "@/lib/structured-data";

export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

const load = cache(getNewsArticle);
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return {};
  const { article: a, cover } = page;
  const path = `/news/${a.slug}`;
  return {
    title: { absolute: newsSearchTitle(a.title) },
    description: clip(a.lead),
    alternates: { canonical: path, types: { "text/markdown": `${path}.md` } },
    robots: robotsFor(newsIsStrong(a)),
    openGraph: {
      type: "article",
      url: path,
      title: a.title,
      description: clip(a.lead),
      publishedTime: a.publishedAt.toISOString(),
      modifiedTime: a.updatedAt.toISOString(),
      // The story's own picture (src/lib/news/covers.ts), else the site's card (never the source's picture).
      images: shareImages(cover?.src),
    },
  };
}

export default async function NewsArticlePage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { article: a, bands, festival, cover, topicLabel, more } = page;
  const path = `/news/${a.slug}`;
  // The topic page the article belongs to (/news/tours...), in the breadcrumbs and as a link.
  const hub = hubForTopic(a.topic);
  return (
    <main data-od="news-article" className="pg nw-article">
      <JsonLd
        data={[
          newsArticleJsonLd(a, { image: cover?.src, bands, festival }),
          breadcrumbs([
            ["Home", "/"],
            ["News", "/news"],
            ...(hub ? [[hub.label, newsHubPath(hub.slug)] as [string, string]] : []),
            [a.title, path],
          ]),
        ]}
      />
      <article>
        <header className="nw-head">
          <Crumbs trail={[{ label: "News", href: "/news" }, ...(hub ? [{ label: hub.label, href: newsHubPath(hub.slug) }] : []), { label: a.title }]} />
          {/* The topic stamp ("Tour", "Live album"...). Unstyled for now (designer). */}
          <p className="nw-topic" data-od="news-topic" data-topic={a.topic}>
            {topicLabel}
          </p>
          <h1 className="nw-title" data-od="news-title">
            {a.title}
          </h1>
          {/* AEO: the answer-first lead, also the description. */}
          <p className="pg-lead nw-lead" data-od="page-lead">
            {a.lead}
          </p>
          <p className="nw-date" data-od="news-date">
            <time dateTime={a.publishedAt.toISOString()}>{newsDate(a.publishedAt)}</time>
          </p>
        </header>

        {cover && (
          <figure className="nw-figure" data-od="news-figure" data-kind={cover.kind}>
            {/* Our own picture: the band's or festival's free photo, else a frame of their concert here. Never the source's. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover.src}
              srcSet={cover.srcSet}
              sizes={cover.srcSet ? "(min-width: 1001px) 60vw, 100vw" : undefined}
              width={cover.width}
              height={cover.height}
              alt={cover.of}
              className="nw-picture"
              data-od="news-picture"
            />
            {cover.credit && (
              // CC licences: author, licence and a link next to the photo. Unstyled for now (designer).
              <figcaption className="nw-credit" data-od="news-picture-credit">
                <a href={cover.credit.sourcePage} rel="noopener" target="_blank">
                  {cover.credit.line}
                  <span className="od-sr"> (opens in a new tab)</span>
                </a>
              </figcaption>
            )}
          </figure>
        )}

        <div className="nw-body" data-od="news-body">
          {a.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {a.sourceUrl && (
          <p className="nw-source" data-od="news-source">
            Source:{" "}
            <a href={a.sourceUrl} rel="noopener" target="_blank">
              {a.sourceName ?? new URL(a.sourceUrl).hostname}
              <span className="od-sr"> (opens in a new tab)</span>
            </a>
          </p>
        )}

        {(bands.length > 0 || festival) && (
          <section aria-labelledby="news-watch" className="nw-watch" data-od="news-watch">
            <h2 id="news-watch">Now watch the whole set</h2>
            {bands.map((b) => (
              <div key={b.slug} className="nw-watch-group" data-band={b.slug}>
                <p>
                  <Link href={`/artists/${b.slug}`} className="nw-watch-link">
                    {watchLine(b.name, b.concerts)}
                  </Link>
                </p>
                {b.watch.length > 0 && (
                  <ul aria-label={`Concerts by ${b.name}`}>
                    {b.watch.map((c) => (
                      <li key={c.slug}>
                        <Link href={`/concerts/${c.slug}`}>{[c.credits, c.venue && `at ${c.venue}`, c.year].filter(Boolean).join(" ")}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {festival && (
              <div className="nw-watch-group" data-venue={festival.slug}>
                <p>
                  <Link href={`/venues/${festival.slug}`} className="nw-watch-link">
                    Full concerts from {festival.name}
                  </Link>
                </p>
                {festival.watch.length > 0 && (
                  <ul aria-label={`Concerts at ${festival.name}`}>
                    {festival.watch.map((c) => (
                      <li key={c.slug}>
                        <Link href={`/concerts/${c.slug}`}>{[c.credits, c.year].filter(Boolean).join(" ")}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}
      </article>

      {more.length > 0 && (
        <section aria-labelledby="news-more" className="nw-more" data-od="news-more">
          <h2 id="news-more">More news</h2>
          <NewsList items={more} label="More news" pictures={false} leads={false} />
        </section>
      )}
      <p className="nw-all">
        {hub && (
          // The article's topic page.
          <>
            <Link href={newsHubPath(hub.slug)} data-od="news-hub-link">
              {hub.more}
            </Link>{" "}
          </>
        )}
        <Link href="/news">All news</Link>
      </p>
    </main>
  );
}
