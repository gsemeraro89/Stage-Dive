// Writes the normalized seed into the database. Safe to run any number of times:
// every row is matched on a stable key (slug, name or YouTube ID) and updated, never duplicated.

import type { PrismaClient } from "../../generated/prisma/client";
import { GENRES, VENUE_KINDS, SITE_GENRES } from "../catalogue";
import { slugify } from "../slug";
import { countryName } from "../places";
import type { NormalizedSeed } from "./normalize";

export interface ImportSummary {
  concerts: number;
  artists: number;
  venues: number;
  channels: number;
  genres: number;
  venueKinds: number;
}

export async function importSeed(db: PrismaClient, seed: NormalizedSeed): Promise<ImportSummary> {
  return db.$transaction(
    async (tx) => {
      // Fixed lists: genres and venueKinds, in the order of the brief.
      const genreIds = new Map<string, number>();
      for (const [i, name] of GENRES.entries()) {
        const row = await tx.genre.upsert({
          where: { slug: slugify(name) },
          create: { slug: slugify(name), name, sortOrder: i },
          update: {},
        });
        genreIds.set(name, row.id);
      }
      // Genres no longer on the list are removed, with their links to concerts.
      await tx.genre.deleteMany({ where: { name: { notIn: [...SITE_GENRES] } } });
      await tx.venueKind.deleteMany({ where: { name: { notIn: [...VENUE_KINDS] }, concerts: { none: {} } } });

      const venueKindIds = new Map<string, number>();
      for (const [i, name] of VENUE_KINDS.entries()) {
        const row = await tx.venueKind.upsert({
          where: { slug: slugify(name) },
          create: { slug: slugify(name), name, sortOrder: i },
          update: {},
        });
        venueKindIds.set(name, row.id);
      }

      const channelIds = new Map<string, number>();
      for (const channel of seed.channels) {
        const ids = channel.youtubeChannelId ? { youtubeChannelId: channel.youtubeChannelId } : {};
        const row = await tx.channel.upsert({
          where: { name: channel.name },
          create: { name: channel.name, isOfficial: channel.isOfficial, ...ids },
          update: { isOfficial: channel.isOfficial, ...ids },
        });
        channelIds.set(channel.name, row.id);
      }

      const venueIds = new Map<string, number>();
      for (const venue of seed.venues) {
        const data = { name: venue.name, city: venue.city, country: countryName(venue.country) };
        const row = await tx.venue.upsert({
          where: { slug: venue.slug },
          create: { slug: venue.slug, ...data },
          update: data,
        });
        venueIds.set(venue.slug, row.id);
      }

      const artistIds = new Map<string, number>();
      const tourIds = new Map<string, number>();
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

      for (const tour of seed.tours) {
        const data = { name: tour.name, artistId: artistIds.get(tour.artistSlug) ?? null };
        const row = await tx.tour.upsert({ where: { slug: tour.slug }, create: { slug: tour.slug, ...data }, update: data });
        tourIds.set(tour.slug, row.id);
      }

      for (const concert of seed.concerts) {
        // Our own facts about the concert: re-applied on every run, so edits to the seed file show up.
        const ours = {
          slug: concert.slug,
          performedYear: concert.performedYear,
          performedOn: concert.performedOn,
          city: concert.city,
          country: countryName(concert.country),
          writeUp: concert.writeUp,
          channelId: channelIds.get(concert.channelName)!,
          venueId: concert.venueSlug ? venueIds.get(concert.venueSlug)! : null,
          venueKindId: venueKindIds.get(concert.venueKind)!,
          tourId: concert.tourSlug ? tourIds.get(concert.tourSlug)! : null,
        };
        // What YouTube said when the seed was checked: written only on first import. After that the
        // nightly refresh owns it (30-day rule), so a re-run never brings back stale titles or views,
        // or shows a video the refresh found removed.
        const youtube = {
          title: concert.title,
          durationSeconds: concert.durationSeconds,
          viewCount: concert.viewCount,
          publishedAt: concert.publishedAt,
          embeddable: true,
          privacyStatus: "public",
          ytCheckedAt: concert.checkedAt,
          ytRefreshedAt: concert.checkedAt,
        };
        // status and curated are only set on first import, so later edits by the owner survive a re-run.
        const row = await tx.concert.upsert({
          where: { youtubeId: concert.youtubeId },
          create: { youtubeId: concert.youtubeId, source: "SEED", curated: true, status: "PUBLISHED", ...ours, ...youtube },
          update: ours,
        });

        await tx.concertArtist.deleteMany({ where: { concertId: row.id } });
        await tx.concertArtist.createMany({
          data: concert.credits.map((c) => ({
            concertId: row.id,
            artistId: artistIds.get(c.artistSlug)!,
            role: c.role,
            creditNote: c.creditNote,
            position: c.position,
          })),
        });
        await tx.concertGenre.deleteMany({ where: { concertId: row.id } });
        await tx.concertGenre.createMany({
          data: concert.genres.map((name) => ({ concertId: row.id, genreId: genreIds.get(name)! })),
        });
      }

      return {
        concerts: seed.concerts.length,
        artists: seed.artists.length,
        venues: seed.venues.length,
        channels: seed.channels.length,
        genres: GENRES.length,
        venueKinds: VENUE_KINDS.length,
      };
    },
    { timeout: 60_000 },
  );
}
