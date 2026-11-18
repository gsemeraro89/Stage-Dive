// Structured data (VideoObject / MusicGroup) for search engines.
import { describe, expect, it } from "vitest";
import type { ConcertView } from "../src/lib/queries";
import { bandJsonLd, concertJsonLd, isoDuration, jsonLd } from "../src/lib/structured-data";

const concert = {
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
  tour: null,
  durationSeconds: 8520,
  viewCount: 2_400_000,
  publishedAt: new Date("2021-05-03T00:00:00Z"),
  channel: { name: "Metallica", isOfficial: true },
  writeUp: null,
  thumbnail: { src: "https://i.ytimg.com/vi/IA9xKr_Dmek/hqdefault.jpg", srcSet: "", width: 480, height: 360 },
} as ConcertView;

describe("structured data", () => {
  it("writes ISO durations", () => {
    expect(isoDuration(8520)).toBe("PT2H22M");
    expect(isoDuration(2700)).toBe("PT45M");
    expect(isoDuration(3661)).toBe("PT1H1M1S");
    expect(isoDuration(0)).toBe("PT0S");
  });
  it("describes a concert as a VideoObject, with its songs as clips", () => {
    const ld = concertJsonLd(concert, {
      source: "COMMENT",
      tracks: [
        { time: 0, artist: null, title: "Enter Sandman", unidentified: false },
        { time: 315, artist: null, title: "Creeping Death", unidentified: false },
      ],
    } as never);
    expect(ld).toMatchObject({
      "@type": "VideoObject",
      name: "Metallica — L.C. Walker Arena 1991",
      description: "Metallica live at L.C. Walker Arena, Muskegon, 1991. The full concert, free to watch.",
      duration: "PT2H22M",
      embedUrl: "https://www.youtube.com/embed/IA9xKr_Dmek",
      uploadDate: "2021-05-03T00:00:00.000Z",
      genre: ["metal"],
    });
    expect(ld.hasPart).toEqual([
      { "@type": "Clip", name: "Enter Sandman", startOffset: 0, endOffset: 315, url: "https://www.youtube.com/watch?v=IA9xKr_Dmek&t=0s" },
      { "@type": "Clip", name: "Creeping Death", startOffset: 315, endOffset: 8520, url: "https://www.youtube.com/watch?v=IA9xKr_Dmek&t=315s" },
    ]);
    expect(concertJsonLd(concert)).not.toHaveProperty("hasPart");
  });
  it("describes a band as a MusicGroup with its concerts", () => {
    const ld = bandJsonLd({ slug: "metallica", name: "Metallica", origin: "Los Angeles, US" }, [concert]);
    expect(ld).toMatchObject({ "@type": "MusicGroup", name: "Metallica", foundingLocation: { name: "Los Angeles, US" } });
    expect((ld.subjectOf as unknown[]).length).toBe(1);
  });
  it("cannot be broken out of its script tag", () => {
    const out = jsonLd({ name: "</script><b>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ name: "</script><b>" });
  });
});
