import Link from "next/link";
import { PlayButton } from "@/components/player/PlayButton";
import { formatDuration } from "@/lib/format";
import { toTrack, type RecommendedArtist, type Track } from "@/lib/player-types";
import type { ArtistCard } from "@/lib/queries";
import type { ThumbnailSources } from "@/lib/thumbnails";
import { PlayIcon } from "./Icons";
import { PlayNextButton } from "./PlayNextButton";

/** One set of a suggested artist: what the player needs, plus every thumbnail size. */
interface LineSet {
  track: Track;
  thumbnail: ThumbnailSources;
}

/** A suggested artist, the same shape wherever it comes from (page query or player). */
export interface ArtistLineData {
  slug: string;
  name: string;
  origin: string | null;
  bornYear: number | null;
  style: string | null;
  genres: { slug: string; name: string }[];
  sets: number;
  /** `portrait` true: the artist's own square picture, shown whole. Otherwise a set thumbnail, cropped. */
  cover: { thumbnail: ThumbnailSources; portrait?: boolean } | null;
  mostWatched: LineSet;
  latest: LineSet;
}

/** From a page query (`similarCards`, the map). */
export function lineFromCard(card: ArtistCard): ArtistLineData {
  return {
    ...card,
    mostWatched: { track: toTrack(card.mostWatched), thumbnail: card.mostWatched.thumbnail },
    latest: { track: toTrack(card.latest), thumbnail: card.latest.thumbnail },
  };
}

/** From the player (`usePlayer().suggestions`). */
export function lineFromSuggestion(artist: RecommendedArtist): ArtistLineData {
  return {
    ...artist,
    mostWatched: { track: artist.mostWatched, thumbnail: artist.mostWatched.thumbnailSources },
    latest: { track: artist.latest, thumbnail: artist.latest.thumbnailSources },
  };
}

/**
 * Artist line (DESIGN.md section 8): one suggested artist as a row on the page ground.
 * Picture, name and facts, the most watched set (its thumbnail plays it) and the latest set,
 * each with "Play next". It never says why the artist is suggested.
 * The layout follows the width of the place it is put in (page, deck sheet, map rail).
 */
export function ArtistLine({
  artist,
  heading: Heading = "h3",
  children,
}: {
  artist: ArtistLineData;
  heading?: "h2" | "h3" | "h4";
  /** Extra mono links under the facts (the map adds "Start from"). */
  children?: React.ReactNode;
}) {
  const { mostWatched, latest } = artist;
  const oneSet = mostWatched.track.youtubeId === latest.track.youtubeId;
  const facts = [
    artist.origin,
    artist.bornYear ? `Born ${artist.bornYear}` : null,
    `${artist.sets} ${artist.sets === 1 ? "set" : "sets"}`,
  ].filter(Boolean);
  const image = artist.cover?.thumbnail;

  return (
    <article className="od-aline" data-od="artist-line">
      <Link
        href={`/artists/${artist.slug}`}
        className={`od-aline-pic${image ? "" : " od-aline-pic--plain"}`}
        tabIndex={-1}
        aria-hidden="true"
        data-portrait={artist.cover?.portrait || undefined}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.src} srcSet={image.srcSet} sizes={artist.cover?.portrait ? "112px" : "270px"} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="display">{artist.name.slice(0, 1)}</span>
        )}
      </Link>

      <div className="od-aline-id">
        <Heading className="od-aline-name title">
          <Link href={`/artists/${artist.slug}`}>{artist.name}</Link>
        </Heading>
        <p className="od-aline-facts meta" data-od="artist-facts">
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </p>
        {artist.style && <p className="od-aline-style">{artist.style}</p>}
        {artist.genres.length > 0 && (
          <p className="od-aline-genres meta">
            {artist.genres.slice(0, 3).map((g) => (
              <Link key={g.slug} href={`/genres/${g.slug}`}>
                {g.name}
              </Link>
            ))}
          </p>
        )}
        {children && <p className="od-aline-more">{children}</p>}
      </div>

      <div className="od-aline-top" data-od="most-watched">
        <PlayButton track={mostWatched.track} className="od-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mostWatched.thumbnail.src}
            srcSet={mostWatched.thumbnail.srcSet}
            sizes="176px"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <span className="od-dur meta" data-od="duration">
            <PlayIcon size={9} />
            {formatDuration(mostWatched.track.durationSeconds)}
          </span>
        </PlayButton>
        <div className="od-aline-settext">
          <p className="meta od-muted">{artist.sets === 1 ? "The set" : oneSet ? "Most watched · Latest" : "Most watched"}</p>
          <p className="od-aline-settitle title">
            <Link href={`/sets/${mostWatched.track.slug}`}>{mostWatched.track.title}</Link>
          </p>
          <PlayNextButton track={mostWatched.track} />
        </div>
      </div>

      {!oneSet && (
        <div className="od-aline-latest" data-od="latest">
          <p className="meta od-muted">Latest</p>
          <p className="od-aline-settitle title">
            <Link href={`/sets/${latest.track.slug}`}>{latest.track.title}</Link>
          </p>
          <p className="od-aline-actions">
            <PlayButton track={latest.track} className="od-link od-aline-play">
              <PlayIcon size={9} />
              Play — {formatDuration(latest.track.durationSeconds)}
            </PlayButton>
            <PlayNextButton track={latest.track} />
          </p>
        </div>
      )}
    </article>
  );
}

/** A list of artist lines between hairlines. */
export function ArtistLines({
  artists,
  label,
  heading,
}: {
  artists: ArtistLineData[];
  label: string;
  heading?: "h2" | "h3" | "h4";
}) {
  return (
    <ol className="od-alines" aria-label={label} data-od="artist-lines">
      {artists.map((a) => (
        <li key={a.slug}>
          <ArtistLine artist={a} heading={heading} />
        </li>
      ))}
    </ol>
  );
}
