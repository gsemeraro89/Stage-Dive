// Parts of the home page (src/app/_home/HomePage.tsx).
// DESIGN.md section 8, "Home page parts". Nothing here is written on a photo except the
// duration label of a concert thumbnail: every caption sits on the ground under its picture.
import Link from "next/link";
import { Credits, PlayThumb, SIZES } from "@/components/catalogue/ConcertTile";
import { formatDate, formatDuration } from "@/lib/format";
import type { ConcertView } from "@/lib/queries";
import { compactNumber } from "@/lib/site";
import { Reel } from "./Reel";

/** The place a concert was played, short: "Salar de Uyuni", else the city, else the country. */
export function placeName(concert: ConcertView): string {
  return concert.venue?.name ?? concert.city ?? concert.country ?? concert.title;
}

/** "Cappadocia, Turkey", without repeating what placeName already says. */
export function placeRest(concert: ConcertView): string {
  const name = placeName(concert);
  return [concert.city, concert.country].filter((p) => p && p !== name).join(", ");
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Plate: a concert shown for where it was played. A concert tile with the place as its title:
 * image, a mono row (city and country left, views right), the place in title type, the artist
 * in acid mono. No box. `kicker` adds a muted mono line above the place (a link when it has an href).
 */
export function Plate({
  concert,
  sizes,
  priority,
  kicker,
}: {
  concert: ConcertView;
  sizes?: string;
  priority?: boolean;
  kicker?: { label: string; href?: string };
}) {
  const rest = placeRest(concert);
  return (
    <article className="od-tile od-plate" data-od="plate">
      <PlayThumb concert={concert} sizes={sizes ?? SIZES.tile} priority={priority} />
      <p className="od-tile-meta meta" data-od="meta">
        {kicker ? (
          kicker.href ? (
            <Link href={kicker.href} className="od-plate-kicker">
              {kicker.label}
            </Link>
          ) : (
            <span>{kicker.label}</span>
          )
        ) : (
          <span>{rest || concert.setting?.name}</span>
        )}
        <span>{compactNumber(concert.viewCount)} views</span>
      </p>
      <h3 className="title">
        <Link href={`/concerts/${concert.slug}`}>{placeName(concert)}</Link>
      </h3>
      {kicker && rest && <p className="od-plate-rest meta od-muted">{rest}</p>}
      <Credits concert={concert} place={false} />
    </article>
  );
}

/** The acid band that announces the newest upload. */
export function LatestStrip({ newest, concerts, artists }: { newest?: ConcertView; concerts: number; artists: number }) {
  if (!newest) return null;
  return (
    <div className="od-strip od-strip--inset meta" data-od="latest-strip">
      <Link href={`/concerts/${newest.slug}`}>
        Latest upload: {newest.credits}
        {newest.venue ? ` — ${newest.venue.name}` : ""}
      </Link>
      <span>{formatDate(newest.publishedAt)}</span>
      <span className="od-strip-end">
        {concerts} concerts · {artists} artists
      </span>
    </div>
  );
}

/** One picture of the reel: the concert, and the setting it stands for (a link to that setting's concerts). */
export interface ReelFrame {
  concert: ConcertView;
  kicker: { label: string; href: string };
}

/**
 * Reel: the band of pictures at the top of the home page. Every frame has the same format and
 * size (16:9), a 2px seam between them, and its caption under it, on the ground: the setting
 * with its count (a link), the place, the artist. The picture opens the concert page. Arrows and
 * swipe: see `Reel`.
 */
export function PlaceReel({ frames }: { frames: ReelFrame[] }) {
  if (frames.length === 0) return null;
  return (
    <Reel label="Concerts by setting">
      {frames.map(({ concert, kicker }, i) => (
        <li key={concert.id}>
          <article className="od-reel-frame" data-od="plate">
            <PlayThumb concert={concert} sizes="(min-width: 1001px) 31vw, (min-width: 761px) 45vw, 86vw" priority={i === 0} />
            <div className="od-reel-cap">
              <p className="meta">
                <Link href={kicker.href} className="od-plate-kicker">
                  {kicker.label}
                </Link>
              </p>
              <h2 className="title">
                <Link href={`/concerts/${concert.slug}`}>{placeName(concert)}</Link>
              </h2>
              <Credits concert={concert} place={false} />
            </div>
          </article>
        </li>
      ))}
    </Reel>
  );
}

/** Atlas rows: a text list of concerts by place. Country, place, artist, length. One link per row. */
export function AtlasRows({ concerts, label }: { concerts: ConcertView[]; label: string }) {
  const sorted = [...concerts].sort(
    (a, b) => (a.country ?? "~").localeCompare(b.country ?? "~") || placeName(a).localeCompare(placeName(b)),
  );
  return (
    <ol className="od-atlas" aria-label={label} data-od="atlas">
      {sorted.map((concert, i) => {
        const firstOfCountry = i === 0 || sorted[i - 1].country !== concert.country;
        return (
          <li key={concert.id}>
            <Link href={`/concerts/${concert.slug}`} className="od-atlas-row">
              <span className="od-atlas-country meta">
                {firstOfCountry ? (concert.country ?? "") : <span className="od-sr">{concert.country}</span>}
              </span>
              <span className="od-atlas-place title">{placeName(concert)}</span>
              <span className="od-atlas-artist meta">{concert.credits}</span>
              <span className="od-atlas-dur meta">{formatDuration(concert.durationSeconds)}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export interface WordRow {
  word: string;
  count: number;
  href: string;
  line: string;
  links: { label: string; href: string }[];
  more: string;
}

/**
 * Word rows: the ways into the catalogue as a table of contents. A giant display word with its
 * count (alternating solid and outlined, like genre words), one sentence, and a few real entries
 * as mono links. Hairlines between rows.
 */
export function WordRows({ rows }: { rows: WordRow[] }) {
  return (
    <ul className="od-wordrows" data-od="word-rows">
      {rows.map((row) => (
        <li key={row.word}>
          <Link href={row.href} className="od-wordrows-word display">
            {row.word}
            <sup className="meta">
              {pad2(row.count)}
              <span className="od-sr"> in the catalogue</span>
            </sup>
          </Link>
          <div className="od-wordrows-side">
            <p className="body">{row.line}</p>
            <p className="od-wordrows-links meta">
              {row.links.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
              <Link href={row.href} className="od-wordrows-more">
                {row.more}
              </Link>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
