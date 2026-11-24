// Structured data (schema.org) for search engines and AI assistants.
import { describe, expect, it } from "vitest";
import {
  bandJsonLd,
  bandSameAs,
  breadcrumbs,
  concertEventJsonLd,
  concertJsonLd,
  faqPage,
  homeBandsList,
  homePlacesList,
  homeRankingLists,
  isoDuration,
  itemList,
  jsonLd,
  organization,
  playedDate,
  songClips,
  website,
} from "../src/lib/structured-data";
import { BANNED, concertView, setlist } from "./fixtures/concert-view";

process.env.SITE_URL = "https://stagedive.example";
const concert = concertView();
const page = "https://stagedive.example/concerts/metallica-l-c-walker-arena-1991";

describe("structured data", () => {
  it("writes ISO durations and played dates", () => {
    expect(isoDuration(8520)).toBe("PT2H22M");
    expect(isoDuration(2700)).toBe("PT45M");
    expect(isoDuration(3661)).toBe("PT1H1M1S");
    expect(isoDuration(0)).toBe("PT0S");
    expect(playedDate(concert)).toBe("1991-11-01");
    expect(playedDate({ performedOn: null, performedYear: 1991 })).toBe("1991");
    expect(playedDate({ performedOn: null, performedYear: null })).toBeNull();
  });

  it("describes a concert as a VideoObject linked to the night it records", () => {
    const ld = concertJsonLd(concert, setlist as never);
    expect(ld).toMatchObject({
      "@type": "VideoObject",
      "@id": `${page}#video`,
      name: "Metallica — L.C. Walker Arena 1991",
      duration: "PT2H22M",
      embedUrl: "https://www.youtube.com/embed/IA9xKr_Dmek",
      uploadDate: "2021-05-03T00:00:00.000Z",
      genre: ["metal"],
      recordedAt: { "@id": `${page}#event` },
      interactionStatistic: { userInteractionCount: 2_400_000 },
    });
    expect(ld.description).toMatch(/^Metallica · full concert · 1 November 1991 · L\.C\. Walker Arena/);
    expect(String(ld.description)).not.toMatch(BANNED);
  });

  it("gives key moments: a Clip per timed song linking to our page at that second, and a SeekToAction", () => {
    const ld = concertJsonLd(concert, setlist as never);
    expect(ld.hasPart).toEqual([
      { "@type": "Clip", name: "Enter Sandman", startOffset: 0, endOffset: 315, url: `${page}?t=0` },
      // ends where the next timed line starts, even an unidentified one (which gets no clip itself)
      { "@type": "Clip", name: "Creeping Death", startOffset: 315, endOffset: 700, url: `${page}?t=315` },
      { "@type": "Clip", name: "Last Caress", startOffset: 1300, endOffset: 1500, url: `${page}?t=1300` },
      { "@type": "Clip", name: "Seek & Destroy", startOffset: 1500, endOffset: 8520, url: `${page}?t=1500` },
    ]);
    expect(ld.potentialAction).toEqual({
      "@type": "SeekToAction",
      target: `${page}?t={seek_to_second_number}`,
      "startOffset-input": "required name=seek_to_second_number",
    });
  });

  it("gives no key moments without song times", () => {
    const untimed = { source: "COMMENT", tracks: setlist.tracks.map((t) => ({ ...t, time: null })) };
    for (const s of [null, untimed]) {
      const ld = concertJsonLd(concert, s as never);
      expect(ld).not.toHaveProperty("hasPart");
      expect(ld).not.toHaveProperty("potentialAction");
    }
    // A time past the end of the video is ignored.
    expect(songClips({ slug: "x", durationSeconds: 100 }, { source: null, tracks: [{ time: 0, artist: null, title: "A", unidentified: false, artistSlug: null }, { time: 500, artist: null, title: "B", unidentified: false, artistSlug: null }] })).toEqual([
      { "@type": "Clip", name: "A", startOffset: 0, endOffset: 100, url: "https://stagedive.example/concerts/x?t=0" },
    ]);
  });

  it("describes the night as a MusicEvent: performer, place, date, tour and the band's own songs", () => {
    const ev = concertEventJsonLd(concert, setlist as never)!;
    expect(ev).toMatchObject({
      "@type": "MusicEvent",
      "@id": `${page}#event`,
      name: "Metallica live at L.C. Walker Arena 1991",
      startDate: "1991-11-01",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: { "@type": "Place", name: "L.C. Walker Arena", address: { addressLocality: "Muskegon", addressCountry: "US" } },
      performer: [{ "@type": "MusicGroup", name: "Metallica", url: "https://stagedive.example/artists/metallica" }],
      superEvent: { "@type": "EventSeries", name: "Wherever We May Roam Tour" },
      recordedIn: { "@id": `${page}#video` },
    });
    expect((ev.workPerformed as { name: string }[]).map((w) => w.name)).toEqual(["Enter Sandman", "Creeping Death", "Seek & Destroy"]);
    expect(ev).not.toHaveProperty("eventStatus");
  });

  it("gives no MusicEvent without a date or a place", () => {
    expect(concertEventJsonLd(concertView({ performedYear: null, performedOn: null }))).toBeNull();
    expect(concertEventJsonLd(concertView({ venue: null, city: null }))).toBeNull();
    expect(concertJsonLd(concertView({ venue: null, city: null }))).not.toHaveProperty("recordedAt");
  });

  it("describes a band as a MusicGroup with its links elsewhere and its concerts", () => {
    const sameAs = bandSameAs({ mbid: "65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab", wikidataId: "Q15920", youtubeChannelId: null });
    expect(sameAs).toEqual(["https://musicbrainz.org/artist/65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab", "https://www.wikidata.org/wiki/Q15920"]);
    const ld = bandJsonLd({ slug: "metallica", name: "Metallica", origin: "Los Angeles, US" }, [concert], { sameAs, genres: ["metal"], image: "/photos/bands/metallica?v=1" });
    expect(ld).toMatchObject({
      "@type": "MusicGroup",
      name: "Metallica",
      foundingLocation: { name: "Los Angeles, US" },
      sameAs,
      genre: ["metal"],
      image: "https://stagedive.example/photos/bands/metallica?v=1",
    });
    expect((ld.subjectOf as unknown[]).length).toBe(1);
    expect(bandJsonLd({ slug: "x", name: "X" }, [])).not.toHaveProperty("sameAs");
  });

  it("builds breadcrumbs, lists, FAQ, the site and the brand", () => {
    expect(breadcrumbs([["Home", "/"], ["Bands", "/artists"]]).itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://stagedive.example/" },
      { "@type": "ListItem", position: 2, name: "Bands", item: "https://stagedive.example/artists" },
    ]);
    const list = itemList("Bands", Array.from({ length: 60 }, (_, i) => ({ path: `/artists/${i}` })));
    expect(list.numberOfItems).toBe(60);
    expect((list.itemListElement as unknown[]).length).toBe(50);
    expect(faqPage([{ question: "Q?", answer: "A." }]).mainEntity).toEqual([{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } }]);
    expect(website()).toMatchObject({ alternateName: expect.arrayContaining(["Stage Dive", "Stagedive", "STAGEDIVE"]) });
    expect(website().potentialAction).toMatchObject({ target: { urlTemplate: "https://stagedive.example/concerts?q={search_term_string}" } });
    expect(String(organization().description)).not.toMatch(BANNED);
  });

  it("cannot be broken out of its script tag", () => {
    const out = jsonLd({ name: "</script><b>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ name: "</script><b>" });
  });
});

