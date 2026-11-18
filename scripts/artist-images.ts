// Artist pictures from their official YouTube channels. Run with: npm run artist-images
import "dotenv/config";
import { createPrismaClient } from "../src/lib/db";
import { musicBrainzChannelFinder, refreshArtistImages } from "../src/lib/collector/artist-images";
import { YouTubeClient } from "../src/lib/collector/youtube";
import { chooseCovers, CoverChooser } from "../src/lib/collector/covers";

const db = createPrismaClient();
const yt = new YouTubeClient(process.env.YOUTUBE_API_KEY ?? "", Number(process.env.IMAGE_UNIT_BUDGET ?? 150));
try {
  const stats = await refreshArtistImages(db, { avatars: (refs) => yt.channelAvatars(refs), channelFromMusicBrainz: musicBrainzChannelFinder(db) });
  console.log(JSON.stringify({ ...stats, youtubeUnits: yt.unitsUsed }, null, 2));
  // Then choose each artist's cover among their concert thumbnails (Claude Haiku, once per artist).
  const chooser = new CoverChooser();
  const covers = await chooseCovers(db, chooser.choose);
  console.log(JSON.stringify({ covers, costUsd: Math.round(chooser.estimatedCostUsd() * 1000) / 1000 }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
