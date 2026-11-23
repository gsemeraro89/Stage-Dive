// The news job (owner, 21 Nov 2026): press items about our bands and festivals, written and
// fact-checked by Claude Haiku within NEWS_BUDGET_USD a month (default $5). src/lib/news/job.ts.
// Run by collect.yml after the collector, by news.yml, or by hand:
//   npm run news -- [--dry-run] [--max 25]
// --dry-run reads the feeds and lists the items that would go to Claude: no Claude cost, nothing written.
// A real run then looks for free festival photos for the news pictures (Wikidata/Commons, no cost).
import "dotenv/config";
import { getDb } from "../src/lib/db";
import { refreshFestivalPhotos } from "../src/lib/news/festival-photos";
import { runNews } from "../src/lib/news/run";

const dryRun = process.argv.includes("--dry-run");
const maxArg = process.argv.indexOf("--max");
const maxItems = maxArg > 0 ? Number(process.argv[maxArg + 1]) : undefined;

async function main() {
  const db = getDb();
  console.log(JSON.stringify({ news: await runNews(db, { dryRun, maxItems }) }, null, 2));
  // Free festival photos for the news pictures (src/lib/news/festival-photos.ts): festivals not looked at in
  // 30 days, festivals in the news first. Wikidata and Commons only, no cost; a failure never fails the news.
  if (!dryRun) {
    const photos = await refreshFestivalPhotos(db).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    console.log(JSON.stringify({ festivalPhotos: photos }, null, 2));
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
