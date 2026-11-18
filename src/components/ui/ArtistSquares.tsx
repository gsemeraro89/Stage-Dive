import Link from "next/link";
import type { SetView } from "@/lib/queries";

/**
 * The artist's picture (`cover` from the queries). `portrait` true: the artist's own square
 * picture (the avatar of their YouTube channel), shown whole. Otherwise the thumbnail of their
 * newest set, shown with the portrait crop.
 */
type Cover = { thumbnail: SetView["thumbnail"]; portrait?: boolean } | null;

/**
 * Artist squares: a 1:1 picture with the set count and the name in a caption under it, on the
 * page ground. Nothing is written on the photo: thumbnails carry their own titles and logos, and
 * a label on top of them collides with that text. The picture is the artist's own (shown whole)
 * or a set thumbnail cropped tight to the upper centre; greyscale, colour on hover.
 * Without a cover the square is typographic: the outlined initial inside hairlines.
 */
export function ArtistSquares({
  artists,
  columns = 5,
  allTile,
  label,
}: {
  artists: { slug: string; name: string; sets: number; cover?: Cover }[];
  columns?: 4 | 5;
  /** Close the grid with the acid "All artists" tile. */
  allTile?: { count: number };
  label: string;
}) {
  // A set thumbnail is 2.35 times as wide as its square (the crop), so ask for a file that size.
  // An artist's own picture is exactly as wide as the square.
  const sizes = (portrait?: boolean) =>
    portrait
      ? `(min-width: 761px) ${Math.round(100 / columns)}vw, 50vw`
      : `(min-width: 761px) ${Math.round(235 / columns)}vw, 118vw`;
  return (
    <ul className={`od-squares${columns === 4 ? " od-squares--4" : ""}`} aria-label={label} data-od="artist-squares">
      {artists.map((a) => {
        const image = a.cover?.thumbnail;
        return (
          <li key={a.slug}>
            <Link href={`/artists/${a.slug}`} className="od-square">
              {image ? (
                <span className="od-square-pic" data-portrait={a.cover?.portrait || undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.src} srcSet={image.srcSet} sizes={sizes(a.cover?.portrait)} alt="" loading="lazy" decoding="async" />
                </span>
              ) : (
                <span className="od-square-pic od-square-pic--plain display" aria-hidden="true">
                  {a.name.slice(0, 1)}
                </span>
              )}
              <span className="od-square-cap">
                <span className="od-square-count meta">
                  {String(a.sets).padStart(2, "0")} {a.sets === 1 ? "set" : "sets"}
                </span>
                <span className="od-square-name display">{a.name}</span>
              </span>
            </Link>
          </li>
        );
      })}
      {allTile && (
        <li>
          <Link href="/artists" className="od-square od-square--all">
            <span className="od-square-pic">
              <span className="meta">Index {`(${String(allTile.count).padStart(2, "0")})`}</span>
              <span className="display">All artists</span>
            </span>
          </Link>
        </li>
      )}
    </ul>
  );
}
