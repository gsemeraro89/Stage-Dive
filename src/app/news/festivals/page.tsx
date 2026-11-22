// /news/festivals: a news topic page (src/app/news/news-hub.tsx, src/lib/news/hubs.ts). Served ready-made, rebuilt at most every 10 minutes.
import { NewsHubPage, newsHubMetadata } from "../news-hub";

export const revalidate = 600;

export function generateMetadata() {
  return newsHubMetadata("festivals");
}

export default function Page() {
  return <NewsHubPage slug="festivals" />;
}
