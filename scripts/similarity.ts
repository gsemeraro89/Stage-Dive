// Similar artists. Run with: npm run similarity [-- --no-fetch] [-- --limit 40]
//   default     ask ListenBrainz for artists whose list is missing or a month old, then recompute
//   --no-fetch  only recompute from what is stored (used after each collector run)
import "dotenv/config";
import { createPrismaClient } from "../src/lib/db";
import { recompute, refreshExternal, type FetchStats } from "../src/lib/similarity/job";

const args = process.argv.slice(2);
const noFetch = args.includes("--no-fetch");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;

const db = createPrismaClient();
const run = await db.jobRun.create({ data: { job: "similarity" } });
let external: FetchStats | null = null;
let summary: Record<string, unknown> = {};
try {
  if (!noFetch) external = await refreshExternal(db, { limit });
  const ranked = await recompute(db);
  const artists = new Set(ranked.map((r) => r.artistId)).size;
  summary = { artistsWithSuggestions: artists, pairs: ranked.length, external };
  console.log(JSON.stringify(summary, null, 2));
} catch (e) {
  process.exitCode = 1;
  summary = { error: (e as Error).message, external };
  console.error(e);
} finally {
  await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: process.exitCode !== 1, summary: summary as object } });
  await db.$disconnect();
}
