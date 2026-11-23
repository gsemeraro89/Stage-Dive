// The small "Latest news" block on band and festival pages (owner, 21 Nov 2026). Structure only,
// unstyled (designer). Hooks: data-od="latest-news", class nw-latest.
import Link from "next/link";
import { NewsList, type NewsListEntry } from "./NewsList";

/** The small "Latest news" block on band and festival pages; nothing when there is no news. */
export function LatestNews({ items, about, moreHref = "/news", moreLabel = "All news" }: { items: NewsListEntry[]; about: string; moreHref?: string; moreLabel?: string }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="latest-news" data-od="latest-news" className="nw-latest">
      <h2 id="latest-news">Latest news</h2>
      {/* A compact row of picture clippings: no front page story, each picture once, headlines only. */}
      <NewsList items={items} label={`Latest news about ${about}`} leads={false} front={false} once={[]} />
      <Link href={moreHref} className="nw-latest-more">
        {moreLabel}
      </Link>
    </section>
  );
}
