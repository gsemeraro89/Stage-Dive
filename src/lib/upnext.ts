// What plays after a set ends: the same artist's other sets first (newest first), then the
// best set of each similar artist (most similar first), then sets that share a genre
// (most shared genres first, then most viewed).

export interface QueueCandidate {
  id: number;
  artistIds: number[];
  genreIds: number[];
  publishedAt: Date;
  viewCount: number;
}

export const QUEUE_LENGTH = 20;

/** For each similar artist, in order, their most viewed set not already taken. */
export function bestSetPerArtist<T extends QueueCandidate>(artistIds: number[], pool: T[], taken = new Set<number>()): T[] {
  const out: T[] = [];
  for (const artistId of artistIds) {
    const best = pool
      .filter((s) => !taken.has(s.id) && s.artistIds.includes(artistId))
      .sort((a, b) => b.viewCount - a.viewCount || a.id - b.id)[0];
    if (best) {
      out.push(best);
      taken.add(best.id);
    }
  }
  return out;
}

export function buildQueue<T extends QueueCandidate>(
  current: T,
  all: T[],
  limit = QUEUE_LENGTH,
  similarArtistIds: number[] = [],
): T[] {
  const others = all.filter((s) => s.id !== current.id);
  const currentArtists = new Set(current.artistIds);
  const currentGenres = new Set(current.genreIds);

  const sameArtist = others
    .filter((s) => s.artistIds.some((id) => currentArtists.has(id)))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || a.id - b.id);
  const taken = new Set(sameArtist.map((s) => s.id));

  const similar = bestSetPerArtist(
    similarArtistIds.filter((id) => !currentArtists.has(id)),
    others,
    taken,
  );

  const shared = (s: T) => s.genreIds.filter((id) => currentGenres.has(id)).length;
  const related = others
    .filter((s) => !taken.has(s.id) && shared(s) > 0)
    .sort((a, b) => shared(b) - shared(a) || b.viewCount - a.viewCount || a.id - b.id);

  return [...sameArtist, ...similar, ...related].slice(0, limit);
}

/**
 * "You might also like": one set from each similar artist (most similar first), topped up with
 * sets that share a genre. Never the same artist.
 */
export function relatedByGenre<T extends QueueCandidate>(
  current: T,
  all: T[],
  limit: number,
  similarArtistIds: number[] = [],
): T[] {
  const currentArtists = new Set(current.artistIds);
  return buildQueue(current, all, all.length, similarArtistIds)
    .filter((s) => !s.artistIds.some((id) => currentArtists.has(id)))
    .slice(0, limit);
}
