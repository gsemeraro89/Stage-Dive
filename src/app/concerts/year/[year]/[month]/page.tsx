// One month's uploads, e.g. /concerts/year/2026/11 (BRIEF 4.10).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { monthHref, monthLabel, monthOf, monthRange, parseMonth, parseYear } from "@/lib/periods";
import { concertsUploadedBetween } from "@/lib/queries";
import { MonthView } from "../../../_period/MonthView";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ year: string; month: string }> };

async function resolve(params: Props["params"]) {
  const { year: y, month: m } = await params;
  const now = new Date();
  const year = parseYear(y, now);
  return year === null ? null : parseMonth(year, m, now);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const month = await resolve(params);
  if (!month) return {};
  const { start, end } = monthRange(month);
  const empty = (await concertsUploadedBetween(start, end, 1)).length === 0;
  return {
    title: `DJ concerts uploaded in ${monthLabel(month)}`,
    description: `Every full-length electronic DJ concert and live act uploaded in ${monthLabel(month)}, free to watch in full.`,
    alternates: { canonical: monthHref(month) },
    robots: empty ? { index: false, follow: true } : undefined,
  };
}

export default async function MonthPage({ params }: Props) {
  const month = await resolve(params);
  if (!month) notFound();
  const { start, end } = monthRange(month);
  const now = monthOf(new Date());
  const current = now.year === month.year && now.month === month.month;
  return <MonthView month={month} concerts={await concertsUploadedBetween(start, end)} current={current} />;
}
