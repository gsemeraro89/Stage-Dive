// Live albums (owner, 21 Nov 2026, from the keyword research: "<band> live albums"). For every band
// with a page and a MusicBrainz ID (src/lib/entity-links.ts), its live albums as MusicBrainz lists
// them: release groups of primary type Album with the secondary type Live, official releases only
// (bootleg-only groups left out). Open data (CC0), stored in artist_live_albums and shown on the band
// page ("Live albums", a FAQ answer, the Markdown copy), each linking to its MusicBrainz release group.
// Run by scripts/entity-links.ts right after the entity links, so in GitHub Actions (collect.yml after
// new bands, band-photos.yml monthly or by hand). MusicBrainz is asked at most once a second
// (politeFetch). A band is asked again after RECHECK_DAYS, or at once when its MusicBrainz ID changes.
// An album is tied to one of our concerts only when that is certain (matchConcert): same place named
// in the title, same year, a single candidate.
// Network calls come in as `deps`, so the job is tested without the internet (tests/live-albums.test.ts).
import type { PrismaClient } from "../generated/prisma/client";
import { LINKS_USER_AGENT, nameKey, politeFetch } from "./collector/musicbrainz";

const API = "https://musicbrainz.org/ws/2";

/** Bands are asked again after this many days (discographies change slowly). */
export const LIVE_RECHECK_DAYS = 90;
/** Release groups read per band at most (100 per page). */
export const MAX_PAGES = 5;
/** Live albums named in the FAQ answer; the band page lists up to LIVE_ALBUMS_SHOWN. */
export const LIVE_ALBUMS_IN_ANSWER = 10;
export const LIVE_ALBUMS_SHOWN = 20;

export interface LiveAlbum {
  /** MusicBrainz release group ID. */
  mbid: string;
  title: string;
  year: number | null;
}

interface RawReleaseGroup {
  id?: string;
  title?: string;
  "primary-type"?: string | null;
  "secondary-types"?: string[];
  "first-release-date"?: string;
}

export interface RawReleaseGroupPage {
  "release-groups"?: RawReleaseGroup[];
  "release-group-count"?: number;
  "release-group-offset"?: number;
}

export const releaseGroupUrl = (mbid: string) => `https://musicbrainz.org/release-group/${mbid}`;
export const artistUrl = (mbid: string) => `https://musicbrainz.org/artist/${mbid}`;

/** The live albums in one MusicBrainz page: Album + Live, with a title and an ID. Pure. */
export function liveAlbumsFrom(page: RawReleaseGroupPage): LiveAlbum[] {
  const out: LiveAlbum[] = [];
  for (const g of page["release-groups"] ?? []) {
    if (!g.id || !g.title?.trim()) continue;
    if (g["primary-type"] !== "Album" || !(g["secondary-types"] ?? []).includes("Live")) continue;
    const year = Number(g["first-release-date"]?.slice(0, 4));
    out.push({ mbid: g.id, title: g.title.trim(), year: year >= 1900 && year <= 2100 ? year : null });
  }
  return out;
}

/** Oldest first, undated last, then by title. Pure. */
export function sortAlbums<T extends { title: string; year: number | null }>(albums: T[]): T[] {
  return [...albums].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title));
}

/**
 * Every live album of an artist, from the release-group browse (type=album, official groups only).
 * If MusicBrainz refuses the official-only filter (400), it asks again without it.
 */
export async function fetchLiveAlbums(mbid: string, fetchFn: typeof fetch = fetch): Promise<LiveAlbum[]> {
  const found = new Map<string, LiveAlbum>();
  let statusFilter = true;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `${API}/release-group?artist=${encodeURIComponent(mbid)}&type=album&fmt=json&limit=100&offset=${page * 100}` +
      (statusFilter ? "&release-group-status=website-default" : "");
    const res = await politeFetch(url, fetchFn, LINKS_USER_AGENT);
    if (res.status === 400 && statusFilter) {
      statusFilter = false;
      page--;
      continue;
    }
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`MusicBrainz release groups failed: ${res.status}`);
    const data = (await res.json()) as RawReleaseGroupPage;
    for (const a of liveAlbumsFrom(data)) found.set(a.mbid, a);
    const total = data["release-group-count"] ?? 0;
    if ((page + 1) * 100 >= total || !(data["release-groups"] ?? []).length) break;
  }
  return sortAlbums([...found.values()]);
}

