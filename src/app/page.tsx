// Home page (17 Nov 2026): direction B "Places" with "Four ways in" (owner choice). The page itself
// is src/app/_home/HomePage.tsx; the full list of concerts is at /concerts.
// Old links to the list with filters ("/?genre=metal") are sent to /concerts by src/proxy.ts before
// they reach this page, so it can be served ready-made.
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { organization, website } from "@/lib/structured-data";
import HomePage from "./_home/HomePage";

// Rebuilt in the background at most every 10 minutes (speed, lesson from OpenDecks).
export const revalidate = 600;

export const metadata: Metadata = {
  title: { absolute: "STAGEDIVE · Full Rock Concerts and Setlists" },
  description:
    "Full rock concerts, the whole show, played right here: festivals, rooms and band channels, by band, festival, decade, genre and tour, with setlists you can click.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <JsonLd data={[website(), organization()]} />
      <HomePage />
    </>
  );
}
