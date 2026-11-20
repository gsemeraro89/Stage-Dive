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
import { songPath, type Song } from "./songs";
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
export function concertEventJsonLd(
  c: ConcertView,
  setlist: SetlistView | null = null,
  /** The song page of a setlist title, when the band has one (src/lib/songs.ts songLinker). */
  songHref: (title: string) => string | null = () => null,
): Json | null {
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
    ...(works.length
      ? {
          workPerformed: works.map((name) => {
            const href = songHref(name);
            return { "@type": "MusicComposition", name, ...(href ? { url: abs(href) } : {}) };
          }),
        }
      : {}),
    recordedIn: { "@id": `${url}#video` },
  };
}

// ---- Festival and venue years (src/lib/venue-years.ts) ----

/** The day span of a set of concerts as schema.org dates, or the year alone when no day is known. */
function dateSpan(concerts: { performedOn: Date | null }[], year: number): { startDate: string; endDate?: string } {
  const days = concerts
    .map((c) => (c.performedOn ? new Date(c.performedOn).toISOString().slice(0, 10) : null))
    .filter((d): d is string => Boolean(d))
    .sort();
  // Every concert needs a day for a day span to be true; otherwise only the year is certain.
  if (!days.length || days.length < concerts.length) return { startDate: String(year) };
  return days[0] === days[days.length - 1] ? { startDate: days[0] } : { startDate: days[0], endDate: days[days.length - 1] };
}

/**
 * A festival year ("Pinkpop 1995"): a Festival event in the venue's series, held at the place, with
 * each concert as a MusicEvent sub-event (the same @id as on the concert page). For a room, which is
 * not one event, the place itself with its concerts as events. Only facts we hold.
 */
export function venueYearJsonLd(
  venue: { slug: string; name: string; city: string | null; country: string | null },
  name: string,
  year: number,
  path: string,
  concerts: ConcertView[],
  festival: boolean,
): Json {
  const url = abs(path);
  const address = [venue.city, venue.country].some(Boolean)
    ? { address: { "@type": "PostalAddress", ...(venue.city ? { addressLocality: venue.city } : {}), ...(venue.country ? { addressCountry: venue.country } : {}) } }
    : {};
  const place = { "@type": "Place", name: venue.name, url: abs(`/venues/${venue.slug}`), ...address };
  const events = concerts.map((c) => ({
    "@type": "MusicEvent",
    "@id": `${concertUrl(c.slug)}#event`,
    name: `${c.credits} live at ${venue.name} ${year}`,
    url: concertUrl(c.slug),
    startDate: playedDate(c) ?? String(year),
    location: { "@type": "Place", name: venue.name },
    performer: performers(c),
  }));
  if (!festival) {
    return { "@context": "https://schema.org", ...place, "@id": `${url}#place`, event: events };
  }
  const bands = [...new Map(concerts.flatMap((c) => performers(c)).map((p) => [p.name, p])).values()];
  return {
    "@context": "https://schema.org",
    "@type": "Festival",
    "@id": `${url}#event`,
    name,
    url,
    ...dateSpan(concerts, year),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: place,
    superEvent: { "@type": "EventSeries", name: venue.name, url: abs(`/venues/${venue.slug}`) },
    performer: bands,
    subEvent: events,
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

// ---- Songs played live (src/lib/songs.ts) ----

/**
 * A song page: the song (MusicComposition) and every live version we hold as an ItemList of
 * MusicRecordings by the band, each pointing at the concert video it is part of and at our page
 * starting at the song. No composer: a setlist does not tell us who wrote it.
 */
export function songJsonLd(band: { slug: string; name: string }, song: Song): Json[] {
  const url = abs(songPath(band.slug, song.slug));
  const group = { "@type": "MusicGroup", "@id": `${abs(`/artists/${band.slug}`)}#band`, name: band.name, url: abs(`/artists/${band.slug}`) };
  return [
    {
      "@context": "https://schema.org",
      "@type": "MusicComposition",
      "@id": `${url}#song`,
      name: song.title,
      url,
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${song.title} by ${band.name}: every live version`,
      numberOfItems: song.versions.length,
      itemListElement: song.versions.slice(0, 50).map((v, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "MusicRecording",
          name: `${song.title} (live${[v.concert.venue?.name ?? v.concert.city, v.concert.performedYear].some(Boolean) ? `, ${[v.concert.venue?.name ?? v.concert.city, v.concert.performedYear].filter(Boolean).join(" ")}` : ""})`,
          url: abs(v.href),
          byArtist: group,
          recordingOf: { "@id": `${url}#song` },
          ...(v.lengthSeconds !== null ? { duration: isoDuration(v.lengthSeconds) } : {}),
          ...(playedDate(v.concert) ? { dateCreated: playedDate(v.concert) } : {}),
          isPartOf: { "@type": "VideoObject", "@id": `${concertUrl(v.concert.slug)}#video`, url: concertUrl(v.concert.slug) },
        },
      })),
    },
  ];
}

/** A band's songs played live: an ItemList of the song pages, most played first. */
export function bandSongsJsonLd(band: { slug: string; name: string }, songs: { slug: string; title: string }[]): Json {
  return itemList(
    `${band.name}: songs played live`,
    songs.map((s) => ({ path: songPath(band.slug, s.slug), name: s.title })),
  );
}

/** schema.org BreadcrumbList: [["Home", "/"], ["Bands", "/artists"], ["Metallica", "/artists/metallica"]]. */
export function breadcrumbs(items: [name: string, path: string][]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(path) })),
  };
}

/**
 * schema.org ItemList of pages (concerts on a venue, genre, decade or tour page; bands on the index). At
 * most 50 entries. `ranked`: the order is a ranking, best first (the "best of" lists).
 */
export function itemList(name: string, items: { path: string; name?: string }[], ranked = false): Json {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    ...(ranked ? { itemListOrder: "https://schema.org/ItemListOrderDescending" } : {}),
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
