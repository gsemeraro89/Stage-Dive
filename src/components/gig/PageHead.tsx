// The top of every page that is not the homepage (boards 05 and 06): the typed trail back up
// ("BANDS / N / NIRVANA"), the name on cut strips, and one typed line of data.
import Link from "next/link";
import type { ReactNode } from "react";
import { CutOut, PaperStrip, StripHeading } from "@/components/zine";

export type Crumb = { label: string; href?: string };

export function Crumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="You are here" className="pg-crumbs">
      <ol>
        {trail.map((c, i) => (
          <li key={`${i}-${c.label}`}>
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current={i === trail.length - 1 ? "page" : undefined}>{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHead({
  trail,
  lines,
  data,
  note,
  first = "white",
  children,
}: {
  trail: Crumb[];
  /** The headline, one strip per line. */
  lines: string[];
  /** GLASTONBURY 2024 /// 1:14:20 */
  data?: ReactNode;
  /** The one handwritten line. */
  note?: string;
  first?: "white" | "black";
  children?: ReactNode;
}) {
  return (
    <header className="pg-head">
      <Crumbs trail={trail} />
      <StripHeading as="h1" size="h1" lines={lines} first={first} className="zn-slap" />
      {data && (
        <PaperStrip as="p" hand="type" tone="black" tilt={0.6} className="pg-head-data">
          {data}
        </PaperStrip>
      )}
      {note && <p className="zn-marker pg-head-note">{note}</p>}
      {children}
    </header>
  );
}

/** A section's name on a black strip (h2), as on the homepage. */
export function SectionTitle({ id, children, tilt = -1.2, small }: { id?: string; children: ReactNode; tilt?: number; small?: boolean }) {
  return (
    <PaperStrip as="h2" size={small ? "name" : "h2"} tone="black" tilt={tilt} className="pg-title">
      <span id={id}>{children}</span>
    </PaperStrip>
  );
}

/** Nothing to show: the line on strips, then what to do about it. */
export function EmptyNote({ lines, children }: { lines: string[]; children?: ReactNode }) {
  return (
    <div className="pg-empty" data-od="empty">
      <StripHeading as="p" size="h2" lines={lines} />
      {children}
    </div>
  );
}

/** A handful of cut-out links under a small label ("Other decades"): somewhere to go next. */
export function TagLinks({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label={label} className="pg-tags">
      <span className="zn-label">{label}</span>
      {items.map((item, i) => (
        <CutOut key={item.href} href={item.href} tone={i % 2 ? "black" : "white"} tilt={i % 2 ? 1.5 : -1.5} className="zn-lift">
          {item.label}
        </CutOut>
      ))}
    </nav>
  );
}
