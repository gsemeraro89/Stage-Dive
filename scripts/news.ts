// The news job (owner, 21 Nov 2026): press items about our bands and festivals, written and
// fact-checked by Claude Haiku within NEWS_BUDGET_USD a month (default $5). src/lib/news/job.ts.
// Run by collect.yml after the collector, by news.yml, or by hand:
//   npm run news -- [--dry-run] [--max 25]
// --dry-run reads the feeds and lists the items that would go to Claude: no Claude cost, nothing written.
import "dotenv/config";
import { getDb } from "../src/lib/db";
import { runNews } from "../src/lib/news/run";

const dryRun = process.argv.includes("--dry-run");
const maxArg = process.argv.indexOf("--max");
const maxItems = maxArg > 0 ? Number(process.argv[maxArg + 1]) : undefined;

async function main() {
  const db = getDb();
  console.log(JSON.stringify({ news: await runNews(db, { dryRun, maxItems }) }, null, 2));
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
