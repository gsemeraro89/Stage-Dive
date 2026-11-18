// Finds the best available thumbnail size for every set and stores it. Run with: npm run db:thumbnails
// Uses YouTube's public image server only (no API key, no quota).
import "dotenv/config";
import { createPrismaClient } from "../src/lib/db";
import { bestKnownSize, findBestThumbnail, thumbnailUrl } from "../src/lib/thumbnails";

const db = createPrismaClient();
try {
  const all = process.argv.includes("--all");
  const sets = await db.set.findMany({
    where: all ? {} : { thumbnailUrl: null },
    select: { id: true, youtubeId: true, thumbnailUrl: true },
  });
  const counts: Record<string, number> = {};
  for (const set of sets) {
    const best = await findBestThumbnail(set.youtubeId);
    counts[best ?? "unknown"] = (counts[best ?? "unknown"] ?? 0) + 1;
    if (best && (best !== bestKnownSize(set.thumbnailUrl) || !set.thumbnailUrl)) {
      await db.set.update({ where: { id: set.id }, data: { thumbnailUrl: thumbnailUrl(set.youtubeId, best) } });
    }
  }
  console.log(`Thumbnails checked for ${sets.length} sets:`, counts);
} catch (error) {
  // Never block the site from starting because thumbnails could not be checked.
  console.error("Thumbnail check failed (site still starts):", error);
} finally {
  await db.$disconnect();
}
