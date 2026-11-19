// Structured data for search engines and AI assistants (schema.org JSON-LD). Every schema.org object
// the site emits is built here; pages put them in <JsonLd> (src/components/seo/JsonLd.tsx).
// - Concert pages: VideoObject (songs as Clips, "key moments") + MusicEvent (the night itself: who,
//   where, when), linked to each other, + BreadcrumbList.
// - Band pages: MusicGroup (sameAs MusicBrainz / Wikidata / the band's channel when we hold them) +
//   BreadcrumbList + FAQPage for the questions shown on the page.
// - Lists: ItemList. Home: WebSite (with its search) + Organization.
// Only facts that are visible on the page or held in the database; nothing is invented.
// Tested in tests/structured-data.test.ts.
import { concertAnswers } from "./answers";
import type { ConcertView } from "./queries";
import { abs, SHARE_FALLBACK_IMAGE, SITE_ALTERNATE_NAMES } from "./seo";
import { startAtPath, START_PARAM } from "./player/start-time";
import type { SetlistView } from "./setlist/view";
import { SITE_NAME } from "./site";

type Json = Record<string, unknown>;

/** 7416 -> "PT2H3M36S" (ISO 8601 duration). */
export function isoDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}

/** The date a concert was played, as schema.org wants it: "1991-11-01", or "1991" when only the year is known. */
export function playedDate(c: { performedOn: Date | null; performedYear: number | null }): string | null {
  if (c.performedOn) return new Date(c.performedOn).toISOString().slice(0, 10);
  return c.performedYear ? String(c.performedYear) : null;
}

const concertUrl = (slug: string) => abs(`/concerts/${slug}`);
const performers = (c: ConcertView) =>
  c.artists.map((a) => ({ "@type": "MusicGroup", name: a.name, ...(a.hasPage ? { url: abs(`/artists/${a.slug}`) } : {}) }));

/**
 * Google "key moments" for a concert video: one Clip per setlist song with a known start time, ending
 * where the next timed song starts (or at the end of the video), each linking to our own page at that
 * second (?t=, honoured by src/components/player/StartFromUrl.tsx). Empty when the setlist has no times.
 */
export function songClips(c: { slug: string; durationSeconds: number }, setlist: SetlistView | null): Json[] {
  const timed = (setlist?.tracks ?? []).filter((t) => t.time !== null && t.time < c.durationSeconds);
  const clips: Json[] = [];
  timed.forEach((t, i) => {
    const end = timed.slice(i + 1).find((n) => n.time! > t.time!)?.time ?? c.durationSeconds;
    if (t.unidentified || end <= t.time!) return;
    clips.push({ "@type": "Clip", name: t.title, startOffset: t.time, endOffset: end, url: abs(startAtPath(c.slug, t.time!)) });
  });
  return clips;
}

/** schema.org VideoObject for a concert page (the video is YouTube's; we embed it). */
export function concertJsonLd(c: ConcertView, setlist: SetlistView | null = null): Json {
  const url = concertUrl(c.slug);
  const clips = songClips(c, setlist);
  const date = playedDate(c);
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `${url}#video`,
    name: `${c.credits} — ${[c.venue?.name ?? c.city, c.performedYear].filter(Boolean).join(" ") || c.title}`.trim(),
    description: c.writeUp ?? concertAnswers(c, setlist).lead,
    thumbnailUrl: [c.thumbnail.src],
    uploadDate: c.publishedAt.toISOString(),
    duration: isoDuration(c.durationSeconds),
    embedUrl: `https://www.youtube.com/embed/${c.youtubeId}`,
    url,
    ...(c.genres.length ? { genre: c.genres.map((g) => g.name) } : {}),
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: { "@type": "WatchAction" },
      userInteractionCount: c.viewCount,
    },
    actor: performers(c),
    ...(date && (c.venue || c.city) ? { recordedAt: { "@id": `${url}#event` } } : {}),
    // Songs as chapters ("key moments"), and how to link to any second of the concert on our page.
    ...(clips.length
      ? {
          hasPart: clips,
          potentialAction: {
            "@type": "SeekToAction",
            target: `${url}?${START_PARAM}={seek_to_second_number}`,
            "startOffset-input": "required name=seek_to_second_number",
          },
        }
      : {}),
  };
}

/**
 * schema.org MusicEvent for the night the concert was played: performers, place, date and the songs
 * of the setlist. Only when we know both a date (at least the year) and a place; null otherwise.
 * No eventStatus: schema.org has no value for "it happened", and the event is in the past.
 */
