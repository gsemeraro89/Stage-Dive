import Link from "next/link";
import type { ReactNode } from "react";
import { cx, tiltStyle, type Tilt } from "./tilt";

type SheetProps = {
  children: ReactNode;
  tilt?: Tilt;
  /** Heading in Archivo Black over a 3px rule, with optional typed data on the right. */
  title?: string;
  meta?: string;
  /** Heading level for the title. */
  level?: 2 | 3 | 4;
  /** Tape and staples: pass <Tape /> / <Staple />. Tape must bridge the sheet and what is under it. */
  fixings?: ReactNode;
  /** No shadow: for a sheet lying straight on the page with nothing beneath it. */
  flat?: boolean;
  /** Makes the whole sheet a link that lifts on hover and focus. */
  href?: string;
  as?: "div" | "aside" | "section" | "article";
  label?: string;
  className?: string;
};

/** A clean sheet glued on top of the page: 3px keyline, 7px solid shadow, square edges. */
export function Sheet({
  children,
  tilt,
  title,
  meta,
  level = 2,
  fixings,
  flat,
  href,
  as: Tag = "div",
  label,
  className,
}: SheetProps) {
  const Heading = `h${level}` as "h2" | "h3" | "h4";
  const body = (
    <>
      {fixings}
      {title && (
        <div className="zn-sheet-head">
          <Heading className="zn-sheet-title">{title}</Heading>
          {meta && <span className="zn-sheet-meta">{meta}</span>}
        </div>
      )}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cx("zn-sheet zn-lift", className)} aria-label={label} style={tiltStyle(tilt)}>
        {body}
      </Link>
    );
  }
  return (
    <Tag className={cx("zn-sheet", className)} data-flat={flat || undefined} aria-label={label} style={tiltStyle(tilt)}>
      {body}
    </Tag>
  );
}
