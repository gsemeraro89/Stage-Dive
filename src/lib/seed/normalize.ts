// Turns data/seed-concerts.json into clean records ready for the database.
// Pure functions only (no database), so the rules are easy to test.
//
// data/seed-concerts.json is written by `npm run seed-check` from data/seed-concerts.csv (the owner's
// hand-picked list) plus what the YouTube Data API says about each video today. Rows that fail the
// checks (not public, not embeddable, under 40 minutes, blocked in a key country) never reach it.

import { normalizeGenre, normalizeVenueKind, type VenueKindName } from "../catalogue";
import { slugify } from "../slug";

// ---- Shape of data/seed-concerts.json ----

export interface SeedConcert {
  /** YouTube video ID. */
  id: string;
  /** The band, as it should be written on the site. */
  artist: string;
  /** YouTube title (YouTube data: refreshed by the nightly job). */
  title: string;
  /** Uploader channel name, as YouTube reports it. */
  channel: string;
  /** Uploader channel ID (UC...), when known. */
  channel_id?: string;
  /** Official source (artist, label, festival or broadcaster channel) rather than a fan upload. */
  official: boolean;
  secs: number;
  views: number;
  /** Upload date, YYYY-MM-DD. */
  date: string;
  /** When the concert was played: YYYY, YYYY-MM or YYYY-MM-DD. */
  performed: string;
  genres: string[];
  venue: string;
  city: string;
  country: string;
  /** Festival, Room, Livestream or TV-Studio (aliases allowed, see catalogue.ts). */
  venueKind: string;
  /** Tour name, when the concert belongs to one. */
  tour?: string;
  /** Our own text about the concert. */
  about?: string;
  /** Guest billed with the band, e.g. "Lars Ulrich (drums on one song)". */
  with?: string;
  /** Day the YouTube facts were read, YYYY-MM-DD. */
  checked_on: string;
}

export interface SeedArtistProfile {
  aka?: string;
  origin?: string;
  label?: string;
  bio?: string;
  similar?: string[];
}

export interface SeedFile {
  concerts: SeedConcert[];
  artists?: Record<string, SeedArtistProfile>;
}

// ---- Clean records ----

export interface ArtistRecord {
  slug: string;
  name: string;
  /** Null when the seed has no profile for this artist (e.g. guests). */
  profile: {
    aka: string | null;
    origin: string | null;
    label: string | null;
    bio: string | null;
    similarNames: string[];
  } | null;
}

export interface VenueRecord {
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
}

export interface ChannelRecord {
  name: string;
  youtubeChannelId: string | null;
  isOfficial: boolean;
}

export interface TourRecord {
  slug: string;
  name: string;
  artistSlug: string;
}

export interface CreditRecord {
  artistSlug: string;
  role: "MAIN" | "WITH";
  creditNote: string | null;
  position: number;
}

export interface ConcertRecord {
  youtubeId: string;
  slug: string;
  title: string;
  durationSeconds: number;
  viewCount: number;
  publishedAt: Date;
  performedYear: number;
  performedOn: Date | null;
  city: string | null;
  country: string | null;
  writeUp: string | null;
  genres: string[];
  venueKind: VenueKindName;
  venueSlug: string | null;
  tourSlug: string | null;
  channelName: string;
  credits: CreditRecord[];
  checkedAt: Date;
}

export interface NormalizedSeed {
  artists: ArtistRecord[];
  venues: VenueRecord[];
  channels: ChannelRecord[];
  tours: TourRecord[];
  concerts: ConcertRecord[];
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** "" or whitespace -> null. */
function clean(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseDate(value: string, field: string, concertId: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Concert ${concertId}: ${field} "${value}" is not a YYYY-MM-DD date`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Concert ${concertId}: ${field} "${value}" is not a real date`);
  }
  return date;
}

/**
 * When a concert was played. Often only the year (Pinkpop 1997) or the month is known:
 * "1997" -> { year: 1997, day: null }; "2026-06" -> { year: 2026, day: null };
 * "1983-08-12" -> { year: 1983, day: 1983-08-12 }.
 */
