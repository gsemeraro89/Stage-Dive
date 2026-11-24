// Writes short profiles for artists that have none. Run with: npm run profiles [-- --limit 20] [--famous]
// --famous (owner, 24 Nov 2026): the most famous bands first, by the total views of their concerts on the site.
// Owner-written bios (e.g. NTO from the seed) are never touched.
import "dotenv/config";
import { createPrismaClient } from "../src/lib/db";
import { ProfileWriter } from "../src/lib/collector/profiles";
import { artistFacts, factsAreEnough } from "../src/lib/collector/musicbrainz";

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const limit = Number(limitArg >= 0 ? args[limitArg + 1] : process.env.PROFILES_PER_RUN ?? 25);
const famous = args.includes("--famous");
const db = createPrismaClient();
const writer = new ProfileWriter();
const stats = { written: [] as string[], unsure: [] as string[], errors: [] as string[], fromMusicBrainz: 0, webSearches: 0, costUsd: 0 };

try {
  const retryBefore = new Date(Date.now() - 30 * 86_400_000);
  const where = {
    bio: null,
    AND: [
      { credits: { some: { role: "MAIN" as const } } },
      { OR: [{ profileCheckedAt: null }, { profileCheckedAt: { lt: retryBefore } }] },
    ],
  };
  const include = { credits: { take: 2, include: { concert: { select: { title: true } } } } };
  let artists;
  if (famous) {
    // Most watched first: total views of the band's published concerts.
    const ranked = await db.$queryRaw<{ id: number }[]>`
      SELECT a.id FROM artists a
      JOIN concert_artists ca ON ca.artist_id = a.id AND ca.role = 'MAIN'
      JOIN concerts c ON c.id = ca.concert_id AND c.status = 'PUBLISHED'
      WHERE a.bio IS NULL AND (a.profile_checked_at IS NULL OR a.profile_checked_at < ${retryBefore})
      GROUP BY a.id ORDER BY sum(c.view_count) DESC LIMIT ${limit}`;
    const order = new Map(ranked.map((r, i) => [r.id, i]));
    artists = (await db.artist.findMany({ where: { ...where, id: { in: [...order.keys()] } }, include })).sort(
      (x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0),
    );
  } else {
    artists = await db.artist.findMany({ where, include, take: limit });
  }
  for (const artist of artists) {
    const hint = artist.credits.map((c) => c.concert.title).join("; ");
    try {
      // Free facts first; the web is searched only when MusicBrainz does not know enough.
      let facts = null;
      try {
        facts = await artistFacts(artist.name);
      } catch {
        facts = null; // MusicBrainz busy: fall back to the web search
      }
      const p = await writer.write(artist.name, hint, factsAreEnough(facts) ? facts : null);
      if (!p.confident) {
        stats.unsure.push(artist.name);
        await db.artist.update({ where: { id: artist.id }, data: { profileCheckedAt: new Date() } });
        continue;
      }
      await db.artist.update({
        where: { id: artist.id },
        data: {
          bio: p.bio.trim(),
          bioGenerated: true,
          origin: artist.origin ?? (p.origin || null),
          bornYear: p.bornYear,
          style: p.style || null,
          bioSources: p.sources,
          profileCheckedAt: new Date(),
        },
      });
      stats.written.push(artist.name);
    } catch (error) {
      stats.errors.push(`${artist.name}: ${(error as Error).message}`);
    }
  }
} finally {
  stats.costUsd = Math.round(writer.estimatedCostUsd() * 100) / 100;
  stats.fromMusicBrainz = writer.fromFacts;
  stats.webSearches = writer.searches;
  await db.$disconnect();
}
console.log(JSON.stringify(stats, null, 2));
