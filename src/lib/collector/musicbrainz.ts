// Artist genres from MusicBrainz (open data, CC0), an independent check on the classifier.
// MusicBrainz asks for at most one request per second and a descriptive User-Agent.
import { isRockGenreList } from "./rules";

const API = "https://musicbrainz.org/ws/2";
// MusicBrainz and ListenBrainz ask every client to name itself with a way to reach it.
const USER_AGENT = `STAGEDIVE/0.1 (+${process.env.SITE_URL || "https://stagedive-test.onrender.com"})`;

export interface MusicBrainzArtist {
  mbid: string;
  genres: string[];
}

let lastCall = 0;
async function politeFetch(url: string, fetchFn: typeof fetch, userAgent = USER_AGENT): Promise<Response> {
  // MusicBrainz answers 503 when it is busy or we are too fast: wait and try again, up to 3 times.
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    const res = await fetchFn(url, { headers: { "User-Agent": userAgent, Accept: "application/json" } });
    if (res.status !== 503 || attempt >= 3) return res;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Find an artist by exact name (ignoring case and accents) and return their genres and tags.
 * Returns null when no confident exact match exists, so a namesake never counts as evidence.
 */
export async function lookupArtist(name: string, fetchFn: typeof fetch = fetch): Promise<MusicBrainzArtist | null> {
  const query = encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`);
  const search = await politeFetch(`${API}/artist?query=${query}&limit=5&fmt=json`, fetchFn);
  if (!search.ok) throw new Error(`MusicBrainz search failed: ${search.status}`);
  const data = (await search.json()) as { artists?: { id: string; name: string; score: number; aliases?: { name: string }[] }[] };
  const key = nameKey(name);
  const matches = (data.artists ?? []).filter(
    (a) => a.score >= 90 && (nameKey(a.name) === key || a.aliases?.some((al) => nameKey(al.name) === key)),
  );
  // Several artists with exactly this name: we cannot tell which one it is.
  if (matches.length !== 1) return null;

  const detail = await politeFetch(`${API}/artist/${matches[0].id}?inc=genres+tags&fmt=json`, fetchFn);
  if (!detail.ok) throw new Error(`MusicBrainz lookup failed: ${detail.status}`);
  const artist = (await detail.json()) as { genres?: { name: string }[]; tags?: { name: string; count: number }[] };
  const genres = [
    ...(artist.genres ?? []).map((g) => g.name),
    ...(artist.tags ?? []).filter((t) => t.count > 0).map((t) => t.name),
  ];
  return { mbid: matches[0].id, genres: [...new Set(genres.map((g) => g.toLowerCase()))] };
}

/** What MusicBrainz knows about an artist, for the profile writer (free, open data). */
export interface MusicBrainzFacts {
  mbid: string;
  /** "Person", "Group", "Orchestra", ... or null. */
  type: string | null;
  /** "Lyon, France", "France", or "" when unknown. */
  origin: string;
  /** Birth year for a person (never for a group). */
  bornYear: number | null;
  /** Genres and tags, most used first. */
  tags: string[];
}

interface RawArtistDetail {
  type?: string | null;
  area?: { name?: string } | null;
  "begin-area"?: { name?: string } | null;
  "life-span"?: { begin?: string | null } | null;
  genres?: { name: string; count?: number }[];
  tags?: { name: string; count: number }[];
}

/** Read the facts from a MusicBrainz artist record. Pure, for tests. */
export function factsFromDetail(mbid: string, d: RawArtistDetail): MusicBrainzFacts {
  const begin = d["begin-area"]?.name?.trim() ?? "";
  const area = d.area?.name?.trim() ?? "";
  const origin = begin && area && begin !== area ? `${begin}, ${area}` : begin || area;
  const year = Number(d["life-span"]?.begin?.slice(0, 4));
  const type = d.type ?? null;
  const tags = [
    ...(d.genres ?? []).sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).map((g) => g.name),
    ...(d.tags ?? []).filter((t) => t.count > 0).sort((a, b) => b.count - a.count).map((t) => t.name),
  ];
  return {
    mbid,
    type,
    origin,
    bornYear: type === "Person" && year >= 1900 && year <= 2015 ? year : null,
    tags: [...new Set(tags.map((t) => t.toLowerCase()))].slice(0, 12),
  };
}

/** Facts for an artist found by exact name; null when there is no single confident match. */
export async function artistFacts(name: string, fetchFn: typeof fetch = fetch): Promise<MusicBrainzFacts | null> {
  const found = await lookupArtist(name, fetchFn);
  if (!found) return null;
  const res = await politeFetch(`${API}/artist/${found.mbid}?inc=genres+tags&fmt=json`, fetchFn);
  if (!res.ok) throw new Error(`MusicBrainz lookup failed: ${res.status}`);
  return factsFromDetail(found.mbid, (await res.json()) as RawArtistDetail);
}

/** Enough to write a profile without searching the web: where from, and (for a person) the birth year. */
export function factsAreEnough(f: MusicBrainzFacts | null): f is MusicBrainzFacts {
  return Boolean(f && f.origin && (f.type !== "Person" || f.bornYear) && f.tags.length > 0);
}

/** A YouTube channel as written in a link: by ID, @handle or legacy user name. */
export type YouTubeRef = { id: string } | { handle: string } | { user: string };

/** Read a YouTube channel link. Video, playlist and other links give null. */
export function parseYouTubeChannelUrl(url: string): YouTubeRef | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "channel" && /^UC[\w-]{22}$/.test(parts[1] ?? "")) return { id: parts[1] };
  if (parts[0]?.startsWith("@") && parts[0].length > 1) return { handle: parts[0].slice(1) };
  if (parts[0] === "user" && parts[1]) return { user: parts[1] };
  return null;
}

/** The artist's official YouTube channel according to MusicBrainz, or null. */
export async function artistYouTubeChannel(mbid: string, fetchFn: typeof fetch = fetch): Promise<YouTubeRef | null> {
  const res = await politeFetch(`${API}/artist/${mbid}?inc=url-rels&fmt=json`, fetchFn);
  if (!res.ok) throw new Error(`MusicBrainz links failed: ${res.status}`);
  const data = (await res.json()) as { relations?: UrlRelation[] };
  return youtubeRefFromRelations(data.relations);
}

interface UrlRelation {
  type?: string;
  ended?: boolean;
  url?: { resource?: string };
}

/** The artist's Wikidata item (e.g. "Q15920"), from their MusicBrainz links, or null. */
export async function artistWikidataId(mbid: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const res = await politeFetch(`${API}/artist/${mbid}?inc=url-rels&fmt=json`, fetchFn);
  if (!res.ok) throw new Error(`MusicBrainz links failed: ${res.status}`);
  const data = (await res.json()) as { relations?: UrlRelation[] };
  return wikidataIdFromRelations(data.relations);
}

/** The first current Wikidata link among an artist's MusicBrainz links. Pure, for tests. */
export function wikidataIdFromRelations(relations: UrlRelation[] | undefined): string | null {
  for (const rel of relations ?? []) {
    if (rel.ended || !rel.url?.resource) continue;
    const m = /wikidata\.org\/(?:wiki|entity)\/(Q\d+)/.exec(rel.url.resource);
    if (m) return m[1];
  }
  return null;
}

/** How the entity links job names itself to MusicBrainz and Wikidata (owner, 20 Nov 2026: no personal email). */
export const LINKS_USER_AGENT = "STAGEDIVE/1.0 ( contact-later )";

/** An artist's Wikidata item and English Wikipedia article as MusicBrainz links them. */
export interface EntityLinks {
  wikidataId: string | null;
  /** Only an English Wikipedia article ("https://en.wikipedia.org/wiki/Metallica"). */
  wikipediaUrl: string | null;
}

/** The Wikidata item and English Wikipedia article among an artist's current MusicBrainz links. Pure, for tests. */
export function entityLinksFromRelations(relations: UrlRelation[] | undefined): EntityLinks {
  const wikipedia = (relations ?? []).find(
    (rel) => !rel.ended && rel.url?.resource && /^https?:\/\/en\.wikipedia\.org\/wiki\/[^/?#]+$/.test(rel.url.resource),
  );
  return { wikidataId: wikidataIdFromRelations(relations), wikipediaUrl: wikipedia?.url?.resource?.replace(/^http:/, "https:") ?? null };
}

/** One MusicBrainz call (url-rels): the artist's Wikidata item and English Wikipedia article. */
export async function artistEntityLinks(mbid: string, fetchFn: typeof fetch = fetch): Promise<EntityLinks> {
  const res = await politeFetch(`${API}/artist/${mbid}?inc=url-rels&fmt=json`, fetchFn, LINKS_USER_AGENT);
  if (res.status === 404) return { wikidataId: null, wikipediaUrl: null };
  if (!res.ok) throw new Error(`MusicBrainz links failed: ${res.status}`);
  const data = (await res.json()) as { relations?: UrlRelation[] };
  return entityLinksFromRelations(data.relations);
}

/** The first current YouTube channel link among an artist's MusicBrainz links. Pure, for tests. */
export function youtubeRefFromRelations(relations: UrlRelation[] | undefined): YouTubeRef | null {
  for (const rel of relations ?? []) {
    if (rel.ended || !rel.url?.resource) continue;
    if (rel.type !== "youtube" && !rel.url.resource.includes("youtube.com")) continue;
    const ref = parseYouTubeChannelUrl(rel.url.resource);
    if (ref) return ref;
  }
  return null;
}

// ---------- Names shared by several artists (per-artist lane, owner 17 Nov 2026) ----------

export interface IdentityCandidate {
  mbid: string;
  genres: string[];
  youtube: YouTubeRef | null;
}

/**
 * Which of several MusicBrainz artists with exactly this name is ours (ANNA, Quest, Dixon...): the one
 * whose genres are rock (rules.ts isRockGenreList); among several rock ones, the only one with a YouTube channel.
 * A single namesake with no genres at all is taken; one whose genres are clearly not rock is not.
 * Null when it cannot be told: the owner can then set "mbid" in data/artist-rules.json.
 */
export function pickArtist(candidates: IdentityCandidate[]): IdentityCandidate | null {
  const rock = candidates.filter((c) => c.genres.length > 0 && isRockGenreList(c.genres));
  if (rock.length === 1) return rock[0];
  if (rock.length > 1) {
    const withChannel = rock.filter((c) => c.youtube);
    return withChannel.length === 1 ? withChannel[0] : null;
  }
  return candidates.length === 1 && candidates[0].genres.length === 0 ? candidates[0] : null;
}

export interface ArtistIdentity {
  mbid: string | null;
  genres: string[];
  youtube: YouTubeRef | null;
  /** How many MusicBrainz artists carry exactly this name. */
  namesakes: number;
}

async function identityDetail(mbid: string, fetchFn: typeof fetch): Promise<IdentityCandidate> {
  const res = await politeFetch(`${API}/artist/${mbid}?inc=genres+tags+url-rels&fmt=json`, fetchFn);
  if (!res.ok) throw new Error(`MusicBrainz lookup failed: ${res.status}`);
  const d = (await res.json()) as { genres?: { name: string }[]; tags?: { name: string; count: number }[]; relations?: UrlRelation[] };
  const genres = [...(d.genres ?? []).map((g) => g.name), ...(d.tags ?? []).filter((t) => t.count > 0).map((t) => t.name)];
  return { mbid, genres: [...new Set(genres.map((g) => g.toLowerCase()))], youtube: youtubeRefFromRelations(d.relations) };
}

/**
 * The artist's MusicBrainz identity and official YouTube channel, telling namesakes apart by genre.
 * `mbid` (owner override) skips the search.
 */
export async function resolveArtistIdentity(
  name: string,
  opts: { aka?: string[]; mbid?: string } = {},
  fetchFn: typeof fetch = fetch,
): Promise<ArtistIdentity> {
  if (opts.mbid) {
    const c = await identityDetail(opts.mbid, fetchFn);
    return { ...c, namesakes: 1 };
  }
  const keys = new Set([name, ...(opts.aka ?? [])].map(nameKey));
  const query = encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`);
  const search = await politeFetch(`${API}/artist?query=${query}&limit=10&fmt=json`, fetchFn);
  if (!search.ok) throw new Error(`MusicBrainz search failed: ${search.status}`);
  const data = (await search.json()) as { artists?: { id: string; name: string; score: number; aliases?: { name: string }[] }[] };
  const exact = (data.artists ?? [])
    .filter((a) => a.score >= 80 && (keys.has(nameKey(a.name)) || a.aliases?.some((al) => keys.has(nameKey(al.name)))))
    .slice(0, 6);
  const candidates: IdentityCandidate[] = [];
  for (const a of exact) candidates.push(await identityDetail(a.id, fetchFn));
  const picked = pickArtist(candidates);
  return { mbid: picked?.mbid ?? null, genres: picked?.genres ?? [], youtube: picked?.youtube ?? null, namesakes: exact.length };
}
