// Home page (17 Nov 2026): direction B "Places" with "Four ways in" (owner choice). The page itself
// is src/app/_home/HomePage.tsx; the full list of sets is at /sets.
// Old links to the list with filters ("/?genre=techno") keep working: they are sent to /sets.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import HomePage from "./_home/HomePage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "FullDJSet — free full-length electronic DJ sets" },
  description:
    "Every free, full-length electronic DJ set on YouTube, played right here: Cercle, Boiler Room, festivals and clubs, by artist, festival, genre and setting.",
  alternates: { canonical: "/" },
};

const LIST_PARAMS = ["q", "genre", "artist", "venue", "setting", "sort", "page"];

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  if (LIST_PARAMS.some((k) => params[k] !== undefined)) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) for (const one of [v].flat()) if (one !== undefined) query.append(k, one);
    redirect(`/sets?${query.toString()}`);
  }
  return <HomePage />;
}
