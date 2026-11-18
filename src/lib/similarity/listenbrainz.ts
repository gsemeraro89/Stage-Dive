// "Listeners of X also listen to Y" from ListenBrainz (MetaBrainz, data under CC0, free for
// commercial use). Needs the artist's MusicBrainz ID. Last.fm has the same data but its API
// is for non-commercial sites only, so it is not used.

import { nameKey } from "../collector/musicbrainz";

const API = "https://labs.api.listenbrainz.org/similar-artists/json";
// MusicBrainz and ListenBrainz ask every client to name itself with a way to reach it.
const USER_AGENT = `STAGEDIVE/0.1 (+${process.env.SITE_URL || "https://stagedive-test.onrender.com"})`;
/** The similarity dataset ListenBrainz currently publishes. Override with LISTENBRAINZ_ALGORITHM if it changes. */
export const DEFAULT_ALGORITHM =
  "session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30";

export interface ExternalMatch {
  name: string;
  nameKey: string;
  mbid: string | null;
  /** 0..1, 1 = strongest match in the list. */
  score: number;
}

interface RawItem {
  name?: string;
  artist_name?: string;
  artist_mbid?: string;
  score?: number;
  data?: RawItem[];
}

/**
 * Read the answer. ListenBrainz has returned both a flat list of artists and a list of
 * { type, data: [...] } blocks, so both are accepted. The reference artist itself is dropped.
 */
export function parseSimilarArtists(body: unknown, ownMbid: string): ExternalMatch[] {
  if (!Array.isArray(body)) return [];
  const items: RawItem[] = (body as RawItem[]).flatMap((x) => (Array.isArray(x?.data) ? x.data : [x]));
  const rows = items
    .map((x) => ({ name: (x.name ?? x.artist_name ?? "").trim(), mbid: x.artist_mbid ?? null, raw: Number(x.score) }))
    .filter((x) => x.name && Number.isFinite(x.raw) && x.raw > 0 && x.mbid !== ownMbid);
  const max = Math.max(0, ...rows.map((r) => r.raw));
  if (!max) return [];
  const best = new Map<string, ExternalMatch>();
  for (const r of rows) {
    const key = nameKey(r.name);
    const score = Math.round((r.raw / max) * 1000) / 1000;
    if (key && (best.get(key)?.score ?? -1) < score) best.set(key, { name: r.name, nameKey: key, mbid: r.mbid, score });
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

export async function similarArtists(
  mbid: string,
  fetchFn: typeof fetch = fetch,
  algorithm = process.env.LISTENBRAINZ_ALGORITHM || DEFAULT_ALGORITHM,
): Promise<ExternalMatch[]> {
  const url = `${API}?artist_mbids=${encodeURIComponent(mbid)}&algorithm=${encodeURIComponent(algorithm)}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (res.ok) return parseSimilarArtists(await res.json(), mbid);
    if (res.status === 404) return [];
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    throw new Error(`ListenBrainz similar artists failed: ${res.status}`);
  }
}
