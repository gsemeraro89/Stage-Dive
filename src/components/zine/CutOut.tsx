import Link from "next/link";
import type { ReactNode } from "react";
import { cx, tiltStyle, type Tilt } from "./tilt";

type CutOutProps = {
  children: ReactNode;
  tone?: "black" | "white" | "pink";
  tilt?: Tilt;
  /** A sticker: heavy type and a 4px black edge ("3 new gigs today"). */
  sticker?: boolean;
  /** Makes it a link. Links are at least 48px tall. */
  href?: string;
  /** Marks the link for the page the visitor is on. */
  current?: boolean;
  className?: string;
};

/** A small piece of cut paper: a nav label, a tag, a sticker. Tilt 1-4 degrees, against its neighbour. */
export function CutOut({ children, tone = "black", tilt, sticker, href, current, className }: CutOutProps) {
  const props = {
    className: cx("zn-cutout", className),
    "data-tone": tone,
    "data-sticker": sticker || undefined,
    style: tiltStyle(tilt),
  };
  if (href) {
    return (
      <Link href={href} aria-current={current ? "page" : undefined} {...props}>
        {children}
      </Link>
    );
  }
  return <span {...props}>{children}</span>;
}
