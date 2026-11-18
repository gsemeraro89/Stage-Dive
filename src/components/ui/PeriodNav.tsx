import Link from "next/link";

export interface PeriodLink {
  /** Small mono word above the name: "Earlier", "Later", "The year". */
  kicker: string;
  label: string;
  href: string;
}

/**
 * Foot of a month or year page: the period before on the left, the one after on the right.
 * Text only, under an ink rule. No arrows (they are not in the font subset): the words say the direction.
 */
export function PeriodNav({ label, earlier, later }: { label: string; earlier?: PeriodLink; later?: PeriodLink }) {
  if (!earlier && !later) return null;
  const side = (link: PeriodLink, end?: boolean) => (
    <Link href={link.href} className={`od-period-step${end ? " od-period-step--end" : ""}`}>
      <span className="meta">{link.kicker}</span>
      <span className="title">{link.label}</span>
    </Link>
  );
  return (
    <nav className="od-period-nav" aria-label={label} data-od="period-nav">
      {earlier && side(earlier)}
      {later && side(later, true)}
    </nav>
  );
}
