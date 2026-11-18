import type { ReactNode } from "react";
import { cx, tiltStyle, type Tilt } from "./tilt";

type Common = {
  src: string;
  /** Say what is in the picture. "" only when the strip beside it already says it all. */
  alt: string;
  tilt?: Tilt;
  /** 7px solid shadow: only when the photo sits on top of something. */
  shadow?: boolean;
  /** Tape across the top edge: pass <Tape />. */
  fixings?: ReactNode;
  /** Strips (name, place /// date). They overlap the bottom edge. */
  children?: ReactNode;
  /** A stamp or sticker, e.g. <OnNowStamp />. */
  stamp?: ReactNode;
  /** The play control: the only thing allowed on the picture. Pass an <IconButton />. */
  control?: ReactNode;
  /** "run" sweeps the photocopier light bar once (press play). */
  scan?: "run";
  /** Above the fold: load at once. Otherwise lazy. */
  eager?: boolean;
  sizes?: string;
  className?: string;
};

type YouTubePhoto = Common & {
  /**
   * A YouTube thumbnail. The YouTube developer policies say it must not be altered, so this mode
   * shows the file exactly as served: no filter, no recolouring, no crop, no words on it.
   * Strips, stamp and tape sit on the black mount around the picture, never on the picture.
   */
  kind: "youtube";
  /** The real pixel size of the file (1280x720 for maxresdefault, 480x360 for hqdefault). */
  width?: number;
  height?: number;
  srcSet?: string;
  /** Optional link for the visible "YouTube" source credit. */
  creditHref?: string;
};

type TreatedPhoto = Common & {
  /** A picture we are allowed to change and that has already been through the photocopy treatment:
   *  our own art, the brand book photos, licensed (e.g. Wikimedia Commons) pictures. Crop hard. */
  kind: "treated";
  /** CSS aspect-ratio of the cut, e.g. "16 / 9", "4 / 3", "3 / 4". */
  ratio?: string;
  /** CSS object-position: where to hold the crop. Hands, not faces. */
  focus?: string;
  /** Licence credit, when the licence asks for one: "Photo: Name / Wikimedia Commons, CC BY-SA 4.0". */
  credit?: string;
  /** Where the credit links to: the page of the original (CC licences ask for it). */
  creditHref?: string;
};

export type PhotoFrameProps = YouTubePhoto | TreatedPhoto;

/** A photo in its 4px black frame. See the two kinds above: they follow different rules. */
export function PhotoFrame(props: PhotoFrameProps) {
  const { kind, src, alt, tilt, shadow, fixings, children, stamp, control, scan, eager, sizes, className } = props;
  const youtube = kind === "youtube";
  const lightbar = <span className="zn-lightbar" aria-hidden="true" />;
  return (
    <figure
      className={cx("zn-photo", className)}
      data-kind={kind}
      data-shadow={shadow || undefined}
      data-strips={children ? true : undefined}
      data-scan={scan}
      style={tiltStyle(tilt, youtube ? undefined : { "--photo-ratio": props.ratio, "--photo-focus": props.focus })}
    >
      {fixings}
      {stamp && <div className="zn-photo-stamp">{stamp}</div>}
      <div className="zn-photo-frame">
        {/* A plain <img>: the file goes to the browser untouched (no re-encoding, no resizing proxy). */}
        <img
          src={src}
          srcSet={youtube ? props.srcSet : undefined}
          sizes={sizes}
          alt={alt}
          width={youtube ? (props.width ?? 1280) : undefined}
          height={youtube ? (props.height ?? 720) : undefined}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
        />
        {/* The light bar never crosses a YouTube picture: it runs in the scanner slot under it. */}
        {youtube ? (
          scan && (
            <span className="zn-scanner" aria-hidden="true">
              {lightbar}
            </span>
          )
        ) : (
          lightbar
        )}
        {control && <div className="zn-photo-control">{control}</div>}
      </div>
      {children && <div className="zn-photo-strips">{children}</div>}
      {youtube ? (
        <figcaption className="zn-photo-credit zn-label">
          Picture:{" "}
          {props.creditHref ? (
            <a href={props.creditHref} rel="noopener">
              YouTube
            </a>
          ) : (
            "YouTube"
          )}
        </figcaption>
      ) : (
        props.credit && (
          <figcaption className="zn-photo-credit zn-label">
            {props.creditHref ? (
              <a href={props.creditHref} rel="noopener">
                {props.credit}
              </a>
            ) : (
              props.credit
            )}
          </figcaption>
        )
      )}
    </figure>
  );
}

type OnNowStampProps = {
  children?: ReactNode;
  /** Stamp it down (320ms, one bounce, after the light bar). Without it the stamp is simply there. */
  animate?: boolean;
};

/** The pink "On now" stamp. The one live thing in the view. */
export function OnNowStamp({ children = "On now", animate }: OnNowStampProps) {
  return (
    <span className="zn-stamp" data-stamp={animate ? "run" : undefined}>
      {children}
    </span>
  );
}
