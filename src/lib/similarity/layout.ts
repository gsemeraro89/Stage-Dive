// Where each artist sits on the map. Pure function, no database.
// The centre artist is at 0,0; x grows to the right, y grows downward (screen order).
// Distance grows with rank (most similar closest), so no score is
// needed in the browser. Artists alike each other sit side by side: neighbours are chained
// greedily by their own similarity, then spread evenly round the circle in that order.

export interface MapPoint {
  id: number;
  x: number;
  y: number;
}

const INNER = 0.35;
const OUTER = 0.95;

/**
 * @param ranked neighbour IDs, most similar to the centre first
 * @param pairScore similarity between two neighbours (0 when unknown)
 */
export function layoutMap(ranked: number[], pairScore: (a: number, b: number) => number): MapPoint[] {
  const n = ranked.length;
  if (!n) return [];
  const rankOf = new Map(ranked.map((id, i) => [id, i]));

  // Chain: start from the most similar, then always the unplaced neighbour most like the last one.
  const order = [ranked[0]];
  const left = new Set(ranked.slice(1));
  while (left.size) {
    const last = order[order.length - 1];
    let best = -1;
    let bestScore = -1;
    for (const id of left) {
      const s = pairScore(last, id);
      if (s > bestScore || (s === bestScore && rankOf.get(id)! < rankOf.get(best)!)) {
        best = id;
        bestScore = s;
      }
    }
    order.push(best);
    left.delete(best);
  }

  const round = (v: number) => Math.round(v * 1000) / 1000 || 0;
  return order.map((id, i) => {
    const rank = rankOf.get(id)!;
    const r = n === 1 ? INNER : INNER + ((OUTER - INNER) * rank) / (n - 1);
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n; // first one straight up, then clockwise
    return { id, x: round(r * Math.cos(angle)), y: round(r * Math.sin(angle)) };
  });
}
