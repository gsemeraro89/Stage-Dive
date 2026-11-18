// The tracklist as the concert page shows it. Reads the stored JSON defensively: anything that is not
// a well-formed track is left out rather than breaking the page.

import { slugify } from "../slug";

export interface TrackView {
  /** Seconds from the start, or null when the source gives no times. */
  time: number | null;
  artist: string | null;
  title: string;
  /** Not identified yet ("ID"). Shown as "ID" with an explanation on hover. */
  unidentified: boolean;
  /** Slug of the artist's page on FullDJSet, when we have one. */
  artistSlug: string | null;
}

export interface TracklistView {
  tracks: TrackView[];
  /** DESCRIPTION, CHANNEL_COMMENT, COMMENT or CLAUDE. */
  source: string | null;
}

export function readTracklist(json: unknown, source: string | null): TracklistView | null {
  if (!Array.isArray(json)) return null;
  const tracks: TrackView[] = [];
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const { time, artist, title } = item as Record<string, unknown>;
    if (typeof title !== "string" || !title.trim()) continue;
    const name = typeof artist === "string" && artist.trim() ? artist.trim() : null;
    tracks.push({
      time: typeof time === "number" && Number.isFinite(time) && time >= 0 ? Math.floor(time) : null,
      artist: name,
      title: title.trim(),
      unidentified: /^ID$/i.test(title.trim()),
      artistSlug: null,
    });
  }
  return tracks.length ? { tracks, source } : null;
}

/** Slugs to look up for artist links ("ID" and empty names never link). */
export function artistSlugsIn(view: TracklistView | null): string[] {
  if (!view) return [];
  return [...new Set(view.tracks.filter((t) => t.artist && !/^ID$/i.test(t.artist)).map((t) => slugify(t.artist!)))].filter(Boolean);
}

/** Link the tracks whose artist has a page with us. */
export function linkArtists(view: TracklistView | null, known: Set<string>): TracklistView | null {
  if (!view) return null;
  return {
    ...view,
    tracks: view.tracks.map((t) => {
      const slug = t.artist && !/^ID$/i.test(t.artist) ? slugify(t.artist) : "";
      return { ...t, artistSlug: slug && known.has(slug) ? slug : null };
    }),
  };
}

/** Where the tracklist was read, in words for the page. */
export function sourceNote(source: string | null): string {
  switch (source) {
    case "DESCRIPTION":
      return "Tracklist from the video description on YouTube.";
    case "CHANNEL_COMMENT":
      return "Tracklist from the uploader's comment on YouTube.";
    case "COMMENT":
      return "Tracklist from a viewer's comment on YouTube. It may contain mistakes.";
    default:
      return "Tracklist from the video's description or comments on YouTube.";
  }
}
