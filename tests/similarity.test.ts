import { layoutMap } from "../src/lib/similarity/layout";
import { describe, expect, it } from "vitest";
import { parseSimilarArtists } from "../src/lib/similarity/listenbrainz";
import { idf, labelParts, rankAll, scorePair, weightedCosine, type ArtistSignals } from "../src/lib/similarity/score";

function artist(id: number, over: Partial<ArtistSignals> = {}): ArtistSignals {
  return {
    id,
    nameKeys: [`artist ${id}`],
    label: null,
    genres: new Map(),
    places: new Map(),
    concertIds: new Set(),
    external: new Map(),
    ...over,
  };
}
const idfsFor = (list: ArtistSignals[]) => ({ genres: idf(list.map((a) => a.genres)), places: idf(list.map((a) => a.places)) });

describe("similarity score", () => {
  it("cosine is 1 for the same profile and 0 for nothing in common", () => {
    const w = new Map([[1, 1], [2, 1]]);
    expect(weightedCosine(new Map([[1, 3]]), new Map([[1, 1]]), w)).toBeCloseTo(1);
    expect(weightedCosine(new Map([[1, 3]]), new Map([[2, 1]]), w)).toBe(0);
  });

  it("a rare shared genre counts more than a common one", () => {
    // Genre 1 is played by everyone, genre 2 only by A and B.
    const a = artist(1, { genres: new Map([[1, 1], [2, 1]]) });
    const b = artist(2, { genres: new Map([[1, 1], [2, 1]]) });
    const c = artist(3, { genres: new Map([[1, 1]]) });
    const d = artist(4, { genres: new Map([[1, 1]]) });
    const idfs = idfsFor([a, b, c, d]);
    expect(scorePair(a, b, idfs).score).toBeGreaterThan(scorePair(a, c, idfs).score);
  });

  it("labels match on any part, ignoring case and accents", () => {
    expect([...labelParts("Keinemusik, Watergate")]).toEqual(["keinemusik", "watergate"]);
    const idfs = idfsFor([]);
    const a = artist(1, { label: "Afterlife" });
    expect(scorePair(a, artist(2, { label: "afterlife / Ninja Tune" }), idfs).parts.label).toBe(1);
    expect(scorePair(a, artist(3, { label: "Self released" }), idfs).parts.label).toBe(0);
    expect(labelParts("Self released").size).toBe(0);
  });

  it("artists who played a concert together are close", () => {
    const idfs = idfsFor([]);
    const r = scorePair(artist(1, { concertIds: new Set([7]) }), artist(2, { concertIds: new Set([7, 8]) }), idfs);
    expect(r.parts.together).toBe(1);
  });

  it("the outside source counts in both directions and matches aliases", () => {
    const idfs = idfsFor([]);
    const a = artist(1, { external: new Map([["yukimatsu", 0.8]]) });
    const b = artist(2, { nameKeys: ["yousuke yukimatsu", "yukimatsu"] });
    expect(scorePair(a, b, idfs).parts.external).toBe(0.8);
    expect(scorePair(b, a, idfs).parts.external).toBe(0.8);
  });

  it("artists unknown to the outside source are not pushed down", () => {
    const g = new Map([[1, 1]]);
    const list = [artist(1, { genres: g }), artist(2, { genres: g }), artist(3, { genres: new Map([[2, 1]]) })];
    // Same genre, no outside data on either side: the genre weight is scaled up, not diluted.
    expect(scorePair(list[0], list[1], idfsFor(list)).score).toBeCloseTo(0.3 / 0.7, 3);
  });

  it("ranks best first, both directions, and drops weak pairs", () => {
    const g = new Map([[1, 1]]);
    const list = [
      artist(1, { genres: g, label: "Afterlife" }),
      artist(2, { genres: g, label: "Afterlife" }),
      artist(3, { genres: g }),
      artist(4, { genres: new Map([[9, 1]]) }), // nothing in common with anyone
    ];
    const ranked = rankAll(list);
    const of = (id: number) => ranked.filter((r) => r.artistId === id);
    expect(of(1).map((r) => r.similarId)).toEqual([2, 3]);
    expect(of(1)[0].rank).toBe(1);
    expect(of(2)[0].similarId).toBe(1);
    expect(of(4)).toEqual([]);
    expect(ranked.some((r) => r.similarId === 4)).toBe(false);
  });

  it("keeps at most the given number per artist", () => {
    const g = new Map([[1, 1]]);
    const list = Array.from({ length: 6 }, (_, i) => artist(i + 1, { genres: g }));
    expect(rankAll(list, 3).filter((r) => r.artistId === 1)).toHaveLength(3);
  });
});

describe("ListenBrainz answer", () => {
  const own = "own-mbid";
  it("reads a flat list, scales scores to 0..1 and drops the artist itself", () => {
    const body = [
      { artist_mbid: own, name: "Self", score: 999 },
      { artist_mbid: "a", name: "Tale Of Us", score: 400 },
      { artist_mbid: "b", name: "Anyma", score: 200 },
    ];
    expect(parseSimilarArtists(body, own)).toEqual([
      { name: "Tale Of Us", nameKey: "tale of us", mbid: "a", score: 1 },
      { name: "Anyma", nameKey: "anyma", mbid: "b", score: 0.5 },
    ]);
  });

  it("reads the { type, data } shape too", () => {
    const body = [{ type: "dataset", data: [{ artist_mbid: "a", name: "Âme", score: 10 }] }];
    expect(parseSimilarArtists(body, own)).toEqual([{ name: "Âme", nameKey: "ame", mbid: "a", score: 1 }]);
  });

  it("ignores junk and empty answers", () => {
    expect(parseSimilarArtists({ error: "x" }, own)).toEqual([]);
    expect(parseSimilarArtists([{ name: "", score: 3 }, { name: "X", score: "n/a" }], own)).toEqual([]);
  });
});


describe("map layout", () => {
  const dist = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);
  it("puts the most similar closest and keeps everyone inside -1..1", () => {
    const points = layoutMap([10, 20, 30, 40], () => 0);
    const byId = new Map(points.map((p) => [p.id, p]));
    expect(dist(byId.get(10)!)).toBeLessThan(dist(byId.get(20)!));
    expect(dist(byId.get(30)!)).toBeLessThan(dist(byId.get(40)!));
    for (const p of points) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
    }
    expect(byId.get(10)).toEqual({ id: 10, x: 0, y: -0.35 }); // straight up
  });

  it("places artists alike each other side by side and is the same every time", () => {
    // 1 and 4 are alike, 2 and 3 are alike.
    const alike = new Set(["1:4", "4:1", "2:3", "3:2"]);
    const score = (a: number, b: number) => (alike.has(`${a}:${b}`) ? 0.9 : 0.1);
    const order = layoutMap([1, 2, 3, 4], score).map((p) => p.id);
    expect(order).toEqual([1, 4, 2, 3]);
    expect(layoutMap([1, 2, 3, 4], score)).toEqual(layoutMap([1, 2, 3, 4], score));
    expect(layoutMap([], score)).toEqual([]);
  });
});
