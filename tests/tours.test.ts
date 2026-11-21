// Tours from a video's text (src/lib/collector/tours.ts, owner 21 Nov 2026): the regex pass (positives and
// negatives), name normalisation and merge keys, Haiku's answer only when the text supports it, backfill options.
import { describe, expect, it } from "vitest";
import { tourBackfillArgs } from "../src/lib/collector/tour-backfill";
import { decideTour, distinctiveWords, extractTour, normalizeTourName, tourKey, tourSupportedByText } from "../src/lib/collector/tours";

const found = (title: string, band: string, description = "", performedYear: number | null = null) => {
  const r = extractTour({ title, band, description, performedYear });
  return r.kind === "found" ? r.name : r.kind;
};

describe("extractTour: positives", () => {
  it.each([
    ["Rush - Grace Under Pressure Tour: Live in Toronto, 1984 | Full Concert", "Rush", "Grace Under Pressure Tour"],
    ["Van Halen Live - 1984 Tour - Full Concert - Montreal (BEST QUALITY)", "Van Halen", "1984 Tour"],
    ["Metallica - Live Wherever We May Roam Tour 1992", "Metallica", "Wherever We May Roam Tour"],
    ["METALLICA - WHEREVER WE MAY ROAM TOUR - SAN DIEGO 1992", "Metallica", "Wherever We May Roam Tour"],
    ['Metallica: "Wherever We May Roam" tour, Live in San Diego', "Metallica", "Wherever We May Roam Tour"],
    ["Metallica - World Tour 1992 - Live in Paris", "Metallica", "World Tour 1992"],
    ["metallica live 1992 world tour full concert", "Metallica", "World Tour 1992"],
    ["Iron Maiden - Somewhere Back in Time World Tour 2008 (Live)", "Iron Maiden", "Somewhere Back in Time World Tour"],
    ["U2 360° Tour - Live at the Rose Bowl", "U2", "360° Tour"],
    ["The Rolling Stones - 50 & Counting Tour - Live at Hyde Park", "The Rolling Stones", "50 & Counting Tour"],
    ["Pink Floyd - The Wall Tour 1980 Earls Court", "Pink Floyd", "The Wall Tour"],
    ["Depeche Mode - Live in Berlin (Tour of the Universe)", "Depeche Mode", "Tour of the Universe"],
    ["AC/DC - Live at River Plate - Black Ice Tour 2009", "AC/DC", "Black Ice Tour"],
    ["Muse - Drones World Tour - Live at Rock in Rio", "Muse", "Drones World Tour"],
  ])("%s", (title, band, name) => expect(found(title, band)).toBe(name));

  it("a generic tour takes the year the concert was played", () => {
    expect(found("The Cure - European Tour (Live in Paris)", "The Cure", "", 1992)).toBe("European Tour 1992");
  });

  it("reads a description line that says the video was recorded on the tour", () => {
    expect(found("Queen - Live at Wembley 1986", "Queen", "Recorded during the Magic Tour, 12 July 1986 at Wembley Stadium.")).toBe("Magic Tour");
    expect(found("Live in Toronto", "Rush", "Tour: Power Windows Tour\nSetlist: ...")).toBe("Power Windows Tour");
  });
});

describe("extractTour: negatives", () => {
  it.each([
    ["Jimmy Eat World - Live at Warped Tour Long Beach, CA (2026)", "Jimmy Eat World"],
    ["Linkin Park - Live at Projekt Revolution Tour 2007", "Linkin Park"],
    ["Korn - Family Values Tour 1998 (Full Show)", "Korn"],
    ["Tour de France party with The Cure", "The Cure"],
    ["Foo Fighters on the tour bus - full documentary", "Foo Fighters"],
    ["Live at Tour & Taxis, Brussels", "Arno"],
    ["Radiohead live at Glastonbury 1997", "Radiohead"],
  ])("%s", (title, band) => expect(extractTour({ title, band }).kind).toBe("none"));

  it("a description that only sells or announces a tour says nothing about this concert", () => {
    expect(extractTour({ title: "Queen - Live at Wembley 1986", band: "Queen", description: "Get tickets for our 2027 World Tour at www.queen.com" }).kind).toBe("none");
    expect(extractTour({ title: "Metallica - Live in Moscow 1991", band: "Metallica", description: "Metallica M72 World Tour tickets on sale now" }).kind).toBe("none");
  });

  it("another band's tour, an unreadable name or a foreign word is a question for Haiku", () => {
    expect(extractTour({ title: "Ghost - Live supporting Metallica WorldWired Tour", band: "Ghost" }).kind).toBe("unsure");
    expect(extractTour({ title: "metallica wherever we may roam tour", band: "Metallica" }).kind).toBe("unsure");
    expect(extractTour({ title: "Indochine - Live à Bercy", band: "Indochine", description: "Enregistré pendant la tournée Paradize" }).kind).toBe("unsure");
    expect(extractTour({ title: "Iron Maiden - Somewhere Back in Time Tour and Final Frontier Tour", band: "Iron Maiden" }).kind).toBe("unsure");
  });

  it("a generic tour whose year is far from the concert is not trusted", () => {
    expect(extractTour({ title: "Metallica - World Tour 2023 - Live in Paris", band: "Metallica", performedYear: 1992 }).kind).toBe("unsure");
  });
});

