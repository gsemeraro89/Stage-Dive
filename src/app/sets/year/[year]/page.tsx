// A year of uploads, e.g. /sets/year/2026 (BRIEF 4.10): each month with its count and most watched sets.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartList, SetRows } from "@/components/catalogue/SetTile";
import { BigName } from "@/components/ui/BigName";
import { MonthIndex } from "@/components/ui/MonthIndex";
import { PeriodNav } from "@/components/ui/PeriodNav";
import { SectionHead } from "@/components/ui/SectionHead";
import { FIRST_YEAR, MONTH_NAMES, monthHref, monthOf, parseYear } from "@/lib/periods";
import { yearOverview } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ year: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = parseYear((await params).year, new Date());
  if (year === null) return {};
  const overview = await yearOverview(year, 0);
  return {
    title: `DJ sets of ${year}`,
    description: `${overview.total} full-length electronic DJ sets and live acts uploaded in ${year}, month by month, free to watch in full.`,
    alternates: { canonical: `/sets/year/${year}` },
    robots: overview.total === 0 ? { index: false, follow: true } : undefined,
  };
}

export default async function YearPage({ params }: Props) {
  const year = parseYear((await params).year, new Date());
  if (year === null) notFound();
  const overview = await yearOverview(year);
  // Months of this year that have begun: later ones are shown without a figure.
  const now = monthOf(new Date());
  const started = year === now.year ? now.month : 12;
  const counts = new Map(overview.months.map((m) => [m.month, m.total]));
  return (
    <main data-od="period" data-period="year">
      <header className="od-pagehero od-period-hero" data-od="year">
        <p className="od-period-rail meta">
          <span className="od-acid">{year === now.year ? "This year" : "Archive"}</span>
          <span className="od-muted" data-od="result-count">
            {overview.total} {overview.total === 1 ? "set" : "sets"} uploaded
          </span>
          {year > FIRST_YEAR && (
            <Link href={`/sets/year/${year - 1}`} className="od-link">
              {year - 1}
            </Link>
          )}
        </p>
        <BigName id="period-title" name={String(year)} max="22vw" maxPhone="27vw" lines={1} />
        <MonthIndex year={year} counts={counts} started={started} />
      </header>

      {overview.total === 0 && (
        <section className="od-section od-period-body" aria-labelledby="period-title">
          <div className="od-empty od-period-empty" data-od="empty">
            <p className="display">No sets from {year} yet</p>
            <p>No full set uploaded in {year} is in the archive right now.</p>
            <Link href="/sets" className="od-link">
              See the latest sets
            </Link>
          </div>
        </section>
      )}

      {overview.months.map(({ month, total, top }) => {
        const name = MONTH_NAMES[month - 1];
        const href = monthHref({ year, month });
        return (
          <section key={month} className="od-section od-period-month" aria-labelledby={`m-${month}`} data-od="year-month">
            <SectionHead
              id={`m-${month}`}
              title={name}
              note={total > 1 ? `${total} sets · most watched first` : "1 set"}
              href={href}
              linkLabel={total > top.length ? `All ${total}` : "Open month"}
            />
            {/* A chart needs something to compare: from three sets up, as on artist pages. */}
            {top.length >= 3 ? (
              <ChartList sets={top} label={`Most watched in ${name} ${year}`} />
            ) : (
              <SetRows sets={top} label={`Most watched in ${name} ${year}`} />
            )}
            {total > top.length && (
              <Link href={href} className="od-link od-period-more" data-od="year-month-more">
                {total - top.length} more from {name}
              </Link>
            )}
          </section>
        );
      })}

      <PeriodNav
        label="Other years"
        earlier={year > FIRST_YEAR ? { kicker: "Earlier", label: String(year - 1), href: `/sets/year/${year - 1}` } : undefined}
        later={year < now.year ? { kicker: "Later", label: String(year + 1), href: `/sets/year/${year + 1}` } : undefined}
      />
    </main>
  );
}
