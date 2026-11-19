// A band page in another order: "/artists/<slug>?sort=length" or "?sort=watched" lands here (rewritten
// by src/proxy.ts; the address in the browser keeps "?sort="). Same page, served ready-made too;
// noindex,follow with its canonical on the main band page.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BandPage, bandMetadata, isSort } from "../../band-page";

export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string; sort: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, sort } = await params;
  return isSort(sort) ? bandMetadata(slug, sort) : {};
}

export default async function SortedArtistPage({ params }: Props) {
  const { slug, sort } = await params;
  if (!isSort(sort) || sort === "year") notFound();
  return <BandPage slug={slug} sort={sort} />;
}
