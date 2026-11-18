// Finds a freely licensed photo for each band on Wikimedia Commons, photocopies it and stores it with its
// credit. No YouTube quota, no Claude. Run with: npm run band-photos [-- --limit 50] [-- --force]
import "dotenv/config";
import { appendFile } from "node:fs/promises";
import { artistWikidataId, lookupArtist } from "../src/lib/collector/musicbrainz";
import { createPrismaClient } from "../src/lib/db";
import { refreshBandPhotos } from "../src/lib/photos/job";
import { downloadImage, findCommonsPhoto } from "../src/lib/photos/wikimedia";

const args = process.argv.slice(2);
const limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : 50;
const force = args.includes("--force");

const db = createPrismaClient();
const run = await db.jobRun.create({ data: { job: "band-photos" } });
let stats;
try {
  stats = await refreshBandPhotos(
    db,
    {
      mbid: async (name) => (await lookupArtist(name))?.mbid ?? null,
      wikidataId: (mbid) => artistWikidataId(mbid),
      findPhoto: (id) => findCommonsPhoto(id),
      download: (url) => downloadImage(url),
    },
    { limit, force },
  );
  await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: stats.errors.length === 0, summary: { ...stats } } });
} finally {
  await db.$disconnect();
}

console.log(JSON.stringify(stats, null, 2));
if (process.env.GITHUB_STEP_SUMMARY && stats) {
  const list = (title: string, items: string[]) => (items.length ? `\n**${title}**\n${items.map((x) => `- ${x}`).join("\n")}\n` : "");
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Band photos\n- Checked: ${stats.checked} · added: ${stats.added.length} · replaced: ${stats.replaced.length} · removed: ${stats.removed.length} · no usable photo: ${stats.skipped.length}\n` +
      list("Added", stats.added) +
      list("Removed", stats.removed) +
      list("No usable photo", stats.skipped) +
      list("Errors", stats.errors),
  );
}
