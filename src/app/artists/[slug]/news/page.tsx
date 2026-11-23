// A band's news (owner, 22 Nov 2026): /artists/<slug>/news, every news story about the band, newest first,
// built by itself from the articles (src/lib/news). Answer-first lead and "Is <band> touring?" from the
// articles we hold only; links back to the band's full concerts. Indexed from two articles
// (bandNewsIsStrong); with one it is noindex,follow and out of the sitemap; with none it does not exist.
// Served ready-made, rebuilt at most every 10 minutes.
// Look: src/styles/pages.css "News by topic and by band". Hooks: data-od="band-news", "page-lead", "band-news-touring", "news-list",
// "news-item", "band-news-watch".
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/gig/PageHead";
import { cutName } from "@/components/gig/words";
import { NewsList } from "@/components/news/NewsList";
import { JsonLd } from "@/components/seo/JsonLd";
import { bandNewsIsStrong, bandNewsPath, bandNewsTitle } from "@/lib/news/hubs";
import { getBandNews } from "@/lib/news/queries";
import { watchLine } from "@/lib/news/seo";
import { clip, robotsFor, shareImages } from "@/lib/seo";
import { breadcrumbs, itemList } from "@/lib/structured-data";

export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

const load = cache((slug: string) => getBandNews(slug));
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return {};
  const { band, lead, total } = page;
  const path = bandNewsPath(band.slug);
  const title = bandNewsTitle(band.name);
  const description = clip(lead);
  return {
    title,
    description,
    alternates: { canonical: path, types: { "application/rss+xml": "/news/feed.xml" } },
    robots: robotsFor(bandNewsIsStrong(total)),
    openGraph: { title, description, url: path, images: shareImages(band.cover?.thumbnail.src) },
  };
}

export default async function BandNewsPage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const { band, articles, lead, touring } = page;
  const path = bandNewsPath(band.slug);
  return (
    <main data-od="band-news" className="pg nw nw-band">
      <JsonLd
        data={[
          breadcrumbs([
            ["Home", "/"],
            ["Bands", "/artists"],
            [band.name, `/artists/${band.slug}`],
            ["News", path],
          ]),
          itemList(`${band.name} news`, articles.map((a) => ({ path: `/news/${a.slug}`, name: a.title }))),
        ]}
      />
      <PageHead trail={[{ label: "Bands", href: "/artists" }, { label: band.name, href: `/artists/${band.slug}` }, { label: "News" }]} lines={[...cutName(band.name), "News"]}>
        {/* AEO: the answer-first lead, built from the articles we hold. */}
        <p className="pg-lead" data-od="page-lead">
          {lead}
        </p>
      </PageHead>
      {touring && (
        // The touring answer, only when a tour story of the last six months exists.
        <section aria-labelledby="band-news-touring" className="nw-touring" data-od="band-news-touring">
          <h2 id="band-news-touring">{touring.question}</h2>
          <p>
            {touring.answer}{" "}
            {touring.link && <Link href={touring.link.href}>{touring.link.text}</Link>}
          </p>
        </section>
      )}
      <section className="pg-section">
        <NewsList items={articles} label={`${band.name} news`} />
      </section>
      <p className="nw-all" data-od="band-news-watch">
        <Link href={`/artists/${band.slug}`} className="nw-all-watch">
          {watchLine(band.name, band.concerts)}
        </Link>{" "}
        <Link href="/news">All news</Link>
      </p>
    </main>
  );
}
