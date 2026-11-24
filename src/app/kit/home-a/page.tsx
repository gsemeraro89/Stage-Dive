// TEMPORARY preview of homepage direction A (owner's choice pending, 24 Nov 2026). Not indexed, not in
// the sitemap. Remove this route when the chosen direction ships at "/".
import type { Metadata } from "next";
import HomeA from "../../_home/HomeA";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Homepage direction A (preview)", robots: { index: false, follow: false } };

export default function Preview() {
  return <HomeA />;
}
