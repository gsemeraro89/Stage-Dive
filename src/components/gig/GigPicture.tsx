// A gig's YouTube picture, the way the zine is allowed to show it (design/DESIGN.md section 6): whole,
// untouched, with only a play control on it and the "Picture: YouTube" credit under it.
import type { ReactNode } from "react";
import { PlayLink } from "@/components/player/PlayLink";
import { PhotoFrame, PlayGlyph } from "@/components/zine";
import { toTrack } from "@/lib/player-types";
import type { ConcertView } from "@/lib/queries";

/**
 * The control on a picture, the only thing allowed on a YouTube thumbnail. It opens the concert's page
 * (owner, 25 Nov 2026: a picture never interrupts the concert that is playing); the page plays it.
 */
export function PlayOnPicture({ concert }: { concert: ConcertView }) {
  return (
    <PlayLink track={toTrack(concert)} className="zn-icon hm-playicon">
      <PlayGlyph />
    </PlayLink>
  );
}

export function YouTubePicture({
  concert,
  sizes,
  children,
  ...rest
}: {
  concert: ConcertView;
  sizes: string;
  children?: ReactNode;
  tilt?: number;
  shadow?: boolean;
  eager?: boolean;
  fixings?: ReactNode;
  stamp?: ReactNode;
  className?: string;
}) {
  const t = concert.thumbnail;
  return (
    <PhotoFrame
      kind="youtube"
      src={t.src}
      srcSet={t.srcSet}
      width={t.width}
      height={t.height}
      sizes={sizes}
      alt={`Still from the video: ${concert.title}`}
      control={<PlayOnPicture concert={concert} />}
      {...rest}
    >
      {children}
    </PhotoFrame>
  );
}
