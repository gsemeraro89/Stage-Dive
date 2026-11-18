// Finds the best available thumbnail size for every concert and stores it. Run with: npm run db:thumbnails
// Uses YouTube's public image server only (no API key, no quota).
import "dotenv/config";
import { createPrismaClient } from "../src/lib/db";
import { bestKnownSize, findBestThumbnail, thumbnailUrl } from "../src/lib/thumbnails";

const db = createPrismaClient();
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
