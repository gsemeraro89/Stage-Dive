import Link from "next/link";
import { PlayLink } from "@/components/player/PlayLink";
import { PlayIcon } from "@/components/ui/Icons";
import { formatDate, formatDuration } from "@/lib/format";
import { toTrack } from "@/lib/player-types";
import type { ConcertView } from "@/lib/queries";
import { compactNumber } from "@/lib/site";

// How wide each image slot is on screen, so the browser picks a sharp file (DESIGN.md section 6).
export const SIZES = {
  hero: "(min-width: 761px) 67vw, 100vw",
  lead: "(min-width: 761px) 58vw, 100vw",
  feature: "(min-width: 761px) 66vw, 100vw",
  tile: "(min-width: 761px) 20vw, 42vw",
  stack: "(min-width: 761px) 32vw, 42vw",
  row: "(min-width: 761px) 176px, 132px",
  archive: "96px",
} as const;

function dateAttr(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** The thumbnail of a concert. Clicking it opens the concert page and starts nothing, so the label shows the length without a play triangle. */
export function PlayThumb({ concert, sizes, priority }: { concert: ConcertView; sizes: string; priority?: boolean }) {
  return (
    <PlayLink track={toTrack(concert)} className="od-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={concert.thumbnail.src}
        srcSet={concert.thumbnail.srcSet}
        sizes={sizes}
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
      />
      <span className="od-dur meta" data-od="duration">
        {formatDuration(concert.durationSeconds)}
      </span>
    </PlayLink>
  );
}

/** Artist names in acid mono (links), then the place in muted mono. */
export function Credits({ concert, place = true }: { concert: ConcertView; place?: boolean }) {
  const where = [concert.city, concert.country].filter(Boolean).join(", ");
  return (
    <p className="od-credit meta">
      <span data-od="artists">
        {concert.artists.map((a, i) => (
          <span key={a.slug}>
            {i > 0 && (a.role === "WITH" ? " with " : " & ")}
            {a.hasPage ? (
              <Link href={`/artists/${a.slug}`} className="od-credit-artist">
                {a.name}
              </Link>
            ) : (
              // A guest without a page of their own: the name in the same type, not a link.
              <span className="od-credit-artist">{a.name}</span>
            )}
            {a.creditNote ? ` (${a.creditNote})` : ""}
          </span>
        ))}
      </span>
      {place && (concert.venue || where) && (
        <span data-od="place">
          {" — "}
          {concert.venue ? <Link href={`/venues/${concert.venue.slug}`}>{concert.venue.name}</Link> : null}
          {where && `${concert.venue ? ", " : ""}${where}`}
        </span>
      )}
    </p>
  );
}

/**
 * Concert tile: image (click = concert page, playing), a mono row (date left, views right), the title
 * (link to the concert page, without starting it), then artist and place. No box around it.
 */
export function ConcertTile({
  concert,
  lead,
  sizes,
  priority,
}: {
  concert: ConcertView;
  lead?: boolean;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <article className={`od-tile${lead ? " od-tile--lead" : ""}`} data-od="concert-tile">
      <PlayThumb concert={concert} sizes={sizes ?? (lead ? SIZES.lead : SIZES.tile)} priority={priority} />
      <p className="od-tile-meta meta" data-od="meta">
        <time dateTime={dateAttr(concert.publishedAt)}>{formatDate(concert.publishedAt)}</time>
        <span>{compactNumber(concert.viewCount)} views</span>
      </p>
      <h3 className="title">
        <Link href={`/concerts/${concert.slug}`}>{concert.title}</Link>
      </h3>
      <Credits concert={concert} />
    </article>
  );
}

const EMPTY = (
  <p className="meta od-muted" data-od="empty">
    No concerts here yet.
  </p>
);

/** One lead image (7 columns) next to a stack of smaller tiles. Never a wall of equal tiles. */
export function LeadGrid({ concerts, label, priority }: { concerts: ConcertView[]; label: string; priority?: boolean }) {
  if (concerts.length === 0) return EMPTY;
  const [lead, ...rest] = concerts;
  return (
    <div className="od-lead-grid" role="list" aria-label={label} data-od="concert-list">
      <div className="od-lead" role="listitem">
        <ConcertTile concert={lead} lead priority={priority} />
      </div>
      {rest.length > 0 && (
        <div className="od-rest" role="presentation" data-count={rest.length}>
          {rest.map((concert) => (
            <div key={concert.id} role="listitem">
              <ConcertTile concert={concert} sizes={rest.length <= 2 ? SIZES.stack : SIZES.tile} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Most watched: rank in display type (01 in acid), image, title, views with an acid bar. */
export function ChartList({ concerts, label }: { concerts: ConcertView[]; label: string }) {
  if (concerts.length === 0) return EMPTY;
  const top = Math.max(...concerts.map((s) => s.viewCount), 1);
  return (
    <ol className="od-rows" aria-label={label} data-od="concert-list">
      {concerts.map((concert, i) => (
        <li key={concert.id}>
          <article className="od-row od-row--chart" data-od="concert-tile">
            <span className="od-rank display" data-od="rank">
              {String(i + 1).padStart(2, "0")}
            </span>
            <PlayThumb concert={concert} sizes={SIZES.row} />
            <div className="min-w-0">
              <h3 className="title">
                <Link href={`/concerts/${concert.slug}`}>{concert.title}</Link>
              </h3>
              <Credits concert={concert} />
            </div>
            <div className="od-views meta">
              <div className="od-views-head">
                <span className="od-muted">Views</span>
                <span>{compactNumber(concert.viewCount)}</span>
              </div>
              <span className="od-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(1, (concert.viewCount / top) * 100)}%` }} />
              </span>
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}

/** A plain list of concerts: image, title, credits, date and views. Used for "All concerts" and results. */
export function ConcertRows({ concerts, label }: { concerts: ConcertView[]; label: string }) {
  if (concerts.length === 0) return EMPTY;
  return (
    <ol className="od-rows" aria-label={label} data-od="concert-list">
      {concerts.map((concert, i) => (
        <li key={concert.id}>
          <article className="od-row od-row--list" data-od="concert-tile">
            <PlayThumb concert={concert} sizes={SIZES.row} priority={i === 0} />
            <div className="min-w-0">
              <h3 className="title">
                <Link href={`/concerts/${concert.slug}`}>{concert.title}</Link>
              </h3>
              <Credits concert={concert} />
              <p className="meta od-muted od-phone" style={{ margin: 0 }}>
                {formatDate(concert.publishedAt)} · {compactNumber(concert.viewCount)} views
              </p>
            </div>
            <time className="meta od-num" dateTime={dateAttr(concert.publishedAt)}>
              {formatDate(concert.publishedAt)}
            </time>
            <span className="meta od-num od-muted">{compactNumber(concert.viewCount)} views</span>
          </article>
        </li>
      ))}
    </ol>
  );
}

/**
 * Archive rows: a small image, then text. The year is shown in acid on the first row of each year.
 * The whole row is one link to the concert page, image included; the length is a text column, so
 * nothing is written on the image.
 */
export function ArchiveRows({ concerts, label }: { concerts: ConcertView[]; label: string }) {
  if (concerts.length === 0) return EMPTY;
  const sorted = [...concerts].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return (
    <ol className="od-archive" aria-label={label} data-od="archive-list">
      {sorted.map((concert, i) => {
        const year = concert.publishedAt.getUTCFullYear();
        const firstOfYear = i === 0 || sorted[i - 1].publishedAt.getUTCFullYear() !== year;
        const where = concert.venue?.name ?? [concert.city, concert.country].filter(Boolean).join(", ");
        return (
          <li key={concert.id}>
            <Link
              href={`/concerts/${concert.slug}`}
              className={`od-arc${firstOfYear ? " od-arc--year" : ""}`}
              data-od="archive-row"
            >
              <span className="od-arc-year meta">
                {firstOfYear ? year : <span className="od-sr">{year}</span>}
              </span>
              <span className="od-arc-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={concert.thumbnail.src}
                  srcSet={concert.thumbnail.srcSet}
                  sizes={SIZES.archive}
                  width={96}
                  height={54}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </span>
              <span className="od-arc-title">{concert.title}</span>
              <span className="od-arc-venue meta" data-od="venue">
                {where}
              </span>
              <span className="od-arc-num od-arc-dur meta" data-od="duration">
                {formatDuration(concert.durationSeconds)}
              </span>
              <span className="od-arc-num od-arc-views meta" data-od="views">
                {compactNumber(concert.viewCount)}
                <span className="od-sr"> views</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One concert shown large: the image beside a rail with its facts and the play button.
 * `flip` puts the rail on the left (home hero); default is image left, rail right.
 * `credit` adds the artist line under the title, for pages that do not already name the artist.
 */
export function Feature({
  concert,
  kicker,
  flip,
  credit,
  heading: Heading = "h2",
  sizes = SIZES.feature,
}: {
  concert: ConcertView;
  kicker: string;
  flip?: boolean;
  credit?: boolean;
  heading?: "h2" | "h3";
  sizes?: string;
}) {
  const where = [concert.venue?.name, concert.city, concert.country].filter(Boolean).join(", ");
  return (
    <div className={`od-feature${flip ? " od-feature--flip" : ""}`} data-od="feature">
      <div className="od-feature-media">
        <PlayThumb concert={concert} sizes={sizes} priority />
      </div>
      <div className="od-feature-rail">
        <p className="od-feature-kicker meta od-acid" style={{ margin: 0 }}>
          {kicker}
        </p>
        <Heading className="title">
          <Link href={`/concerts/${concert.slug}`}>{concert.title}</Link>
        </Heading>
        {credit && <Credits concert={concert} place={false} />}
        <dl className="od-facts meta">
          <dt>Uploaded</dt>
          <dd>
            <time dateTime={dateAttr(concert.publishedAt)}>{formatDate(concert.publishedAt)}</time>
          </dd>
          <dt>Length</dt>
          <dd>{formatDuration(concert.durationSeconds)}</dd>
          {where && (
            <>
              <dt>Where</dt>
              <dd>{where}</dd>
            </>
          )}
          <dt>Channel</dt>
          <dd>{concert.channel.name}</dd>
          {(concert.genres.length > 0 || concert.liveAct) && (
            <>
              <dt>Genre</dt>
              <dd>{[...concert.genres.map((g) => g.name), ...(concert.liveAct ? ["Live act"] : [])].join(" · ")}</dd>
            </>
          )}
          <dt>Views</dt>
          <dd>{compactNumber(concert.viewCount)}</dd>
        </dl>
        <PlayLink track={toTrack(concert)} className="od-play">
          <PlayIcon />
          Play concert — {formatDuration(concert.durationSeconds)}
        </PlayLink>
      </div>
    </div>
  );
}

/** Kept for older call sites: a list of concerts as tiles (lead + stack) or as a chart. */
export function ConcertList({ concerts, ranked, label }: { concerts: ConcertView[]; ranked?: boolean; label: string }) {
  return ranked ? <ChartList concerts={concerts} label={label} /> : <LeadGrid concerts={concerts} label={label} />;
}
