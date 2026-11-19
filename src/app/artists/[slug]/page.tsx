// Band page, newest gigs first (src/app/artists/[slug]/band-page.tsx). Built on its first visit,
// then served ready-made and rebuilt in the background at most every 10 minutes. The other orders
// ("?sort=length", "?sort=watched") are rewritten by src/proxy.ts to ./sorted/[sort].
import type { Metadata } from "next";
import { BandPage, bandMetadata } from "./band-page";

export const revalidate = 600;
/** No page is built ahead: each one is built on its first visit, then kept. */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return bandMetadata((await params).slug, "year");
}

export default async function ArtistPage({ params }: Props) {
  return <BandPage slug={(await params).slug} sort="year" />;
}
