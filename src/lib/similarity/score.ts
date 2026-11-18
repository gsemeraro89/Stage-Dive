// How alike two artists are, from 0 to 1. Pure functions, no database.
//
// Signals (owner decision 13 Nov 2026: the site shows the ranking only, never the reasons):
// - genres they play (rarer genres count more),
// - places they played: venues, festivals and the channels that published the concert (rarer count more),
// - the same label or collective,
// - concerts they played together (b2b, "with"),
// - "listeners of A also listen to B" from an outside source (ListenBrainz).
// Later: our own plays ("who listens to A also listens to B") once the site has traffic.

export interface ArtistSignals {
  id: number;
  /** nameKey() of the name and of any alias, to match outside lists. */
  nameKeys: string[];
  /** Label or collective as written in the profile, e.g. "Afterlife" or "Keinemusik, Watergate". */
  label: string | null;
  /** Genre ID -> number of the artist's concerts in that genre. */
  genres: Map<number, number>;
  /** "v:<venueId>" or "c:<channelId>" -> number of concerts there. */
  places: Map<string, number>;
  concertIds: Set<number>;
  /** Outside source: nameKey of a similar artist -> 0..1. Empty when the source had nothing. */
  external: Map<string, number>;
}

export const WEIGHTS = { genres: 0.3, places: 0.15, label: 0.1, together: 0.15, external: 0.3 } as const;
/** Pairs below this are not stored: too far apart to suggest. */
export const MIN_SCORE = 0.05;
/** Most similar artists kept per artist. */
export const KEEP_PER_ARTIST = 12;

type Vector = Map<string | number, number>;

/** Inverse document frequency: a feature shared by few artists says more than one shared by all. */
export function idf(vectors: Vector[]): Map<string | number, number> {
  const df = new Map<string | number, number>();
  for (const v of vectors) for (const k of v.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const n = vectors.length;
  return new Map([...df].map(([k, d]) => [k, Math.log(1 + n / d)]));
}

/** Cosine similarity of two count vectors, each count damped (log) and weighted by idf. */
export function weightedCosine(a: Vector, b: Vector, weights: Map<string | number, number>): number {
  const w = (v: Vector) => new Map([...v].map(([k, c]) => [k, Math.log(1 + c) * (weights.get(k) ?? 0)]));
  const wa = w(a);
  const wb = w(b);
  let dot = 0;
  for (const [k, x] of wa) dot += x * (wb.get(k) ?? 0);
  const norm = (v: Map<string | number, number>) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
  const d = norm(wa) * norm(wb);
  return d ? dot / d : 0;
}

/** Labels split into parts, so "Keinemusik, Watergate" matches "Keinemusik". */
export function labelParts(label: string | null): Set<string> {
  if (!label) return new Set();
  return new Set(
    label
      .split(/[,/&|;]| and /i)
      .map((p) => p.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
      .filter((p) => p.length > 1 && !["self released", "independent"].includes(p)),
  );
}

function externalScore(a: ArtistSignals, b: ArtistSignals): number {
  const look = (from: ArtistSignals, to: ArtistSignals) => Math.max(0, ...to.nameKeys.map((k) => from.external.get(k) ?? 0));
  return Math.max(look(a, b), look(b, a));
}

export interface PairScore {
  score: number;
  parts: { genres: number; places: number; label: number; together: number; external: number };
}

export function scorePair(
  a: ArtistSignals,
  b: ArtistSignals,
  idfs: { genres: Map<string | number, number>; places: Map<string | number, number> },
): PairScore {
  const la = labelParts(a.label);
  const parts = {
    genres: weightedCosine(a.genres, b.genres, idfs.genres),
    places: weightedCosine(a.places, b.places, idfs.places),
    label: [...labelParts(b.label)].some((p) => la.has(p)) ? 1 : 0,
    together: [...a.concertIds].some((id) => b.concertIds.has(id)) ? 1 : 0,
    external: externalScore(a, b),
  };
  // When neither artist is known to the outside source, its weight is shared among the others,
  // so artists missing there are not pushed down.
  const hasExternal = a.external.size > 0 || b.external.size > 0;
  const total = hasExternal ? 1 : 1 - WEIGHTS.external;
  const raw =
    WEIGHTS.genres * parts.genres +
    WEIGHTS.places * parts.places +
    WEIGHTS.label * parts.label +
    WEIGHTS.together * parts.together +
    (hasExternal ? WEIGHTS.external * parts.external : 0);
  return { score: Math.min(1, raw / total), parts };
}

export interface Ranked {
  artistId: number;
  similarId: number;
  score: number;
  rank: number;
}

/** The most similar artists for every artist, best first. */
export function rankAll(artists: ArtistSignals[], keep = KEEP_PER_ARTIST, min = MIN_SCORE): Ranked[] {
  const idfs = { genres: idf(artists.map((a) => a.genres)), places: idf(artists.map((a) => a.places)) };
  const scores = new Map<number, { id: number; score: number }[]>();
  for (let i = 0; i < artists.length; i++) {
    for (let j = i + 1; j < artists.length; j++) {
      const { score } = scorePair(artists[i], artists[j], idfs);
      if (score < min) continue;
      for (const [x, y] of [
        [artists[i], artists[j]],
        [artists[j], artists[i]],
      ]) {
        const list = scores.get(x.id) ?? [];
        list.push({ id: y.id, score });
        scores.set(x.id, list);
      }
    }
  }
  const out: Ranked[] = [];
  for (const [artistId, list] of scores) {
    list
      .sort((p, q) => q.score - p.score || p.id - q.id)
      .slice(0, keep)
      .forEach((s, i) => out.push({ artistId, similarId: s.id, score: Math.round(s.score * 1000) / 1000, rank: i + 1 }));
  }
  return out;
}
