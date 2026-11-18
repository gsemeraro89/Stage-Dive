// One gig as a small paste-up: picture, name strip biting into it, typed data (boards 04 and 05).
// Put the cards in <ul className="hm-cards">. Styles: src/styles/home.css (.hm-card).
import Link from "next/link";
import type { CSSProperties } from "react";
import { PaperStrip, PhotoFrame } from "@/components/zine";
import { formatDuration } from "@/lib/format";
import type { BandPhotoView } from "@/lib/photos/view";
import type { ConcertView } from "@/lib/queries";
import { PlayOnPicture, YouTubePicture } from "./GigPicture";
import { bandName, placeYear, shortData } from "./words";

const TILTS = [-1.2, 1, -0.8];

export function GigCard({
  concert,
  photo = null,
  index,
  name = "band",
  sizes = "(min-width: 901px) 30vw, 50vw",
}: {
  concert: ConcertView;
  /** The band's licensed, photocopied photo, when the page wants it instead of the YouTube picture. */
  photo?: BandPhotoView | null;
  index: number;
  /** "band": the strip says who played. "place": it says where and when (on a band's own pages). */
  name?: "band" | "place";
  sizes?: string;
}) {
  const strip = (
    <PaperStrip tone="white" size="name" className="hm-card-name">
      <Link href={`/concerts/${concert.slug}`}>{name === "band" ? concert.credits : placeYear(concert) || concert.credits}</Link>
    </PaperStrip>
  );
  return (
    <li className="hm-card" style={{ "--tilt": `${TILTS[index % 3]}deg` } as CSSProperties}>
      {photo ? (
        <PhotoFrame
          kind="treated"
          src={photo.src}
          alt={`${bandName(concert)}, photocopied`}
          ratio="4 / 3"
          sizes={sizes}
          credit={photo.credit}
          creditHref={photo.sourcePage}
          control={<PlayOnPicture concert={concert} />}
        >
          {strip}
        </PhotoFrame>
      ) : (
        <YouTubePicture concert={concert} sizes={sizes}>
          {strip}
        </YouTubePicture>
      )}
      <p className="zn-data hm-card-data">{name === "band" ? shortData(concert) : formatDuration(concert.durationSeconds)}</p>
    </li>
  );
}
