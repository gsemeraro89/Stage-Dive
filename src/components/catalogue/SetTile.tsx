import Link from "next/link";
import { PlayLink } from "@/components/player/PlayLink";
import { PlayIcon } from "@/components/ui/Icons";
import { formatDate, formatDuration } from "@/lib/format";
import { toTrack } from "@/lib/player-types";
import type { SetView } from "@/lib/queries";
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

/** The thumbnail of a set. Clicking it opens the set page and starts nothing, so the label shows the length without a play triangle. */
export function PlayThumb({ set, sizes, priority }: { set: SetView; sizes: string; priority?: boolean }) {
  return (
    <PlayLink track={toTrack(set)} className="od-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={set.thumbnail.src}
        srcSet={set.thumbnail.srcSet}
        sizes={sizes}
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
      />
      <span className="od-dur meta" data-od="duration">
        {formatDuration(set.durationSeconds)}
      </span>
    </PlayLink>
  );
}

/** Artist names in acid mono (links), then the place in muted mono. */
export function Credits({ set, place = true }: { set: SetView; place?: boolean }) {
  const where = [set.city, set.country].filter(Boolean).join(", ");
  return (
    <p className="od-credit meta">
      <span data-od="artists">
        {set.artists.map((a, i) => (
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
      {place && (set.venue || where) && (
        <span data-od="place">
          {" — "}
          {set.venue ? <Link href={`/venues/${set.venue.slug}`}>{set.venue.name}</Link> : null}
          {where && `${set.venue ? ", " : ""}${where}`}
        </span>
      )}
    </p>
  );
}

/**
 * Set tile: image (click = set page, playing), a mono row (date left, views right), the title
 * (link to the set page, without starting it), then artist and place. No box around it.
 */
export function SetTile({
  set,
  lead,
  sizes,
  priority,
}: {
  set: SetView;
  lead?: boolean;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <article className={`od-tile${lead ? " od-tile--lead" : ""}`} data-od="set-tile">
      <PlayThumb set={set} sizes={sizes ?? (lead ? SIZES.lead : SIZES.tile)} priority={priority} />
      <p className="od-tile-meta meta" data-od="meta">
        <time dateTime={dateAttr(set.publishedAt)}>{formatDate(set.publishedAt)}</time>
        <span>{compactNumber(set.viewCount)} views</span>
      </p>
      <h3 className="title">
        <Link href={`/sets/${set.slug}`}>{set.title}</Link>
      </h3>
      <Credits set={set} />
    </article>
  );
}

const EMPTY = (
  <p className="meta od-muted" data-od="empty">
    No sets here yet.
  </p>
);

/** One lead image (7 columns) next to a stack of smaller tiles. Never a wall of equal tiles. */
export function LeadGrid({ sets, label, priority }: { sets: SetView[]; label: string; priority?: boolean }) {
  if (sets.length === 0) return EMPTY;
  const [lead, ...rest] = sets;
  return (
    <div className="od-lead-grid" role="list" aria-label={label} data-od="set-list">
      <div className="od-lead" role="listitem">
        <SetTile set={lead} lead priority={priority} />
      </div>
      {rest.length > 0 && (
        <div className="od-rest" role="presentation" data-count={rest.length}>
          {rest.map((set) => (
            <div key={set.id} role="listitem">
              <SetTile set={set} sizes={rest.length <= 2 ? SIZES.stack : SIZES.tile} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Most watched: rank in display type (01 in acid), image, title, views with an acid bar. */
export function ChartList({ sets, label }: { sets: SetView[]; label: string }) {
  if (sets.length === 0) return EMPTY;
  const top = Math.max(...sets.map((s) => s.viewCount), 1);
  return (
    <ol className="od-rows" aria-label={label} data-od="set-list">
      {sets.map((set, i) => (
        <li key={set.id}>
          <article className="od-row od-row--chart" data-od="set-tile">
            <span className="od-rank display" data-od="rank">
              {String(i + 1).padStart(2, "0")}
            </span>
            <PlayThumb set={set} sizes={SIZES.row} />
            <div className="min-w-0">
              <h3 className="title">
                <Link href={`/sets/${set.slug}`}>{set.title}</Link>
              </h3>
              <Credits set={set} />
            </div>
            <div className="od-views meta">
              <div className="od-views-head">
                <span className="od-muted">Views</span>
                <span>{compactNumber(set.viewCount)}</span>
              </div>
              <span className="od-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(1, (set.viewCount / top) * 100)}%` }} />
              </span>
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}

/** A plain list of sets: image, title, credits, date and views. Used for "All sets" and results. */
export function SetRows({ sets, label }: { sets: SetView[]; label: string }) {
  if (sets.length === 0) return EMPTY;
  return (
    <ol className="od-rows" aria-label={label} data-od="set-list">
      {sets.map((set, i) => (
        <li key={set.id}>
          <article className="od-row od-row--list" data-od="set-tile">
            <PlayThumb set={set} sizes={SIZES.row} priority={i === 0} />
            <div className="min-w-0">
              <h3 className="title">
                <Link href={`/sets/${set.slug}`}>{set.title}</Link>
              </h3>
              <Credits set={set} />
              <p className="meta od-muted od-phone" style={{ margin: 0 }}>
                {formatDate(set.publishedAt)} · {compactNumber(set.viewCount)} views
              </p>
            </div>
            <time className="meta od-num" dateTime={dateAttr(set.publishedAt)}>
              {formatDate(set.publishedAt)}
            </time>
            <span className="meta od-num od-muted">{compactNumber(set.viewCount)} views</span>
          </article>
        </li>
      ))}
    </ol>
  );
}

/**
 * Archive rows: a small image, then text. The year is shown in acid on the first row of each year.
 * The whole row is one link to the set page, image included; the length is a text column, so
 * nothing is written on the image.
 */
export function ArchiveRows({ sets, label }: { sets: SetView[]; label: string }) {
  if (sets.length === 0) return EMPTY;
  const sorted = [...sets].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return (
    <ol className="od-archive" aria-label={label} data-od="archive-list">
      {sorted.map((set, i) => {
        const year = set.publishedAt.getUTCFullYear();
        const firstOfYear = i === 0 || sorted[i - 1].publishedAt.getUTCFullYear() !== year;
        const where = set.venue?.name ?? [set.city, set.country].filter(Boolean).join(", ");
        return (
          <li key={set.id}>
            <Link
              href={`/sets/${set.slug}`}
              className={`od-arc${firstOfYear ? " od-arc--year" : ""}`}
              data-od="archive-row"
            >
              <span className="od-arc-year meta">
                {firstOfYear ? year : <span className="od-sr">{year}</span>}
              </span>
              <span className="od-arc-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={set.thumbnail.src}
                  srcSet={set.thumbnail.srcSet}
                  sizes={SIZES.archive}
                  width={96}
                  height={54}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </span>
              <span className="od-arc-title">{set.title}</span>
              <span className="od-arc-venue meta" data-od="venue">
                {where}
              </span>
              <span className="od-arc-num od-arc-dur meta" data-od="duration">
                {formatDuration(set.durationSeconds)}
              </span>
              <span className="od-arc-num od-arc-views meta" data-od="views">
                {compactNumber(set.viewCount)}
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
 * One set shown large: the image beside a rail with its facts and the play button.
 * `flip` puts the rail on the left (home hero); default is image left, rail right.
 * `credit` adds the artist line under the title, for pages that do not already name the artist.
 */
export function Feature({
  set,
  kicker,
  flip,
  credit,
  heading: Heading = "h2",
  sizes = SIZES.feature,
}: {
  set: SetView;
  kicker: string;
  flip?: boolean;
  credit?: boolean;
  heading?: "h2" | "h3";
  sizes?: string;
}) {
  const where = [set.venue?.name, set.city, set.country].filter(Boolean).join(", ");
  return (
    <div className={`od-feature${flip ? " od-feature--flip" : ""}`} data-od="feature">
      <div className="od-feature-media">
        <PlayThumb set={set} sizes={sizes} priority />
      </div>
      <div className="od-feature-rail">
        <p className="od-feature-kicker meta od-acid" style={{ margin: 0 }}>
          {kicker}
        </p>
        <Heading className="title">
          <Link href={`/sets/${set.slug}`}>{set.title}</Link>
        </Heading>
        {credit && <Credits set={set} place={false} />}
        <dl className="od-facts meta">
          <dt>Uploaded</dt>
          <dd>
            <time dateTime={dateAttr(set.publishedAt)}>{formatDate(set.publishedAt)}</time>
          </dd>
          <dt>Length</dt>
          <dd>{formatDuration(set.durationSeconds)}</dd>
          {where && (
            <>
              <dt>Where</dt>
              <dd>{where}</dd>
            </>
          )}
          <dt>Channel</dt>
          <dd>{set.channel.name}</dd>
          {(set.genres.length > 0 || set.liveAct) && (
            <>
              <dt>Genre</dt>
              <dd>{[...set.genres.map((g) => g.name), ...(set.liveAct ? ["Live act"] : [])].join(" · ")}</dd>
            </>
          )}
          <dt>Views</dt>
          <dd>{compactNumber(set.viewCount)}</dd>
        </dl>
        <PlayLink track={toTrack(set)} className="od-play">
          <PlayIcon />
          Play set — {formatDuration(set.durationSeconds)}
        </PlayLink>
      </div>
    </div>
  );
}

/** Kept for older call sites: a list of sets as tiles (lead + stack) or as a chart. */
export function SetList({ sets, ranked, label }: { sets: SetView[]; ranked?: boolean; label: string }) {
  return ranked ? <ChartList sets={sets} label={label} /> : <LeadGrid sets={sets} label={label} />;
}
