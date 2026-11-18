// Structured data for search engines (CLAUDE.md "Definition of done": VideoObject for concerts,
// MusicGroup for bands). Pages put the result in <script type="application/ld+json"> with `jsonLd()`.
import type { ConcertView } from "./queries";
import type { SetlistView } from "./setlist/view";
import { siteUrl } from "./site";

/** 7416 -> "PT2H3M36S" (ISO 8601 duration). */
export function isoDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}

/** A line about the gig when we have no write-up: "Metallica live at The Metro, Chicago, 1983." */
function describe(c: ConcertView): string {
  const place = [c.venue?.name, c.city].filter(Boolean).join(", ");
  const year = c.performedYear ?? c.publishedAt.getUTCFullYear();
  return `${c.credits} live${place ? ` at ${place}` : ""}, ${year}. The full concert, free to watch.`;
}

/** schema.org VideoObject for a concert page (the video is YouTube's; we embed it). */
export function concertJsonLd(c: ConcertView, setlist: SetlistView | null = null): Record<string, unknown> {
  const url = `${siteUrl()}/concerts/${c.slug}`;
  const songs = setlist?.tracks.filter((t) => t.time !== null) ?? [];
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `${c.credits} — ${[c.venue?.name, c.performedYear].filter(Boolean).join(" ")}`.trim(),
    description: c.writeUp ?? describe(c),
    thumbnailUrl: [c.thumbnail.src],
    uploadDate: c.publishedAt.toISOString(),
    duration: isoDuration(c.durationSeconds),
    embedUrl: `https://www.youtube.com/embed/${c.youtubeId}`,
    url,
    ...(c.genres.length ? { genre: c.genres.map((g) => g.name) } : {}),
    // Songs as chapters ("key moments"): each starts at its time in the video.
    ...(songs.length
      ? {
          hasPart: songs.map((t, i) => ({
            "@type": "Clip",
            name: t.title,
            startOffset: t.time,
            ...(songs[i + 1] ? { endOffset: songs[i + 1].time } : { endOffset: c.durationSeconds }),
            url: `https://www.youtube.com/watch?v=${c.youtubeId}&t=${t.time}s`,
          })),
        }
      : {}),
  };
}

/** schema.org MusicGroup for a band page. */
export function bandJsonLd(
  band: { slug: string; name: string; bio?: string | null; origin?: string | null },
  concerts: ConcertView[],
): Record<string, unknown> {
  const url = `${siteUrl()}/artists/${band.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: band.name,
    url,
    ...(band.bio ? { description: band.bio } : {}),
    ...(band.origin ? { foundingLocation: { "@type": "Place", name: band.origin } } : {}),
    subjectOf: concerts.slice(0, 20).map((c) => ({
      "@type": "VideoObject",
      name: c.title,
      url: `${siteUrl()}/concerts/${c.slug}`,
      thumbnailUrl: c.thumbnail.src,
      uploadDate: c.publishedAt.toISOString(),
    })),
  };
}

/** JSON for a <script type="application/ld+json"> tag, safe against "</script>" in titles. */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
