// TEMPORARY preview of homepage direction B (owner's choice pending, 24 Nov 2026). Not indexed, not in
// the sitemap. Remove this route when the chosen direction ships at "/".
import type { Metadata } from "next";
import HomeB from "../../_home/HomeB";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Homepage direction B (preview)", robots: { index: false, follow: false } };

export default function Preview() {
  return <HomeB />;
}
