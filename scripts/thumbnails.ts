// Finds the best available thumbnail size for every concert and stores it. Run with: npm run db:thumbnails
// Uses YouTube's public image server only (no API key, no quota).
// Also runs before every start on Render: it gives up after STARTUP_STEP_LIMIT_MS so the site always starts.
import "dotenv/config";
import { createPrismaClient } from "../src/lib/db";
import { runWithDeadline, STARTUP_STEP_LIMIT_MS } from "../src/lib/deadline";
import { bestKnownSize, findBestThumbnail, thumbnailUrl } from "../src/lib/thumbnails";

const db = createPrismaClient();
const result = await runWithDeadline(async () => {
  try {
    const all = process.argv.includes("--all");
    const concerts = await db.concert.findMany({
      where: all ? {} : { thumbnailUrl: null },
      select: { id: true, youtubeId: true, thumbnailUrl: true },
    });
    const counts: Record<string, number> = {};
    for (const concert of concerts) {
      const best = await findBestThumbnail(concert.youtubeId);
      counts[best ?? "unknown"] = (counts[best ?? "unknown"] ?? 0) + 1;
      if (best && (best !== bestKnownSize(concert.thumbnailUrl) || !concert.thumbnailUrl)) {
        await db.concert.update({ where: { id: concert.id }, data: { thumbnailUrl: thumbnailUrl(concert.youtubeId, best) } });
      }
    }
    console.log(`Thumbnails checked for ${concerts.length} concerts:`, counts);
  } catch (error) {
    // Never block the site from starting because thumbnails could not be checked.
    console.error("Thumbnail check failed (site still starts):", error);
  } finally {
    await db.$disconnect();
  }
}, STARTUP_STEP_LIMIT_MS);
if (result.timedOut) {
  // Thumbnails already stored are kept; the rest are checked on the next start.
  console.warn(`Thumbnail check gave up after ${STARTUP_STEP_LIMIT_MS / 1000}s (site still starts).`);
  process.exit(0);
}
