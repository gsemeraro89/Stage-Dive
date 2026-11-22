// "Up next" candidates come from the shared concert index (src/lib/queries.ts queuePool) instead of one
// database read per concert page: the same concerts must be chosen as the old per-page query chose.
import { describe, expect, it } from "vitest";
import { queuePool, type IndexedConcert } from "../src/lib/queries";
import { buildQueue } from "../src/lib/upnext";

const c = (id: number, artistIds: number[], genreIds: number[], viewCount = 0): IndexedConcert => ({
  id,
  youtubeId: `yt${id}`,
  thumbnailUrl: null,
  artistIds,
  genreIds,
  publishedAt: new Date(2026, 0, id),
  viewCount,
  bootleg: false,
});

const index = [c(1, [10], [1]), c(2, [10], [2]), c(3, [20], [3]), c(4, [30], [1, 2]), c(5, [40], [9]), c(6, [], [])];

describe("queue pool from the shared index", () => {
  it("keeps concerts by the same or similar artists, or sharing a genre, never the current one", () => {
    const pool = queuePool(index, { id: 1, artistIds: [10], genreIds: [1] }, [20]);
    expect(pool.map((p) => p.id).sort()).toEqual([2, 3, 4]);
  });
  it("is empty when the concert has no artist, similar artist or genre", () => {
    expect(queuePool(index, { id: 6, artistIds: [], genreIds: [] }, [])).toEqual([]);
  });
  it("returns only the ranking fields, and buildQueue ranks them as before", () => {
    const self = { id: 1, artistIds: [10], genreIds: [1], publishedAt: new Date(2026, 0, 1), viewCount: 0 };
    const pool = queuePool(index, self, [20]);
    expect(Object.keys(pool[0]).sort()).toEqual(["artistIds", "genreIds", "id", "publishedAt", "viewCount"]);
    expect(buildQueue(self, [self, ...pool], undefined, [20]).map((q) => q.id)).toEqual([2, 3, 4]);
  });
});
