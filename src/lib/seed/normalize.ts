// Turns data/seed-concerts.json into clean records ready for the database.
// Pure functions only (no database), so the rules are easy to test.

import { GENRES, LIVE_ACT, normalizeSetting, RETIRED_GENRES, type SettingName } from "../catalogue";
import { slugify } from "../slug";

// ---- Shape of data/seed-concerts.json ----

export interface SeedConcert {
  id: string;
  artist: string;
  title: string;
  channel: string;
  secs: number;
  views: number;
  date: string; // YYYY-MM-DD
  genres: string[];
  venue: string;
  city: string;
  country: string;
  setting: string;
  about: string;
  youtube_url: string;
  checked_embeddable_on: string; // YYYY-MM-DD
  /** Collaborator, e.g. "Sofiane Pamart" or "Joachim Pastor (as Sinners)". */
  with?: string;
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
  artists: Record<string, SeedArtistProfile>;
}

// ---- Clean records ----

export interface ArtistRecord {
  slug: string;
  name: string;
  /** Null when the seed has no profile for this artist (e.g. collaborators). */
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
  isOfficial: boolean;
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
  city: string | null;
  country: string | null;
  liveAct: boolean;
  writeUp: string | null;
  genres: string[];
  setting: SettingName;
  venueSlug: string | null;
  channelName: string;
  credits: CreditRecord[];
  checkedAt: Date;
}

export interface NormalizedSeed {
  artists: ArtistRecord[];
  venues: VenueRecord[];
  channels: ChannelRecord[];
  concerts: ConcertRecord[];
}

/**
 * Channels in the seed that are fan uploads rather than official channels.
 * They are imported with Channel.isOfficial = false so they can be hidden later
 * with one switch if the owner decides on "official channels only".
 */
export const FAN_UPLOAD_CHANNELS = new Set(["paardenmiddel", "anton", "WAiT_A_DrEAm"]);

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

/** "Joachim Pastor (as Sinners)" -> { name: "Joachim Pastor", note: "as Sinners" }. */
export function parseCollaborator(raw: string): { name: string; note: string | null } {
  const match = raw.trim().match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (match && match[1]) return { name: match[1].trim(), note: clean(match[2]) };
  return { name: raw.trim(), note: null };
}

/**
 * Split seed genres into real genres and the Live Act attribute.
 * Genres the owner took off the list are dropped; anything else unknown is an error.
 */
export function splitGenres(labels: string[], concertId: string): { genres: string[]; liveAct: boolean } {
  const known = new Set<string>(GENRES);
  const retired = new Set<string>(RETIRED_GENRES);
  const genres: string[] = [];
  let liveAct = false;
  for (const label of labels) {
    const name = label.trim();
    if (name === LIVE_ACT) {
      liveAct = true;
    } else if (retired.has(name)) {
      continue;
    } else if (known.has(name)) {
      if (!genres.includes(name)) genres.push(name);
    } else {
      throw new Error(`Concert ${concertId}: unknown genre "${name}". Add it to GENRES in src/lib/catalogue.ts.`);
    }
  }
  return { genres, liveAct };
}

/**
 * Readable concert URL: "{artist} {venue} {year}", e.g. "nto-spectra-festival-2026".
 * If two concerts would get the same slug, every one of them gets its YouTube ID appended,
 * so a slug never depends on the order of the input.
 */
export function buildConcertSlugs(concerts: Pick<SeedConcert, "id" | "artist" | "venue" | "date">[]): Map<string, string> {
  const base = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const concert of concerts) {
    const slug = slugify([concert.artist, concert.venue, concert.date.slice(0, 4)].filter(Boolean).join(" "));
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

    const { genres, liveAct } = splitGenres(raw.genres ?? [], id);

    const credits: CreditRecord[] = [
      { artistSlug: addArtist(raw.artist.trim()), role: "MAIN", creditNote: null, position: 0 },
    ];
    if (clean(raw.with)) {
      const collaborator = parseCollaborator(raw.with!);
      const slug = addArtist(collaborator.name);
      if (slug !== credits[0].artistSlug) {
        credits.push({ artistSlug: slug, role: "WITH", creditNote: collaborator.note, position: 1 });
      }
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

    const channelName = raw.channel.trim();
    if (!channels.has(channelName)) {
      channels.set(channelName, { name: channelName, isOfficial: !FAN_UPLOAD_CHANNELS.has(channelName) });
    }

    concerts.push({
      youtubeId: id,
      slug: slugs.get(raw.id)!,
      title: raw.title.trim(),
      durationSeconds: raw.secs,
      viewCount: raw.views,
      publishedAt: parseDate(raw.date, "date", id),
      city,
      country,
      liveAct,
      writeUp: clean(raw.about),
      genres,
      setting: normalizeSetting(raw.setting),
      venueSlug,
      channelName,
      credits,
      checkedAt: parseDate(raw.checked_embeddable_on, "checked_embeddable_on", id),
    });
  }

  return {
    artists: [...artists.values()],
    venues: [...venues.values()],
    channels: [...channels.values()],
    concerts,
  };
}
