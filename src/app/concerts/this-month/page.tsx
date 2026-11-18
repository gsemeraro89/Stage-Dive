// "This month": concerts uploaded to YouTube in the current calendar month (BRIEF 4.10).
// Rendered on every request, so it rolls over to the new month on the 1st by itself.
import type { Metadata } from "next";
import { monthHref, monthLabel, monthOf, monthRange } from "@/lib/periods";
import { concertsUploadedBetween } from "@/lib/queries";
import { MonthView } from "../_period/MonthView";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const month = monthOf(new Date());
  return {
    title: `New DJ concerts this month — ${monthLabel(month)}`,
    description: `Full-length electronic DJ concerts and live acts uploaded in ${monthLabel(month)}, free to watch in full.`,
    // Same content as the month's own page, which is the one Google should list.
    alternates: { canonical: monthHref(month) },
  };
}

export default async function ThisMonthPage() {
  const month = monthOf(new Date());
  const { start, end } = monthRange(month);
  return <MonthView month={month} concerts={await concertsUploadedBetween(start, end)} current />;
}
