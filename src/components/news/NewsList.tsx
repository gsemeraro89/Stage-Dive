// News items as a plain list (owner, 21 Nov 2026: news section). Structure only, unstyled: the look is
// the designer's (stagedive-designer). Hooks: data-od="news-list" / "news-item", classes nw-*.
// Used on /news, at the foot of an article ("More news") and on band and festival pages ("Latest news").
import Link from "next/link";
import type { NewsListItem } from "@/lib/news/queries";

export function newsDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export type NewsListEntry = Pick<NewsListItem, "id" | "slug" | "title" | "lead" | "publishedAt"> & { cover?: NewsListItem["cover"] };

export function NewsList({ items, label, pictures = true, leads = true }: { items: NewsListEntry[]; label: string; pictures?: boolean; leads?: boolean }) {
  return (
    <ul className="nw-list" data-od="news-list" aria-label={label}>
      {items.map((a) => (
        <li key={a.id} className="nw-item" data-od="news-item">
          <Link href={`/news/${a.slug}`} className="nw-item-link">
            {pictures && a.cover && (
              // Our own picture of the band or festival (a frame of its concert here), never the source's.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.cover.thumbnail.src} alt={a.cover.of} loading="lazy" className="nw-item-picture" width={a.cover.thumbnail.width} height={a.cover.thumbnail.height} />
            )}
            <span className="nw-item-title">{a.title}</span>
          </Link>
          <time className="nw-item-date" dateTime={a.publishedAt.toISOString()}>
            {newsDate(a.publishedAt)}
          </time>
          {leads && <p className="nw-item-lead">{a.lead}</p>}
        </li>
      ))}
    </ul>
  );
}
