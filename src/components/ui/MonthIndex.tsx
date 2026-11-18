import Link from "next/link";
import { MONTH_NAMES, monthHref } from "@/lib/periods";

/**
 * The twelve months of a year as one strip: short name, number of concerts, and a 3px bar that
 * compares the months with each other. A month with concerts is a link to its page; a month
 * without concerts, or one that has not started, is muted text.
 *
 * @param counts  concerts per month, keyed 1–12; months without concerts may be missing
 * @param started the last month of this year that has begun (12 for a past year)
 */
export function MonthIndex({
  year,
  counts,
  started = 12,
}: {
  year: number;
  counts: ReadonlyMap<number, number>;
  started?: number;
}) {
  const top = Math.max(1, ...counts.values());
  return (
    <ol className="od-months" aria-label={`Months of ${year}`} data-od="month-index">
      {MONTH_NAMES.map((name, i) => {
        const month = i + 1;
        const count = counts.get(month) ?? 0;
        const body = (
          <>
            <span className="meta od-month-name">
              <span aria-hidden="true">{name.slice(0, 3)}</span>
              <span className="od-sr">{name}</span>
            </span>
            <span className="display od-month-count">
              {month > started ? (
                <span className="od-sr">not started</span>
              ) : (
                <>
                  {count}
                  <span className="od-sr">{count === 1 ? " concert" : " concerts"}</span>
                </>
              )}
            </span>
            <span className="od-bar" aria-hidden="true">
              {count > 0 && <span style={{ width: `${Math.max(4, (count / top) * 100)}%` }} />}
            </span>
          </>
        );
        return (
          <li key={month}>
            {count > 0 ? (
              <Link href={monthHref({ year, month })} className="od-month">
                {body}
              </Link>
            ) : (
              <span className="od-month od-month--empty">{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
