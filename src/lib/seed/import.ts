// Writes the normalized seed into the database. Safe to run any number of times:
// every row is matched on a stable key (slug, name or YouTube ID) and updated, never duplicated.

import type { PrismaClient } from "../../generated/prisma/client";
import { GENRES, SETTINGS, SITE_GENRES } from "../catalogue";
import { slugify } from "../slug";
import type { NormalizedSeed } from "./normalize";

export interface ImportSummary {
  sets: number;
  artists: number;
  venues: number;
  channels: number;
  genres: number;
  settings: number;
}

export async function importSeed(db: PrismaClient, seed: NormalizedSeed): Promise<ImportSummary> {
  return db.$transaction(
    async (tx) => {
      // Fixed lists: genres and settings, in the order of the brief.
      const genreIds = new Map<string, number>();
      for (const [i, name] of GENRES.entries()) {
        const row = await tx.genre.upsert({
          where: { slug: slugify(name) },
          create: { slug: slugify(name), name, sortOrder: i },
          update: {},
        });
        genreIds.set(name, row.id);
      }
      // Genres no longer on the list are removed, with their links to sets. Artist-only genres are
      // created by the collector on first use and kept.
      await tx.genre.deleteMany({ where: { name: { notIn: [...SITE_GENRES] } } });

      const settingIds = new Map<string, number>();
      for (const [i, name] of SETTINGS.entries()) {
        const row = await tx.setting.upsert({
          where: { slug: slugify(name) },
          create: { slug: slugify(name), name, sortOrder: i },
          update: {},
        });
        settingIds.set(name, row.id);
      }

      const channelIds = new Map<string, number>();
      for (const channel of seed.channels) {
        const row = await tx.channel.upsert({
          where: { name: channel.name },
          create: { name: channel.name, isOfficial: channel.isOfficial },
          update: { isOfficial: channel.isOfficial },
        });
        channelIds.set(channel.name, row.id);
      }

      const venueIds = new Map<string, number>();
      for (const venue of seed.venues) {
        const data = { name: venue.name, city: venue.city, country: venue.country };
        const row = await tx.venue.upsert({
          where: { slug: venue.slug },
          create: { slug: venue.slug, ...data },
          update: data,
        });
        venueIds.set(venue.slug, row.id);
      }

      const artistIds = new Map<string, number>();
      for (const artist of seed.artists) {
        // Artists without a profile in the seed (collaborators) keep whatever is already stored.
        const profile = artist.profile ?? {};
        const row = await tx.artist.upsert({
          where: { slug: artist.slug },
          create: { slug: artist.slug, name: artist.name, ...profile },
          update: { name: artist.name, ...profile },
        });
        artistIds.set(artist.slug, row.id);
      }

      for (const set of seed.sets) {
        const data = {
          slug: set.slug,
          title: set.title,
          durationSeconds: set.durationSeconds,
          viewCount: set.viewCount,
          publishedAt: set.publishedAt,
          city: set.city,
          country: set.country,
          liveAct: set.liveAct,
          writeUp: set.writeUp,
          embeddable: true,
          privacyStatus: "public",
          ytCheckedAt: set.checkedAt,
          ytRefreshedAt: set.checkedAt,
          channelId: channelIds.get(set.channelName)!,
          venueId: set.venueSlug ? venueIds.get(set.venueSlug)! : null,
          settingId: settingIds.get(set.setting)!,
        };
        // status and curated are only set on first import, so later edits by the owner survive a re-run.
        const row = await tx.set.upsert({
          where: { youtubeId: set.youtubeId },
          create: { youtubeId: set.youtubeId, source: "SEED", curated: true, status: "PUBLISHED", ...data },
          update: data,
        });

        await tx.setArtist.deleteMany({ where: { setId: row.id } });
        await tx.setArtist.createMany({
          data: set.credits.map((c) => ({
            setId: row.id,
            artistId: artistIds.get(c.artistSlug)!,
            role: c.role,
            creditNote: c.creditNote,
            position: c.position,
          })),
        });
        await tx.setGenre.deleteMany({ where: { setId: row.id } });
        await tx.setGenre.createMany({
          data: set.genres.map((name) => ({ setId: row.id, genreId: genreIds.get(name)! })),
        });
      }

      return {
        sets: seed.sets.length,
        artists: seed.artists.length,
        venues: seed.venues.length,
        channels: seed.channels.length,
        genres: GENRES.length,
        settings: SETTINGS.length,
      };
    },
    { timeout: 60_000 },
  );
}
