// One month of uploads: used by "This month" and by /sets/year/<year>/<month>.
// Look: design/DESIGN.md section 9, "This month and year pages".
import Link from "next/link";
import { Feature, LeadGrid, SetRows } from "@/components/catalogue/SetTile";
import { BigName } from "@/components/ui/BigName";
import { PeriodNav } from "@/components/ui/PeriodNav";
import { count2, SectionHead } from "@/components/ui/SectionHead";
import { MONTH_NAMES, monthHref, monthLabel, monthOf, previousMonth, type Month } from "@/lib/periods";
import type { SetView } from "@/lib/queries";

/** The newest sets are shown as pictures (lead + four); the rest of the month follows as rows. */
const LEAD = 5;

export function MonthView({ month, sets, current }: { month: Month; sets: SetView[]; current: boolean }) {
  const label = monthLabel(month);
  const name = MONTH_NAMES[month.month - 1];
  const before = previousMonth(month);
  // The month after, unless it has not started yet (its page does not exist).
  const now = monthOf(new Date());
  const after: Month = month.month === 12 ? { year: month.year + 1, month: 1 } : { year: month.year, month: month.month + 1 };
  const hasAfter = after.year * 12 + after.month <= now.year * 12 + now.month;
  const yearHref = `/sets/year/${month.year}`;
  const lead = sets.slice(0, LEAD);
  const rest = sets.slice(LEAD);

  return (
    <main data-od="period" data-period="month">
      <header className="od-pagehero od-period-hero">
        <p className="od-period-rail meta">
          <span className="od-acid">{current ? "This month" : "Archive"}</span>
          <span className="od-muted" data-od="result-count">
            {sets.length} {sets.length === 1 ? "set" : "sets"} uploaded
          </span>
          <Link href={yearHref} className="od-link">
            All of {month.year}
          </Link>
        </p>
        <BigName id="period-title" name={label} max="11vw" maxPhone="19vw" lines={1}>
          {current && <span className="od-sr">This month: </span>}
          {name} <span className="od-period-outline">{month.year}</span>
        </BigName>
      </header>

      {sets.length === 0 ? (
        <section className="od-section od-period-body" aria-labelledby="period-title" data-od="month">
          <div className="od-empty od-period-empty" data-od="empty">
            <p className="display">{current ? "Nothing uploaded yet this month" : `Nothing uploaded in ${label}`}</p>
            <p>
              {current
                ? "New full sets appear here as soon as the daily check finds them."
                : "No full set from this month is in the archive."}
            </p>
            <Link href="/sets" className="od-link">
              See the latest sets
            </Link>
          </div>
        </section>
      ) : (
        <section
          className="od-section od-period-body"
          aria-labelledby={lead.length === 1 ? "period-title" : "period-uploads"}
          data-od="month"
        >
          {lead.length === 1 ? (
            <div className="od-period-single">
              <Feature set={lead[0]} kicker={current ? "The only set so far" : `The only set of ${name}`} credit />
            </div>
          ) : (
            <>
              <SectionHead id="period-uploads" title={current ? "New uploads" : "Uploads"} note={count2(sets.length)} />
              <LeadGrid sets={lead} label={`Newest sets of ${label}`} priority />
            </>
          )}
        </section>
      )}

      {rest.length > 0 && (
        <section className="od-section" aria-labelledby="period-rest" data-od="month-rest">
          <SectionHead id="period-rest" title={`Earlier in ${name}`} note={count2(rest.length)} />
          <SetRows sets={rest} label={`Earlier sets of ${label}`} />
        </section>
      )}

      <PeriodNav
        label="Other months"
        earlier={{ kicker: "Earlier", label: monthLabel(before), href: monthHref(before) }}
        later={
          hasAfter
            ? { kicker: "Later", label: monthLabel(after), href: monthHref(after) }
            : { kicker: "The year", label: `All of ${month.year}`, href: yearHref }
        }
      />
    </main>
  );
}