export function parsePerformed(value: string, concertId: string): { year: number; day: Date | null } {
  const v = value?.trim() ?? "";
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(v);
  if (!m) throw new Error(`Concert ${concertId}: performed "${value}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
  const year = Number(m[1]);
  if (year < 1950 || year > new Date().getUTCFullYear()) throw new Error(`Concert ${concertId}: performed year ${year} is out of range`);
  if (m[2] && (Number(m[2]) < 1 || Number(m[2]) > 12)) throw new Error(`Concert ${concertId}: performed month "${m[2]}" is not real`);
  return { year, day: m[3] ? parseDate(v, "performed", concertId) : null };
}

/** "Lars Ulrich (drums on one song)" -> { name: "Lars Ulrich", note: "drums on one song" }. */
export function parseCollaborator(raw: string): { name: string; note: string | null } {
  const match = raw.trim().match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (match && match[1]) return { name: match[1].trim(), note: clean(match[2]) };
  return { name: raw.trim(), note: null };
}

/** Seed genres onto our list. Anything unknown is an error, so a typo never disappears quietly. */
export function cleanGenres(labels: string[], concertId: string): string[] {
  const genres: string[] = [];
  for (const label of labels) {
    const name = normalizeGenre(label);
    if (!name) throw new Error(`Concert ${concertId}: unknown genre "${label}". Add it to GENRES in src/lib/catalogue.ts.`);
    if (!genres.includes(name)) genres.push(name);
  }
  return genres;
}

/**
 * Readable concert URL: "{band} {venue} {year played}", e.g. "metallica-the-metro-1983".
 * If two concerts would get the same slug, every one of them gets its YouTube ID appended,
 * so a slug never depends on the order of the input.
 */
export function buildConcertSlugs(concerts: Pick<SeedConcert, "id" | "artist" | "venue" | "performed">[]): Map<string, string> {
  const base = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const concert of concerts) {
    const slug = slugify([concert.artist, concert.venue, concert.performed?.slice(0, 4)].filter(Boolean).join(" "));
    base.set(concert.id, slug);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  const result = new Map<string, string>();
  for (const [id, slug] of base) {
    result.set(id, (counts.get(slug) ?? 0) > 1 ? `${slug}-${id.toLowerCase()}` : slug);
  }
  return result;
}

export function normalizeSeed(seed: SeedFile): NormalizedSeed {
  if (!Array.isArray(seed.concerts)) throw new Error("Seed file has no 'concerts' list");

  const artists = new Map<string, ArtistRecord>();
  const venues = new Map<string, VenueRecord>();
  const channels = new Map<string, ChannelRecord>();
  const tours = new Map<string, TourRecord>();
  const seenIds = new Set<string>();

  const addArtist = (name: string): string => {
    const slug = slugify(name);
    if (!slug) throw new Error(`Artist name "${name}" gives an empty slug`);
    if (!artists.has(slug)) artists.set(slug, { slug, name, profile: null });
    return slug;
  };

  // Artist profiles first, so profiled artists keep their exact spelling.
  for (const [name, profile] of Object.entries(seed.artists ?? {})) {
    const slug = addArtist(name);
    artists.get(slug)!.profile = {
      aka: clean(profile.aka),
      origin: clean(profile.origin),
      label: clean(profile.label),
      bio: clean(profile.bio),
      similarNames: (profile.similar ?? []).map((s) => s.trim()).filter(Boolean),
    };
  }

  const slugs = buildConcertSlugs(seed.concerts);
  const concerts: ConcertRecord[] = [];

  for (const raw of seed.concerts) {
    const id = raw.id?.trim();
    if (!id || !YOUTUBE_ID.test(id)) throw new Error(`Invalid YouTube ID "${raw.id}"`);
    if (seenIds.has(id)) throw new Error(`Concert ${id} appears twice in the seed file`);
    seenIds.add(id);

    if (!clean(raw.title)) throw new Error(`Concert ${id}: missing title`);
    if (!clean(raw.artist)) throw new Error(`Concert ${id}: missing artist`);
    if (!clean(raw.channel)) throw new Error(`Concert ${id}: missing channel`);
    if (!Number.isInteger(raw.secs) || raw.secs <= 0) throw new Error(`Concert ${id}: invalid duration ${raw.secs}`);
    if (!Number.isInteger(raw.views) || raw.views < 0) throw new Error(`Concert ${id}: invalid view count ${raw.views}`);

    const mainSlug = addArtist(raw.artist.trim());
    const credits: CreditRecord[] = [{ artistSlug: mainSlug, role: "MAIN", creditNote: null, position: 0 }];
    if (clean(raw.with)) {
      const guest = parseCollaborator(raw.with!);
      const slug = addArtist(guest.name);
      if (slug !== mainSlug) credits.push({ artistSlug: slug, role: "WITH", creditNote: guest.note, position: 1 });
    }

    const city = clean(raw.city);
    const country = clean(raw.country);
    const venueName = clean(raw.venue);
    let venueSlug: string | null = null;
    if (venueName) {
      venueSlug = slugify(venueName);
      // First appearance wins; later concerts fill in a missing city or country.
      const existing = venues.get(venueSlug);
      if (!existing) venues.set(venueSlug, { slug: venueSlug, name: venueName, city, country });
      else {
        existing.city ??= city;
        existing.country ??= country;
      }
    }

    const tourName = clean(raw.tour);
    let tourSlug: string | null = null;
    if (tourName) {
      tourSlug = slugify(`${raw.artist} ${tourName}`);
      if (!tours.has(tourSlug)) tours.set(tourSlug, { slug: tourSlug, name: tourName, artistSlug: mainSlug });
    }

    const channelName = raw.channel.trim();
    const existingChannel = channels.get(channelName);
    if (!existingChannel) {
      channels.set(channelName, { name: channelName, youtubeChannelId: clean(raw.channel_id), isOfficial: raw.official === true });
    } else {
      existingChannel.youtubeChannelId ??= clean(raw.channel_id);
      existingChannel.isOfficial ||= raw.official === true;
    }

    const performed = parsePerformed(raw.performed, id);
    concerts.push({
      youtubeId: id,
      slug: slugs.get(raw.id)!,
      title: raw.title.trim(),
      durationSeconds: raw.secs,
      viewCount: raw.views,
      publishedAt: parseDate(raw.date, "date", id),
      performedYear: performed.year,
      performedOn: performed.day,
      city,
      country,
      writeUp: clean(raw.about),
      genres: cleanGenres(raw.genres ?? [], id),
      venueKind: normalizeVenueKind(raw.venueKind),
      venueSlug,
      tourSlug,
      channelName,
      credits,
      checkedAt: parseDate(raw.checked_on, "checked_on", id),
    });
  }

  return {
    artists: [...artists.values()],
    venues: [...venues.values()],
    channels: [...channels.values()],
    tours: [...tours.values()],
    concerts,
  };
}