describe("homepage lists", () => {
  it("lists the bands and places shown, ranked, and nothing for an empty section", () => {
    const bands = homeBandsList([
      { href: "/artists/metallica", name: "Metallica" },
      { href: "/artists/pixies", name: "Pixies" },
    ]) as { itemListOrder: string; numberOfItems: number; itemListElement: { position: number; url: string; name: string }[] };
    expect(bands.itemListOrder).toBe("https://schema.org/ItemListOrderDescending");
    expect(bands.numberOfItems).toBe(2);
    expect(bands.itemListElement[1]).toMatchObject({ position: 2, url: "https://stagedive.example/artists/pixies", name: "Pixies" });
    expect(homePlacesList([{ href: "/venues/pinkpop", name: "Pinkpop" }])).toMatchObject({ "@type": "ItemList", name: "Festivals and venues with the most full concerts" });
    expect(homeBandsList([])).toBeNull();
    expect(homePlacesList([])).toBeNull();
  });
  it("lists each ranking's top concerts under the ranking's name", () => {
    const [list] = homeRankingLists([
      { heading: "Most Watched Rock Concerts", concerts: [concertView()] },
      { heading: "Empty", concerts: [] },
    ]) as { name: string; itemListElement: { url: string; name: string }[] }[];
    expect(list.name).toBe("Most Watched Rock Concerts");
    expect(list.itemListElement[0]).toMatchObject({
      url: "https://stagedive.example/concerts/metallica-l-c-walker-arena-1991",
      name: "Metallica at L.C. Walker Arena 1991",
    });
    expect(homeRankingLists([{ heading: "Empty", concerts: [] }])).toEqual([]);
  });
});
