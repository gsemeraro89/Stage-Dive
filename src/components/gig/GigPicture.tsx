// A gig's YouTube picture, the way the zine is allowed to show it (design/DESIGN.md section 6): whole,
// untouched, with only a play control on it and the "Picture: YouTube" credit under it.
import type { ReactNode } from "react";
import { PlayButton } from "@/components/player/PlayButton";
import { PhotoFrame, PlayGlyph } from "@/components/zine";
import { toTrack } from "@/lib/player-types";
import type { ConcertView } from "@/lib/queries";

/** A play control for a picture: the only thing allowed on a YouTube thumbnail. */
export function PlayOnPicture({ concert }: { concert: ConcertView }) {
  return (
    <PlayButton track={toTrack(concert)} className="zn-icon hm-playicon">
      <PlayGlyph />
    </PlayButton>
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
