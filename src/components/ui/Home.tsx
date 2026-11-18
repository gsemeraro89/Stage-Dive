// Parts of the home page (src/app/_home/HomePage.tsx).
// DESIGN.md section 8, "Home page parts". Nothing here is written on a photo except the
// duration label of a set thumbnail: every caption sits on the ground under its picture.
import Link from "next/link";
import { Credits, PlayThumb, SIZES } from "@/components/catalogue/SetTile";
import { formatDate, formatDuration } from "@/lib/format";
import type { SetView } from "@/lib/queries";
import { compactNumber } from "@/lib/site";
import { Reel } from "./Reel";

/** The place a set was played, short: "Salar de Uyuni", else the city, else the country. */
export function placeName(set: SetView): string {
  return set.venue?.name ?? set.city ?? set.country ?? set.title;
}

/** "Cappadocia, Turkey", without repeating what placeName already says. */
export function placeRest(set: SetView): string {
  const name = placeName(set);
  return [set.city, set.country].filter((p) => p && p !== name).join(", ");
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Plate: a set shown for where it was played. A set tile with the place as its title:
 * image, a mono row (city and country left, views right), the place in title type, the artist
 * in acid mono. No box. `kicker` adds a muted mono line above the place (a link when it has an href).
 */
export function Plate({
  set,
  sizes,
  priority,
  kicker,
}: {
  set: SetView;
  sizes?: string;
  priority?: boolean;
  kicker?: { label: string; href?: string };
}) {
  const rest = placeRest(set);
  return (
    <article className="od-tile od-plate" data-od="plate">
      <PlayThumb set={set} sizes={sizes ?? SIZES.tile} priority={priority} />
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
          <span>{rest || set.setting?.name}</span>
        )}
        <span>{compactNumber(set.viewCount)} views</span>
      </p>
      <h3 className="title">
        <Link href={`/sets/${set.slug}`}>{placeName(set)}</Link>
      </h3>
      {kicker && rest && <p className="od-plate-rest meta od-muted">{rest}</p>}
      <Credits set={set} place={false} />
    </article>
  );
}

/** The acid band that announces the newest upload. */
export function LatestStrip({ newest, sets, artists }: { newest?: SetView; sets: number; artists: number }) {
  if (!newest) return null;
  return (
    <div className="od-strip od-strip--inset meta" data-od="latest-strip">
      <Link href={`/sets/${newest.slug}`}>
        Latest upload: {newest.credits}
        {newest.venue ? ` — ${newest.venue.name}` : ""}
      </Link>
      <span>{formatDate(newest.publishedAt)}</span>
      <span className="od-strip-end">
        {sets} sets · {artists} artists
      </span>
    </div>
  );
}

/** One picture of the reel: the set, and the setting it stands for (a link to that setting's sets). */
export interface ReelFrame {
  set: SetView;
  kicker: { label: string; href: string };
}

/**
 * Reel: the band of pictures at the top of the home page. Every frame has the same format and
 * size (16:9), a 2px seam between them, and its caption under it, on the ground: the setting
 * with its count (a link), the place, the artist. The picture opens the set page. Arrows and
 * swipe: see `Reel`.
 */
export function PlaceReel({ frames }: { frames: ReelFrame[] }) {
  if (frames.length === 0) return null;
  return (
    <Reel label="Sets by setting">
      {frames.map(({ set, kicker }, i) => (
        <li key={set.id}>
          <article className="od-reel-frame" data-od="plate">
            <PlayThumb set={set} sizes="(min-width: 1001px) 31vw, (min-width: 761px) 45vw, 86vw" priority={i === 0} />
            <div className="od-reel-cap">
              <p className="meta">
                <Link href={kicker.href} className="od-plate-kicker">
                  {kicker.label}
                </Link>
              </p>
              <h2 className="title">
                <Link href={`/sets/${set.slug}`}>{placeName(set)}</Link>
              </h2>
              <Credits set={set} place={false} />
            </div>
          </article>
        </li>
      ))}
    </Reel>
  );
}

/** Atlas rows: a text list of sets by place. Country, place, artist, length. One link per row. */
export function AtlasRows({ sets, label }: { sets: SetView[]; label: string }) {
  const sorted = [...sets].sort(
    (a, b) => (a.country ?? "~").localeCompare(b.country ?? "~") || placeName(a).localeCompare(placeName(b)),
  );
  return (
    <ol className="od-atlas" aria-label={label} data-od="atlas">
      {sorted.map((set, i) => {
        const firstOfCountry = i === 0 || sorted[i - 1].country !== set.country;
        return (
          <li key={set.id}>
            <Link href={`/sets/${set.slug}`} className="od-atlas-row">
              <span className="od-atlas-country meta">
                {firstOfCountry ? (set.country ?? "") : <span className="od-sr">{set.country}</span>}
              </span>
              <span className="od-atlas-place title">{placeName(set)}</span>
              <span className="od-atlas-artist meta">{set.credits}</span>
              <span className="od-atlas-dur meta">{formatDuration(set.durationSeconds)}</span>
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
