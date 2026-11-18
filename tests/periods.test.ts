// "This month" and year pages: which period a date belongs to, and which year the menu shows.
import { describe, expect, it } from "vitest";
import {
  menuYear,
  monthHref,
  monthLabel,
  monthOf,
  monthRange,
  parseMonth,
  parseYear,
  previousMonth,
  yearRange,
} from "../src/lib/periods";

const at = (iso: string) => new Date(iso);

describe("months", () => {
  it("knows the current month and its range", () => {
    expect(monthOf(at("2026-11-17T13:00:00Z"))).toEqual({ year: 2026, month: 11 });
    const { start, end } = monthRange({ year: 2026, month: 11 });
    expect(start.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("rolls over the year in December", () => {
    expect(monthRange({ year: 2026, month: 12 }).end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(previousMonth({ year: 2027, month: 1 })).toEqual({ year: 2026, month: 12 });
  });

  it("labels and links", () => {
    expect(monthLabel({ year: 2026, month: 11 })).toBe("November 2026");
    expect(monthHref({ year: 2026, month: 3 })).toBe("/concerts/year/2026/03");
  });

  it("year range", () => {
    const { start, end } = yearRange(2026);
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("the year in the menu (owner: it becomes the new year at the end of January)", () => {
  it("stays on last year through January", () => {
    expect(menuYear(at("2027-01-01T00:00:00Z"))).toBe(2026);
    expect(menuYear(at("2027-01-31T23:59:59Z"))).toBe(2026);
  });
  it("moves on 1 February", () => {
    expect(menuYear(at("2027-02-01T00:00:00Z"))).toBe(2027);
    expect(menuYear(at("2026-11-17T12:00:00Z"))).toBe(2026);
  });
});

describe("years and months from URLs", () => {
  const now = at("2026-11-17T12:00:00Z");
  it("accepts real past and current periods", () => {
    expect(parseYear("2026", now)).toBe(2026);
    expect(parseYear("2019", now)).toBe(2019);
    expect(parseMonth(2026, "11", now)).toEqual({ year: 2026, month: 11 });
    expect(parseMonth(2025, "12", now)).toEqual({ year: 2025, month: 12 });
  });
  it("refuses future, malformed and very old ones", () => {
    expect(parseYear("2027", now)).toBeNull();
    expect(parseYear("1999", now)).toBeNull();
    expect(parseYear("26", now)).toBeNull();
    expect(parseYear("2026abc", now)).toBeNull();
    expect(parseMonth(2026, "12", now)).toBeNull();
    expect(parseMonth(2026, "13", now)).toBeNull();
    expect(parseMonth(2026, "3", now)).toBeNull();
  });
});

describe("menu lists of months and years", async () => {
  const { buildPeriodIndex, shortMonthLabel } = await import("../src/lib/periods");
  const now = at("2026-11-17T12:00:00Z");
  const d = (iso: string) => at(`${iso}T10:00:00Z`);

  it("counts months and years, newest first, and skips empty months", () => {
    const index = buildPeriodIndex(
      [d("2026-11-02"), d("2026-10-01"), d("2026-10-30"), d("2026-08-15"), d("2025-12-31"), d("2019-05-05")],
      now,
    );
    expect(index.months).toEqual([
      { year: 2026, month: 11, count: 1 },
      { year: 2026, month: 10, count: 2 },
      { year: 2026, month: 8, count: 1 },
      { year: 2025, month: 12, count: 1 },
      { year: 2019, month: 5, count: 1 },
    ]);
    expect(index.years).toEqual([
      { year: 2026, count: 4 },
      { year: 2025, count: 1 },
      { year: 2019, count: 1 },
    ]);
  });

  it("keeps at most 12 months and ignores future dates", () => {
    const dates = Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2026, 10 - i, 10)));
    dates.push(d("2027-03-01"));
    const index = buildPeriodIndex(dates, now);
    expect(index.months).toHaveLength(12);
    expect(index.months[0]).toEqual({ year: 2026, month: 11, count: 1 });
    expect(index.years.some((y) => y.year === 2027)).toBe(false);
  });

  it("short labels", () => {
    expect(shortMonthLabel({ year: 2026, month: 10 })).toBe("Oct '26");
    expect(shortMonthLabel({ year: 2025, month: 1 })).toBe("Jan '25");
  });
});
