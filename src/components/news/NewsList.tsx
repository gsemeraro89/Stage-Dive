// News items as a plain list (owner, 21 Nov 2026: news section). Structure only, unstyled: the look is
// the designer's (stagedive-designer). Hooks: data-od="news-list" / "news-item", classes nw-*.
// Visual news (owner, 23 Nov 2026; unstyled for now, designer): every item has a picture (data-od="news-item-picture",
// data-kind = band-photo | festival-photo | band-concert | festival-concert), a topic stamp (data-od="news-topic",
// data-topic = tour | festival | live-release | ...), a Commons photo its credit (data-od="news-item-credit"), and the
// list's lead story carries data-lead="true".
// Used on /news, at the foot of an article ("More news") and on band and festival pages ("Latest news").
import Link from "next/link";
import type { NewsListItem } from "@/lib/news/queries";

export function newsDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export type NewsListEntry = Pick<NewsListItem, "id" | "slug" | "title" | "lead" | "publishedAt"> &
  Partial<Pick<NewsListItem, "cover" | "topic" | "topicLabel" | "isLead">>;

export function NewsList({ items, label, pictures = true, leads = true }: { items: NewsListEntry[]; label: string; pictures?: boolean; leads?: boolean }) {
  return (
    <ul className="nw-list" data-od="news-list" aria-label={label}>
      {items.map((a) => (
        <li key={a.id} className="nw-item" data-od="news-item" data-lead={a.isLead ? "true" : undefined}>
          <Link href={`/news/${a.slug}`} className="nw-item-link">
            {pictures && a.cover && (
              // Our own picture of the band or festival (its free photo, else a frame of its concert here), never the
              // source's. Unstyled for now (designer). A Commons photo's credit is shown on the article page.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.cover.src}
                srcSet={a.cover.srcSet}
                sizes={a.isLead ? "(min-width: 1001px) 60vw, 100vw" : "(min-width: 1001px) 30vw, 100vw"}
                alt={a.cover.of}
                loading={a.isLead ? "eager" : "lazy"}
                className="nw-item-picture"
                data-od="news-item-picture"
                data-kind={a.cover.kind}
                width={a.cover.width}
                height={a.cover.height}
              />
            )}
            <span className="nw-item-title">{a.title}</span>
          </Link>
          {pictures && a.cover?.credit && (
            // A Commons photo is credited wherever it is shown (CC licences): author, licence, link. Unstyled for now (designer).
            <small className="nw-item-credit" data-od="news-item-credit">
              <a href={a.cover.credit.sourcePage} rel="noopener" target="_blank">
                {a.cover.credit.line}
              </a>
            </small>
          )}
          {/* The topic stamp, outside the link so the link reads as the headline. */}
          {a.topicLabel && (
            <span className="nw-item-topic" data-od="news-topic" data-topic={a.topic}>
              {a.topicLabel}
            </span>
          )}
          <time className="nw-item-date" dateTime={a.publishedAt.toISOString()}>
            {newsDate(a.publishedAt)}
          </time>
          {leads && <p className="nw-item-lead">{a.lead}</p>}
        </li>
      ))}
    </ul>
  );
}