export function concertEventJsonLd(c: ConcertView, setlist: SetlistView | null = null): Json | null {
  const date = playedDate(c);
  if (!date || !(c.venue || c.city)) return null;
  const url = concertUrl(c.slug);
  const main = c.artists.find((a) => a.role === "MAIN")?.name.toLowerCase();
  const works = [
    ...new Set(
      (setlist?.tracks ?? [])
        // The band's own songs (a cover keeps its other artist out of "workPerformed").
        .filter((t) => !t.unidentified && (!t.artist || t.artist.toLowerCase() === main))
        .map((t) => t.title),
    ),
  ];
  const address = [c.city, c.country].some(Boolean)
    ? { address: { "@type": "PostalAddress", ...(c.city ? { addressLocality: c.city } : {}), ...(c.country ? { addressCountry: c.country } : {}) } }
    : {};
  const inPerson = c.venueKind?.slug === "festival" || c.venueKind?.slug === "room";
  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    "@id": `${url}#event`,
    name: `${c.credits} live${c.venue ? ` at ${c.venue.name}` : c.city ? ` in ${c.city}` : ""} ${c.performedYear ?? ""}`.trim(),
    url,
    startDate: date,
    ...(inPerson ? { eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode" } : {}),
    location: {
      "@type": "Place",
      name: c.venue?.name ?? c.city,
      ...(c.venue ? { url: abs(`/venues/${c.venue.slug}`) } : {}),
      ...address,
    },
    performer: performers(c),
    image: [c.thumbnail.src],
    ...(c.tour ? { superEvent: { "@type": "EventSeries", name: c.tour.name, url: abs(`/tours/${c.tour.slug}`) } } : {}),
    ...(works.length ? { workPerformed: works.map((name) => ({ "@type": "MusicComposition", name })) } : {}),
    recordedIn: { "@id": `${url}#video` },
  };
}

/** Where a band is known elsewhere, as links: MusicBrainz, Wikidata, the band's own channel. Only IDs we hold. */
export function bandSameAs(ids: { mbid?: string | null; wikidataId?: string | null; youtubeChannelId?: string | null }): string[] {
  return [
    ids.mbid ? `https://musicbrainz.org/artist/${ids.mbid}` : null,
    ids.wikidataId ? `https://www.wikidata.org/wiki/${ids.wikidataId}` : null,
    ids.youtubeChannelId ? `https://www.youtube.com/channel/${ids.youtubeChannelId}` : null,
  ].filter((u): u is string => Boolean(u));
}

/** schema.org MusicGroup for a band page. */
export function bandJsonLd(
  band: { slug: string; name: string; bio?: string | null; origin?: string | null; aka?: string | null },
  concerts: ConcertView[],
  extra: { image?: string | null; sameAs?: string[]; genres?: string[] } = {},
): Json {
  const url = abs(`/artists/${band.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    "@id": `${url}#band`,
    name: band.name,
    url,
    ...(band.aka ? { alternateName: band.aka } : {}),
    ...(band.bio ? { description: band.bio } : {}),
    ...(extra.image ? { image: abs(extra.image) } : {}),
    ...(extra.genres?.length ? { genre: extra.genres } : {}),
    ...(band.origin ? { foundingLocation: { "@type": "Place", name: band.origin } } : {}),
    ...(extra.sameAs?.length ? { sameAs: extra.sameAs } : {}),
    subjectOf: concerts.slice(0, 20).map((c) => ({
      "@type": "VideoObject",
      name: c.title,
      url: concertUrl(c.slug),
      thumbnailUrl: c.thumbnail.src,
      uploadDate: c.publishedAt.toISOString(),
    })),
  };
}

/** schema.org BreadcrumbList: [["Home", "/"], ["Bands", "/artists"], ["Metallica", "/artists/metallica"]]. */
export function breadcrumbs(items: [name: string, path: string][]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(path) })),
  };
}

/** schema.org ItemList of pages (concerts on a venue, genre, decade or tour page; bands on the index). At most 50 entries. */
export function itemList(name: string, items: { path: string; name?: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 50).map((it, i) => ({ "@type": "ListItem", position: i + 1, url: abs(it.path), ...(it.name ? { name: it.name } : {}) })),
  };
}

/** schema.org FAQPage. Only for questions that are visible on the page itself (src/lib/answers.ts). */
export function faqPage(questions: { question: string; answer: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({ "@type": "Question", name: q.question, acceptedAnswer: { "@type": "Answer", text: q.answer } })),
  };
}

/** schema.org WebSite with the site search (home page). */
export function website(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${abs("/")}#website`,
    name: SITE_NAME,
    // The ways people type the brand, so "stage dive" is read as this site.
    alternateName: SITE_ALTERNATE_NAMES,
    url: abs("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${abs("/concerts")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** schema.org Organization for the home page: the brand, its mark and (later) its social profiles. */
export function organization(sameAs: string[] = []): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${abs("/")}#organization`,
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAMES,
    url: abs("/"),
    logo: abs(SHARE_FALLBACK_IMAGE),
    description: "Full rock concerts, the whole show, played on our own pages: by band, festival, room, decade, genre and tour, with setlists.",
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/** JSON for a <script type="application/ld+json"> tag, safe against "</script>" in titles. */
export function jsonLd(data: Json | Json[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
