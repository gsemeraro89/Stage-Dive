// /news/page/<n>: older news (src/app/news/news-index.tsx). Followed, not indexed.
import { notFound, permanentRedirect } from "next/navigation";
import { listNews } from "@/lib/news/queries";
import { NewsIndex, newsIndexMetadata } from "../../news-index";

export const revalidate = 600;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ n: string }> };

const pageOf = (n: string) => (/^\d{1,3}$/.test(n) ? Number(n) : 0);

export async function generateMetadata({ params }: Props) {
  const page = pageOf((await params).n);
  return page > 1 ? newsIndexMetadata(page) : {};
}

export default async function OlderNews({ params }: Props) {
  const page = pageOf((await params).n);
  if (page === 1) permanentRedirect("/news");
  if (page < 2 || page > (await listNews({ page })).pages) notFound();
  return <NewsIndex page={page} />;
}
