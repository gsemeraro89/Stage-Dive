// Home page (17 Nov 2026): direction B "Places" with "Four ways in" (owner choice). The page itself
// is src/app/_home/HomePage.tsx; the full list of concerts is at /concerts.
// Old links to the list with filters ("/?genre=techno") keep working: they are sent to /concerts.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import HomePage from "./_home/HomePage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "STAGEDIVE — full rock gigs, free" },
  description:
    "Every free, full rock concert, played right here: festival archives and band channels, by band, festival, room, decade, genre and tour.",
  alternates: { canonical: "/" },
};

const LIST_PARAMS = ["q", "genre", "artist", "venue", "venueKind", "sort", "page"];

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  if (LIST_PARAMS.some((k) => params[k] !== undefined)) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) for (const one of [v].flat()) if (one !== undefined) query.append(k, one);
    redirect(`/concerts?${query.toString()}`);
  }
  return <HomePage />;
}
