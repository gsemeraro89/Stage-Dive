import type { ReactNode } from "react";
import { cx, tiltStyle, type Tilt } from "./tilt";

export type StripTone = "white" | "black" | "pink";
export type StripSize = "h1" | "h2" | "name" | "small";

type PaperStripProps = {
  children: ReactNode;
  /** White and black alternate line by line. Pink is the one live thing in the view. */
  tone?: StripTone;
  size?: StripSize;
  /** "strip" = Archivo Black caps; "type" = typed data (place /// date); "marker" = the handwritten line. */
  hand?: "strip" | "type" | "marker";
  tilt?: Tilt;
  /** Clean-sheet keyline for a black strip that lies on a photo. */
  keyline?: boolean;
  as?: "span" | "div" | "h1" | "h2" | "h3" | "p";
  className?: string;
};

/** One line of headline, cut from paper. Words go on a strip, never on the picture. */
export function PaperStrip({
  children,
  tone = "white",
  size = "name",
  hand = "strip",
  tilt,
  keyline,
  as: Tag = "span",
  className,
}: PaperStripProps) {
  return (
    <Tag
      className={cx("zn-strip", className)}
      data-tone={tone}
      data-size={hand === "strip" ? size : undefined}
      data-hand={hand === "strip" ? undefined : hand}
      data-keyline={keyline || undefined}
      style={tiltStyle(tilt)}
    >
      {children}
    </Tag>
  );
}

type StripHeadingProps = {
  /** One strip per line. Break the headline where you would cut it with scissors. */
  lines: string[];
  as?: "h1" | "h2" | "h3" | "p";
  size?: StripSize;
  /** Tone of the first line; the rest alternate. */
  first?: "white" | "black";
  /** Tilt of each line in turn. The defaults alternate direction, as neighbours must. */
  tilts?: Tilt[];
  /** Black strips get a clean-sheet keyline (use when the heading lies on a photo). */
  keyline?: boolean;
  className?: string;
};

const DEFAULT_TILTS: Tilt[] = [-2, 1.2, -1, 1.5];

/** A headline: one strip per line, white and black alternating, each tilted against its neighbour. */
export function StripHeading({
  lines,
  as: Tag = "h2",
  size = "h2",
  first = "white",
  tilts = DEFAULT_TILTS,
  keyline,
  className,
}: StripHeadingProps) {
  const other = first === "white" ? "black" : "white";
  return (
    <Tag className={cx("zn-strips", className)} data-size={size}>
      {lines.map((line, i) => (
        <PaperStrip
          key={`${i}-${line}`}
          tone={i % 2 === 0 ? first : other}
          size={size}
          tilt={tilts[i % tilts.length]}
          keyline={keyline}
        >
          {line}
        </PaperStrip>
      ))}
    </Tag>
  );
}
