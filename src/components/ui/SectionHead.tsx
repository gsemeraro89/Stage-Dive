import Link from "next/link";

/** "(06)" */
export function count2(n: number): string {
  return `(${String(n).padStart(2, "0")})`;
}

/**
 * Every section starts the same way: a 1px ink rule, a display title, an optional mono
 * note such as "(06)", and an optional mono link on the right.
 */
export function SectionHead({
  id,
  title,
  note,
  href,
  linkLabel,
  as: Tag = "h2",
  children,
}: {
  id?: string;
  title: React.ReactNode;
  note?: React.ReactNode;
  href?: string;
  linkLabel?: string;
  as?: "h1" | "h2";
  children?: React.ReactNode;
}) {
  return (
    <div className="od-head">
      <Tag id={id} className="display size-section">
        {title}
      </Tag>
      {note !== undefined && <span className="meta od-head-note">{note}</span>}
      {children}
      {href && linkLabel && (
        <Link href={href} className="od-link">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
