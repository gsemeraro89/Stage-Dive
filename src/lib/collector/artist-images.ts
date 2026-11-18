// Artist pictures: the avatar of the artist's official YouTube channel (owner decision 13 Nov 2026),
// so artist squares no longer show concert thumbnails with titles baked in. The channel comes from our
// own channels (an official channel with the artist's name) or from MusicBrainz links (free).
// YouTube data: each picture is checked again every REFRESH_DAYS and cleared when the channel is gone.
import type { PrismaClient } from "../../generated/prisma/client";
import { artistYouTubeChannel, lookupArtist, nameKey, type YouTubeRef } from "./musicbrainz";
import { looseName } from "./rules";

export const REFRESH_DAYS = 25;

type Avatars = Map<string, { id: string; url: string }>;
export interface ImageDeps {
  avatars: (refs: { id?: string; handle?: string; user?: string }[]) => Promise<Avatars>;
  /** MusicBrainz: artist name -> official YouTube channel link, or null. */
  channelFromMusicBrainz?: (name: string) => Promise<YouTubeRef | null>;
}

export interface ImageStats {
  checked: number;
  withPicture: string[];
  noChannel: string[];
  cleared: string[];
  errors: string[];
}

const refKey = (r: YouTubeRef) => ("id" in r ? r.id : "handle" in r ? `@${r.handle}` : `user:${r.user}`);

export async function refreshArtistImages(db: PrismaClient, deps: ImageDeps, limit = 200): Promise<ImageStats> {
  const stats: ImageStats = { checked: 0, withPicture: [], noChannel: [], cleared: [], errors: [] };
  const staleBefore = new Date(Date.now() - REFRESH_DAYS * 86_400_000);
  const artists = await db.artist.findMany({
    where: {
      credits: { some: { concert: { status: "PUBLISHED" } } },
      OR: [{ imageCheckedAt: null }, { imageCheckedAt: { lt: staleBefore } }],
    },
    orderBy: [{ imageCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    take: limit,
    select: { id: true, name: true, aka: true, youtubeChannelId: true, imageUrl: true },
  });
  if (!artists.length) return stats;

  const official = await db.channel.findMany({ where: { isOfficial: true, youtubeChannelId: { not: null } }, select: { name: true, youtubeChannelId: true } });
  const byName = new Map(official.map((c) => [looseName(c.name), c.youtubeChannelId!]));

  // 1. Which channel is the artist's own.
  const refs = new Map<number, YouTubeRef>();
  for (const a of artists) {
    const own = a.youtubeChannelId ?? byName.get(looseName(a.name)) ?? (a.aka ? byName.get(looseName(a.aka)) : undefined);
    if (own) {
      refs.set(a.id, { id: own });
      continue;
    }
    if (!deps.channelFromMusicBrainz) continue;
    try {
      const ref = await deps.channelFromMusicBrainz(a.name);
      if (ref) refs.set(a.id, ref);
    } catch (error) {
      stats.errors.push(`${a.name}: ${(error as Error).message}`);
    }
  }

  // 2. One batched YouTube call for the avatars.
  const avatars = await deps.avatars([...refs.values()]);

  // 3. Store. No channel or no avatar: the picture is cleared (never kept past the refresh period).
  const now = new Date();
  for (const a of artists) {
    stats.checked++;
    const ref = refs.get(a.id);
    const found = ref ? avatars.get(refKey(ref)) : undefined;
    if (found) {
      await db.artist.update({ where: { id: a.id }, data: { imageUrl: found.url, youtubeChannelId: found.id, imageCheckedAt: now } });
      stats.withPicture.push(a.name);
    } else {
      if (a.imageUrl) stats.cleared.push(a.name);
      else stats.noChannel.push(a.name);
      await db.artist.update({ where: { id: a.id }, data: { imageUrl: null, imageCheckedAt: now } });
    }
  }
  return stats;
}

/** MusicBrainz lookup using the stored ID when we have one. */
export function musicBrainzChannelFinder(db: PrismaClient) {
  return async (name: string): Promise<YouTubeRef | null> => {
    const key = nameKey(name);
    let row = await db.artistLookup.findUnique({ where: { nameKey: key } });
    if (!row) {
      const found = await lookupArtist(name);
      row = await db.artistLookup.create({ data: { nameKey: key, mbid: found?.mbid ?? null, genres: found?.genres ?? [] } });
    }
    return row.mbid ? artistYouTubeChannel(row.mbid) : null;
  };
}
