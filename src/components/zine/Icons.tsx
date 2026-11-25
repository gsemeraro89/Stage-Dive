import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { cx, tiltStyle, type Tilt } from "./tilt";

/* The six icons of brand board 02 (plus "previous", from the player on board 03): solid shapes cut
   from black paper with scissors, so no two edges are quite parallel. Never outlines. The points
   below are the board's own; do not tidy them. Each draws in currentColor on a 48x48 grid. */

type GlyphProps = { size?: number };

function Glyph({ size, children }: GlyphProps & { children: ReactNode }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 48 48" fill="currentColor">
      {children}
    </svg>
  );
}

export function PlayGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <polygon points="9,4 41,23 10,45" />
    </Glyph>
  );
}

/** "Open the gig": an arrow, for a picture that opens the concert's page instead of playing it. */
export function OpenGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <polygon points="16,6 43,4 44,32 35,23 13,45 4,36 26,14" />
    </Glyph>
  );
}

export function PauseGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <polygon points="8,5 20,4 21,44 9,45" />
      <polygon points="28,4 41,5 40,45 29,44" />
    </Glyph>
  );
}

export function NextGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <polygon points="5,6 29,24 6,43" />
      <polygon points="32,5 43,6 42,44 33,43" />
    </Glyph>
  );
}

export function PreviousGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <polygon points="43,6 19,24 42,43" />
      <polygon points="5,6 16,5 15,43 6,44" />
    </Glyph>
  );
}

export function SetlistGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <polygon points="5,6 11,5 12,12 6,13" />
      <polygon points="17,6 43,5 44,12 17,13" />
      <polygon points="5,20 12,21 11,28 6,27" />
      <polygon points="17,21 39,20 40,27 17,28" />
      <polygon points="6,35 11,36 12,43 5,42" />
      <polygon points="17,36 44,35 43,43 17,42" />
    </Glyph>
  );
}

export function SearchGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path
        fillRule="evenodd"
        d="M20 5 L33 9 L37 21 L30 33 L17 35 L7 27 L6 14 Z M20 12 L13 16 L13 25 L19 28 L28 27 L30 19 L27 13 Z"
      />
      <polygon points="29,31 35,27 45,40 39,45" />
    </Glyph>
  );
}

export function ShareGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <polygon points="26,4 45,21 27,37 27,27 14,29 5,43 7,22 26,14" />
    </Glyph>
  );
}

export const GLYPHS = {
  play: PlayGlyph,
  open: OpenGlyph,
  pause: PauseGlyph,
  next: NextGlyph,
  previous: PreviousGlyph,
  setlist: SetlistGlyph,
  search: SearchGlyph,
  share: ShareGlyph,
} as const;

export type IconName = keyof typeof GLYPHS;

type IconButtonProps = {
  icon: IconName;
  /** What the control does, for screen readers and the tooltip: "Pause", "Next song", "Share this gig". */
  label: string;
  /** white = clean label; black = toner label; on-toner = paper outline, for the player bar. */
  tone?: "white" | "black" | "on-toner";
  /** The live control (pause, while playing) sits on pink. One per view. */
  live?: boolean;
  /** 48px (default) or 56px. Never smaller: 48px is the touch floor. */
  size?: "default" | "large";
  /** Leave at 0 for anything pressed twice (play/pause, next). */
  tilt?: Tilt;
  /** A link instead of a button. */
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** For toggles such as play/pause. */
  pressed?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
};

/** An icon on its square label: a real <button> (or <a> with href), named by `label`, 48px or more. */
export function IconButton({
  icon,
  label,
  tone = "white",
  live,
  size = "default",
  tilt,
  href,
  onClick,
  pressed,
  disabled,
  type = "button",
  className,
}: IconButtonProps) {
  const Icon = GLYPHS[icon];
  const shared = {
    className: cx("zn-icon", className),
    "data-tone": live ? "pink" : tone,
    "data-size": size === "large" ? "large" : undefined,
    "aria-label": label,
    title: label,
    style: tiltStyle(tilt),
  };
  if (href) {
    return (
      <Link href={href} {...shared}>
        <Icon />
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} aria-pressed={pressed} disabled={disabled} {...shared}>
      <Icon />
    </button>
  );
}

type PressButtonProps = {
  children: ReactNode;
  icon?: IconName;
  /** pink = the one live thing in the view ("Play it loud"); black and white for everything else. */
  tone?: "pink" | "black" | "white";
  size?: "small" | "default" | "large";
  /** Full width (the phone layout). */
  wide?: boolean;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
};

/** The big labelled button. Dead straight; it lifts 2px on hover and slams 4px down when pressed. */
export function PressButton({
  children,
  icon,
  tone = "pink",
  size = "default",
  wide,
  href,
  onClick,
  disabled,
  type = "button",
  className,
}: PressButtonProps) {
  const Icon = icon ? GLYPHS[icon] : null;
  const shared = {
    className: cx("zn-btn", className),
    "data-tone": tone,
    "data-size": size === "default" ? undefined : size,
    "data-wide": wide || undefined,
  };
  const body = (
    <>
      {Icon && <Icon />}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} {...shared}>
        {body}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} {...shared}>
      {body}
    </button>
  );
}
