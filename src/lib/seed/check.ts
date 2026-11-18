// The seed check (owner, 18 Nov 2026): before the hand-picked candidates in data/seed-concerts.csv go
// on the site, each one is checked against the YouTube Data API: public, embeddable, at least 40
// minutes, not blocked in ES/IT/GB/US/DE, and who really uploaded it. Pure functions only (no network),
// so the rules can be tested; scripts/seed-check.ts does the API calls and writes the files.

import { normalizeGenre, normalizeVenueKind } from "../catalogue";
import { looseName } from "../collector/rules";
import type { YouTubeVideo } from "../collector/youtube";
import type { SeedConcert } from "./normalize";

export const MIN_SECONDS = 40 * 60;

/** One row of data/seed-concerts.csv, as written by the owner. */
export interface CsvRow {
  id: string;
  band: string;
  genre: string;
  event_or_venue: string;
  city: string;
  country: string;
  date: string;
  decade: string;
  source_type: string;
  uploader: string;
  youtube_id: string;
  url: string;
  approx_length: string;
  setlist_available: string;
  status: string;
  notes: string;
}

/** Minimal RFC 4180 reader: commas, double quotes and "" inside quotes. First line = header. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? "").trim()])));
}

/** "unknown - check", "check" or empty: the owner did not know the uploader. */
export function uploaderUnknown(uploader: string): boolean {
  const u = uploader.trim().toLowerCase();
  return u === "" || u === "check" || u.startsWith("unknown");
}

/** The owner's uploader note without the hashtag aside: "Metallica (#MetallicaMondays)" -> "Metallica". */
function uploaderName(uploader: string): string {
  return uploader.replace(/\(.*?\)/g, "").trim();
}

/**
 * Whether the uploading channel is an official source we can confirm without asking the owner:
 * it carries the band's name, it is the channel the owner wrote down, or it is one of our listed
 * official channels (data/channels.json). Anything else needs the owner's word.
 */
export function confirmOfficial(
  channelTitle: string,
  row: Pick<CsvRow, "band" | "uploader">,
  listedChannels: string[],
): { official: boolean; why: string } {
  const title = looseName(channelTitle);
  if (!title) return { official: false, why: "no channel name" };
  if (title.includes(looseName(row.band))) return { official: true, why: "channel carries the band's name" };
  if (!uploaderUnknown(row.uploader)) {
    const noted = looseName(uploaderName(row.uploader));
    if (noted && (title === noted || title.includes(noted) || noted.includes(title))) {
      return { official: true, why: `matches the uploader noted in the CSV (${uploaderName(row.uploader)})` };
    }
  }
  const listed = listedChannels.find((name) => looseName(name) && title.includes(looseName(name)));
  if (listed) return { official: true, why: `listed official channel (${listed})` };
  return { official: false, why: "uploader not confirmed as official" };
}

/** Festival / Room / Livestream / TV-Studio from the owner's source type and venue. */
export function venueKindFor(row: Pick<CsvRow, "source_type" | "event_or_venue">): string {
  const s = `${row.source_type} ${row.event_or_venue}`.toLowerCase();
  if (/festival|pinkpop|primavera|rock in rio|roskilde|glastonbury|rock am ring|hellfest/.test(s)) return normalizeVenueKind("Festival");
  if (/livestream|stream|webcast/.test(s)) return normalizeVenueKind("Livestream");
  if (/tv|studio/.test(s)) return normalizeVenueKind("TV-Studio");
  return normalizeVenueKind("Room");
}

export type RowOutcome =
  | { kind: "pass"; concert: SeedConcert; officialWhy: string }
  /** Passes YouTube's checks, but the uploader may be a fan: the owner decides. */
  | { kind: "ask"; concert: SeedConcert; reason: string }
  | { kind: "drop"; reasons: string[] };

/** One CSV row against what YouTube says today. `video` null: YouTube returned nothing for the ID. */
export function checkRow(row: CsvRow, video: YouTubeVideo | null, listedChannels: string[], today: string): RowOutcome {
  if (!video) return { kind: "drop", reasons: ["not found on YouTube (deleted or private)"] };
  const reasons: string[] = [];
  if (video.privacyStatus !== "public") reasons.push(`not public (${video.privacyStatus})`);
  if (!video.embeddable) reasons.push("embedding switched off");
  if (video.liveBroadcastContent !== "none") reasons.push("still live or upcoming");
  if (video.uploadStatus !== "processed") reasons.push(`not processed (${video.uploadStatus})`);
  if (video.durationSeconds < MIN_SECONDS) reasons.push(`too short (${Math.round(video.durationSeconds / 60)} min)`);
  if (video.blockedIn.length) reasons.push(`blocked in ${video.blockedIn.join(", ")}`);
  const genre = normalizeGenre(row.genre);
  if (!genre) reasons.push(`genre "${row.genre}" is not on our list`);
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(row.date)) reasons.push(`concert date "${row.date}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
  if (reasons.length) return { kind: "drop", reasons };

  const concert: SeedConcert = {
    id: video.youtubeId,
    artist: row.band,
    title: video.title,
    channel: video.channelTitle,
    channel_id: video.channelId,
    official: false,
    secs: video.durationSeconds,
    views: video.viewCount,
    date: video.publishedAt.toISOString().slice(0, 10),
    performed: row.date,
    genres: [genre!],
    venue: row.event_or_venue,
    city: row.city,
    country: row.country,
    venueKind: venueKindFor(row),
    checked_on: today,
  };
  const official = confirmOfficial(video.channelTitle, row, listedChannels);
  if (!official.official) return { kind: "ask", concert, reason: `${official.why}: uploaded by "${video.channelTitle}"` };
  return { kind: "pass", concert: { ...concert, official: true }, officialWhy: official.why };
}
