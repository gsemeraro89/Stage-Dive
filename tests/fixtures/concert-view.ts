// A concert as the pages see it (ConcertView), for the SEO, answers and Markdown tests.
import type { ConcertView } from "../../src/lib/queries";

export function concertView(over: Partial<ConcertView> = {}): ConcertView {
  return {
    id: 1,
    youtubeId: "IA9xKr_Dmek",
    slug: "metallica-l-c-walker-arena-1991",
    title: "Metallica: Live in Muskegon, MI - November 1, 1991",
    credits: "Metallica",
    artists: [{ slug: "metallica", name: "Metallica", role: "MAIN", creditNote: null, hasPage: true }],
    venue: { slug: "l-c-walker-arena", name: "L.C. Walker Arena" },
    city: "Muskegon",
    country: "US",
    venueKind: { slug: "room", name: "Room" },
    genres: [{ slug: "metal", name: "metal" }],
    performedYear: 1991,
    performedOn: new Date("1991-11-01T00:00:00Z"),
    tour: { slug: "wherever-we-may-roam", name: "Wherever We May Roam Tour" },
    durationSeconds: 8520,
    viewCount: 2_400_000,
    publishedAt: new Date("2021-05-03T00:00:00Z"),
    channel: { name: "Metallica", isOfficial: true },
    writeUp: null,
    thumbnail: { src: "https://i.ytimg.com/vi/IA9xKr_Dmek/hqdefault.jpg", srcSet: "", width: 480, height: 360 },
    hasSetlist: true,
    curated: false,
    ...over,
  };
}

export const setlist = {
  source: "DESCRIPTION",
  tracks: [
    { time: 0, artist: null, title: "Enter Sandman", unidentified: false, artistSlug: null },
    { time: 315, artist: null, title: "Creeping Death", unidentified: false, artistSlug: null },
    { time: 700, artist: null, title: "ID", unidentified: true, artistSlug: null },
    { time: 1300, artist: "Misfits", title: "Last Caress", unidentified: false, artistSlug: null },
    { time: 1500, artist: null, title: "Seek & Destroy", unidentified: false, artistSlug: null },
  ],
};

/** Copy rules (owner, 19 Nov 2026): words never used in visible text, metadata, .md or llms files. */
export const BANNED = /\bfree\b|freely|archive|upload|full-length/i;
/** "YouTube" is allowed only right after a view count ("2,400,000 views on YouTube"). */
export function youtubeOnlyWithViews(text: string): boolean {
  return text.replace(/views on YouTube/g, "").replace(/Views on YouTube/g, "").search(/youtube/i) === -1;
}
