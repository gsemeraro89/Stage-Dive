// /news: the newest news (src/app/news/news-index.tsx). Served ready-made, rebuilt at most every 10 minutes.
import { NewsIndex, newsIndexMetadata } from "./news-index";

export const revalidate = 600;

export function generateMetadata() {
  return newsIndexMetadata(1);
}

export default function NewsPage() {
  return <NewsIndex page={1} />;
}