// ---- Tying an album to one of our concerts ----

export interface MatchableConcert {
  slug: string;
  venue: { name: string } | null;
  performedYear: number | null;
}

/**
 * The concert of ours that a live album records, only when it is certain: the place's name is in the
 * album title (whole words, 4+ characters), the year matches (a year in the title, or else the year the
 * album came out) and exactly one concert fits. Null otherwise. Pure.
 */
export function matchConcert<T extends MatchableConcert>(album: { title: string; year: number | null }, concerts: T[]): T | null {
  const title = ` ${nameKey(album.title)} `;
  const titleYears = [...album.title.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map((m) => Number(m[1]));
  const fits = concerts.filter((c) => {
    if (!c.venue || !c.performedYear) return false;
    const place = nameKey(c.venue.name);
    if (place.length < 4 || !title.includes(` ${place} `)) return false;
    return titleYears.length ? titleYears.includes(c.performedYear) : album.year === c.performedYear;
  });
  return fits.length === 1 ? fits[0] : null;
}

/** A live album as the band page and its answers show it, with our concert when it is tied to one. */
export interface LiveAlbumView extends LiveAlbum {
  url: string;
  concert: { slug: string } | null;
}

export function liveAlbumViews(albums: LiveAlbum[], concerts: MatchableConcert[]): LiveAlbumView[] {
  return sortAlbums(albums).map((a) => {
    const c = matchConcert(a, concerts);
    return { ...a, url: releaseGroupUrl(a.mbid), concert: c ? { slug: c.slug } : null };
  });
}

// ---- The job ----

export interface LiveAlbumDeps {
  liveAlbums: (mbid: string) => Promise<LiveAlbum[]>;
}

export interface LiveAlbumStats {
  checked: number;
  withAlbums: string[];
  none: number;
  errors: string[];
}

/** Whether a band is due: never asked, asked long ago, or asked with another MusicBrainz ID. Pure. */
export function liveAlbumsDue(band: { mbid: string | null; liveAlbumsMbid: string | null; liveAlbumsCheckedAt: Date | null }, now: Date, force = false): boolean {
  if (!band.mbid) return false;
  if (force || !band.liveAlbumsCheckedAt || band.liveAlbumsMbid !== band.mbid) return true;
  return band.liveAlbumsCheckedAt.getTime() < now.getTime() - LIVE_RECHECK_DAYS * 86_400_000;
}

export async function refreshLiveAlbums(
  db: PrismaClient,
  deps: LiveAlbumDeps,
  options: { limit?: number; now?: Date; force?: boolean } = {},
): Promise<LiveAlbumStats> {
  const now = options.now ?? new Date();
  const stats: LiveAlbumStats = { checked: 0, withAlbums: [], none: 0, errors: [] };
  // Bands with a page (a visible concert of their own) and a MusicBrainz ID; due ones picked here (the ID
  // comparison cannot be written as a database filter). A few hundred rows at most.
  const bands = await db.artist.findMany({
    where: { mbid: { not: null }, credits: { some: { role: "MAIN", concert: { status: "PUBLISHED", embeddable: true, privacyStatus: "public" } } } },
    select: { id: true, name: true, mbid: true, liveAlbumsMbid: true, liveAlbumsCheckedAt: true },
    orderBy: [{ liveAlbumsCheckedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });
  const due = bands.filter((b) => liveAlbumsDue(b, now, options.force)).slice(0, options.limit ?? 200);
  for (const band of due) {
    stats.checked++;
    try {
      const albums = await deps.liveAlbums(band.mbid!);
      // Replaced as a whole: an album MusicBrainz no longer lists goes.
      await db.$transaction([
        db.artistLiveAlbum.deleteMany({ where: { artistId: band.id } }),
        db.artistLiveAlbum.createMany({ data: albums.map((a) => ({ artistId: band.id, mbid: a.mbid, title: a.title, year: a.year })), skipDuplicates: true }),
        db.artist.update({ where: { id: band.id }, data: { liveAlbumsCheckedAt: now, liveAlbumsMbid: band.mbid } }),
      ]);
      if (albums.length) stats.withAlbums.push(`${band.name}: ${albums.length}`);
      else stats.none++;
    } catch (error) {
      // Not marked as checked: asked again next run.
      stats.errors.push(`${band.name}: ${(error as Error).message}`);
    }
  }
  return stats;
}
