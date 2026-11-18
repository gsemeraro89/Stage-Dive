// The band-photo job: for each band with a concert on the site, find a freely licensed photo on
// Wikimedia Commons (via MusicBrainz -> Wikidata), photocopy it and store it with its credit.
// Network calls come in as `deps`, so the job can be tested without the internet.
import type { PrismaClient } from "../../generated/prisma/client";
import { nameKey } from "../collector/musicbrainz";
import { photocopy } from "./photocopy";
import type { CommonsPhoto } from "./wikimedia";

/** A band without a usable photo is asked about again after this many days. */
export const RECHECK_DAYS = 90;

export interface PhotoDeps {
  /** MusicBrainz ID for a band name, or null when MusicBrainz cannot tell (namesakes, unknown). */
  mbid: (name: string) => Promise<string | null>;
  wikidataId: (mbid: string) => Promise<string | null>;
  findPhoto: (wikidataId: string) => Promise<{ photo: CommonsPhoto | null; skipped?: string }>;
  download: (url: string) => Promise<Buffer>;
}

export interface PhotoStats {
  checked: number;
  added: string[];
  replaced: string[];
  removed: string[];
  skipped: string[];
  errors: string[];
}

export async function refreshBandPhotos(
  db: PrismaClient,
  deps: PhotoDeps,
  options: { limit?: number; now?: Date; force?: boolean } = {},
): Promise<PhotoStats> {
  const now = options.now ?? new Date();
  const stats: PhotoStats = { checked: 0, added: [], replaced: [], removed: [], skipped: [], errors: [] };
  const recheckBefore = new Date(now.getTime() - RECHECK_DAYS * 86_400_000);

  // Bands with a page: a visible concert of their own (same rule as the site).
  const bands = await db.artist.findMany({
    where: { credits: { some: { role: "MAIN", concert: { status: "PUBLISHED", embeddable: true, privacyStatus: "public" } } } },
    select: { id: true, slug: true, name: true, photo: { select: { sourceTitle: true } } },
    orderBy: { name: "asc" },
  });
  const checks = new Map((await db.bandPhotoCheck.findMany()).map((c) => [c.artistId, c]));
  const due = bands.filter((b) => options.force || !checks.has(b.id) || checks.get(b.id)!.checkedAt < recheckBefore);

  for (const band of due.slice(0, options.limit ?? 50)) {
    stats.checked++;
    try {
      const cached = await db.artistLookup.findUnique({ where: { nameKey: nameKey(band.name) } });
      const mbid = cached?.mbid ?? (await deps.mbid(band.name));
      const wikidataId = mbid ? await deps.wikidataId(mbid) : null;
      const found = wikidataId ? await deps.findPhoto(wikidataId) : { photo: null, skipped: mbid ? "no Wikidata link" : "not found on MusicBrainz" };
      const record = (skipped: string | null) =>
        db.bandPhotoCheck.upsert({
          where: { artistId: band.id },
          create: { artistId: band.id, wikidataId, skipped, checkedAt: now },
          update: { wikidataId, skipped, checkedAt: now },
        });

      if (!found.photo) {
        // A photo whose licence changed, or that is gone from Wikidata, comes off the site.
        if (band.photo) {
          await db.bandPhoto.delete({ where: { artistId: band.id } });
          stats.removed.push(`${band.name} (${found.skipped})`);
        } else stats.skipped.push(`${band.name}: ${found.skipped}`);
        await record(found.skipped ?? "no photo");
        continue;
      }
      const p = found.photo;
      // Same Commons file as before: only the credit is refreshed, the image is not made again.
      if (band.photo?.sourceTitle === p.title) {
        await db.bandPhoto.update({
          where: { artistId: band.id },
          data: { sourcePage: p.pageUrl, author: p.author, license: p.license, licenseUrl: p.licenseUrl, checkedAt: now },
        });
        await record(null);
        continue;
      }
      const copy = await photocopy(await deps.download(p.imageUrl), { seed: band.slug });
      const data = {
        image: new Uint8Array(copy.png),
        width: copy.width,
        height: copy.height,
        sourceTitle: p.title,
        sourcePage: p.pageUrl,
        author: p.author,
        license: p.license,
        licenseUrl: p.licenseUrl,
        checkedAt: now,
      };
      await db.bandPhoto.upsert({ where: { artistId: band.id }, create: { artistId: band.id, ...data }, update: data });
      (band.photo ? stats.replaced : stats.added).push(`${band.name}: ${p.title} (${p.license})`);
      await record(null);
    } catch (error) {
      stats.errors.push(`${band.name}: ${(error as Error).message}`);
    }
  }
  return stats;
}
