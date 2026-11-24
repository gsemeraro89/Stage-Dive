// Home page (24 Nov 2026, owner choice): direction A "the issue". The page itself is
// src/app/_home/HomePage.tsx; the full list of concerts is at /concerts.
// Old links to the list with filters ("/?genre=metal") are sent to /concerts by src/proxy.ts before
// they reach this page, so it can be served ready-made.
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { HOME_DESCRIPTION, HOME_TITLE } from "@/lib/seo";
import { breadcrumbs, organization, website } from "@/lib/structured-data";
import HomePage from "./_home/HomePage";

// Rebuilt in the background at most every 10 minutes (speed, lesson from OpenDecks).
export const revalidate = 600;

export const metadata: Metadata = {
  // Keyword targets (src/lib/keyword-targets.ts): "full concert(s)", "full concert live", "full rock concerts".
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      {/* The lists of bands, places and rankings shown are added by the page itself (HomeJsonLd). */}
      <JsonLd data={[website(), organization(), breadcrumbs([["Home", "/"]])]} />
      <HomePage />
    </>
  );
}