describe("tour names", () => {
  it("normalises spelling: band, title words and the year of a named tour go, all-caps is fixed", () => {
    expect(normalizeTourName("Metallica Live Wherever We May Roam Tour 1992", "Metallica")).toBe("Wherever We May Roam Tour");
    expect(normalizeTourName("WORLDWIRED TOUR", "Metallica")).toBe("Worldwired Tour");
    expect(normalizeTourName("World Tour 1992", "Metallica")).toBe("World Tour 1992");
    expect(normalizeTourName("World Tour", "Metallica", 1996)).toBe("World Tour 1996");
    expect(normalizeTourName("World Tour", "Metallica")).toBeNull();
    expect(normalizeTourName("The Wall", "Pink Floyd")).toBe("The Wall Tour");
    expect(normalizeTourName("1984 Tour", "Van Halen")).toBe("1984 Tour");
  });

  it("merge keys: World, The, years and case do not count for a named tour; a generic tour is its year", () => {
    expect(tourKey("Wherever We May Roam World Tour")).toBe(tourKey("Wherever We May Roam Tour"));
    expect(tourKey("WHEREVER WE MAY ROAM TOUR 1991-1993")).toBe(tourKey("Wherever We May Roam Tour"));
    expect(tourKey("World Tour 1992")).toBe(tourKey("European Tour 1992"));
    expect(tourKey("World Tour 1992")).not.toBe(tourKey("World Tour 1996"));
    expect(tourKey("1984 Tour")).toBe(tourKey("Tour 1984"));
    expect(distinctiveWords("North American Summer Tour 2004")).toEqual([]);
  });
});

describe("Haiku's answer counts only when the text supports it", () => {
  const text = "Iron Maiden - Live in Rio\nFilmed on the Book of Souls World Tour, 2016.";
  it("accepts a name quoted from the text", () => {
    expect(tourSupportedByText("The Book of Souls World Tour", "Filmed on the Book of Souls World Tour", text)).toBe(true);
    const d = decideTour({ title: "Live", description: "Gira Paradise 2003, grabado en Madrid", band: "Héroes del Silencio" }, { tour: "Gira Paradise 2003", evidence: "Gira Paradise 2003", ownTour: true, confidence: 0.9 });
    expect(d).toEqual({ name: "Gira Paradise 2003", settled: true, how: "haiku" });
  });
  it("refuses a tour from memory, a package tour, another band's tour or a quote that is not in the text", () => {
    expect(tourSupportedByText("Wherever We May Roam Tour", "World Tour 1992", "Metallica live in Paris, World Tour 1992")).toBe(false);
    expect(tourSupportedByText("Book of Souls Tour", "made up words tour", text)).toBe(false);
    expect(tourSupportedByText("Warped Tour", "Warped Tour", "Live at Warped Tour 2005")).toBe(false);
    const d = decideTour({ title: "Ghost - Live supporting Metallica WorldWired Tour", band: "Ghost" }, { tour: "WorldWired Tour", evidence: "Metallica WorldWired Tour", ownTour: false, confidence: 0.9 });
    expect(d).toEqual({ name: null, settled: true, how: "none" });
  });
  it("unsure with no answer stays unsettled (the backfill asks later)", () => {
    expect(decideTour({ title: "metallica wherever we may roam tour", band: "Metallica" })).toEqual({ name: null, settled: false, how: "unsure" });
  });
  it("a lane hint without quoted words needs the name's own words in the text", () => {
    expect(decideTour({ title: "metallica wherever we may roam tour", band: "Metallica" }, { tour: "Wherever We May Roam Tour" }).name).toBe("Wherever We May Roam Tour");
    expect(decideTour({ title: "metallica wherever we may roam tour", band: "Metallica" }, { tour: "Damaged Justice Tour" }).name).toBeNull();
  });
});

describe("backfill-tours options", () => {
  it("reads the admin_ops forms", () => {
    expect(tourBackfillArgs("backfill-tours")).toEqual({});
    expect(tourBackfillArgs("backfill-tours:500")).toEqual({ limit: 500 });
    expect(tourBackfillArgs("backfill-tours:limit=200,wait=10,no-batch")).toEqual({ limit: 200, waitMinutes: 10, noBatch: true });
    expect(() => tourBackfillArgs("backfill-tours:foo=1")).toThrow();
  });
});
