// Festival and venue years ("Pinkpop 1995"): links, strong-page rule (shared with the sitemap), titles,
// answers, structured data, Markdown copies, llms-full.txt and the copy rules.
import { afterEach, describe, expect, it } from "vitest";
import { daySpan, venueYearAnswers } from "../src/lib/answers";
import { concertMarkdown, llmsFullTxt, llmsTxt, venueYearMarkdown } from "../src/lib/llms";
import { robotsFor, venueYearIsStrong, venueYearName, venueYearSearchTitle } from "../src/lib/seo";
import { buildSitemap, type SitemapConcert } from "../src/lib/sitemap";
import { venueYearJsonLd } from "../src/lib/structured-data";
import { isFestival, parseYear, strongYearsInDecade, venueYearLinks, venueYearPath, yearCounts } from "../src/lib/venue-years";
import { BANNED, concertView, setlist, youtubeOnlyWithViews } from "./fixtures/concert-view";

process.env.SITE_URL = "https://stagedive.example";
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

const pinkpop = { slug: "pinkpop", name: "Pinkpop", city: "Landgraaf", country: "Netherlands" };
const festival = { slug: "festival", name: "Festival" };
const gig = (id: number, band: string, over: Parameters<typeof concertView>[0] = {}) =>
  concertView({
    id,
    slug: `${band.toLowerCase().replace(/ /g, "-")}-pinkpop-1995`,
    title: `${band} live at Pinkpop 1995`,
    credits: band,
    artists: [{ slug: band.toLowerCase(), name: band, role: "MAIN", creditNote: null, hasPage: true }],
    venue: { slug: "pinkpop", name: "Pinkpop" },
    city: "Landgraaf",
    country: "Netherlands",
    venueKind: festival,
    tour: null,
    performedYear: 1995,
    performedOn: null,
    viewCount: id * 1000,
    ...over,
  });
const two = [gig(1, "Bush", { performedOn: new Date("1995-06-03T00:00:00Z") }), gig(2, "Pearl Jam", { performedOn: new Date("1995-06-05T00:00:00Z") })];

describe("festival and venue years: links", () => {
  it("builds the address and reads only plain years", () => {
    expect(venueYearPath("pinkpop", 1995)).toBe("/venues/pinkpop/1995");
    expect(parseYear("1995")).toBe(1995);
    expect(parseYear("95")).toBeNull();
    expect(parseYear("1995.md")).toBeNull();
    expect(parseYear("1800")).toBeNull();
  });
  it("counts concerts per year, newest first", () => {
    expect(yearCounts([{ performedYear: 1995 }, { performedYear: 2001 }, { performedYear: 1995 }, { performedYear: null }])).toEqual([
      { year: 2001, count: 1 },
      { year: 1995, count: 2 },
    ]);
  });
  it("links a strong year to its page and a one-concert year straight to the concert", () => {
    const links = venueYearLinks("pinkpop", [
      { slug: "a", performedYear: 1995 },
      { slug: "b", performedYear: 1995 },
      { slug: "c", performedYear: 2001 },
    ]);
    expect(links).toEqual([
      { year: 2001, count: 1, href: "/concerts/c", page: false },
      { year: 1995, count: 2, href: "/venues/pinkpop/1995", page: true },
    ]);
  });
  it("shows no year list when no year has a page of its own", () => {
    expect(venueYearLinks("cbgb", [{ slug: "a", performedYear: 1977 }, { slug: "b", performedYear: 1978 }])).toEqual([]);
  });
  it("gives a decade its strong place-years, oldest first", () => {
    const all = [
      { slug: "pinkpop", name: "Pinkpop", year: 1996, count: 4 },
      { slug: "pinkpop", name: "Pinkpop", year: 1995, count: 2 },
      { slug: "pinkpop", name: "Pinkpop", year: 1999, count: 1 },
      { slug: "pinkpop", name: "Pinkpop", year: 2001, count: 3 },
    ];
    expect(strongYearsInDecade(all, 1990).map((v) => v.year)).toEqual([1995, 1996]);
  });
  it("tells a festival from a room", () => {
    expect(isFestival(two)).toBe(true);
    expect(isFestival([gig(3, "Blur", { venueKind: { slug: "room", name: "Room" } })])).toBe(false);
  });
});

describe("festival and venue years: indexing", () => {
  it("is strong from two concerts that year, and follows robotsFor on the live site only", () => {
    expect(venueYearIsStrong(2)).toBe(true);
    expect(venueYearIsStrong(1)).toBe(false);
    process.env.SITE_INDEXABLE = "true";
    expect(robotsFor(venueYearIsStrong(1))).toEqual({ index: false, follow: true });
    expect(robotsFor(venueYearIsStrong(2))).toBeUndefined();
  });
  it("writes the title the way people search", () => {
    expect(venueYearSearchTitle("Pinkpop", 1995, true)).toBe("Pinkpop 1995 · Full Concerts and Setlists");
    expect(venueYearSearchTitle("Brixton Academy", 1995, false)).toBe("Brixton Academy 1995 · Full Concerts");
    expect(venueYearName("Woodstock 1969", 1969)).toBe("Woodstock 1969");
  });
  it("lists only strong place-years in the sitemap", () => {
    const c = (slug: string, venueSlug: string | null, performedYear: number | null): SitemapConcert => ({
      slug,
      updatedAt: new Date("2026-11-01T00:00:00Z"),
      hasSetlist: true,
      curated: false,
      writeUp: null,
      performedYear,
      venueSlug,
      venueKindSlug: "festival",
      tourSlug: null,
      artistSlugs: [],
      genreSlugs: [],
    });
    const paths = buildSitemap([c("a", "pinkpop", 1995), c("b", "pinkpop", 1995), c("c", "pinkpop", 2001), c("d", null, 1995)], []).map((e) => e.path);
    expect(paths).toContain("/venues/pinkpop/1995");
    expect(paths).not.toContain("/venues/pinkpop/2001");
  });
});

describe("festival and venue years: answers and structured data", () => {
  it("leads with the count, the place and the bands, from data only", () => {
    const a = venueYearAnswers(pinkpop, "Pinkpop 1995", 1995, two, true);
    expect(a.lead).toBe("2 full concerts from Pinkpop 1995 (Landgraaf, Netherlands): Bush and Pearl Jam. Every concert plays in full on its own page.");
    expect(a.questions.map((q) => q.question)).toEqual([
      "Who played Pinkpop 1995?",
      "When was Pinkpop 1995?",
      "Where was Pinkpop 1995?",
      "What is the most watched concert from Pinkpop 1995?",
      "How many full concerts from Pinkpop 1995 are there?",
    ]);
    expect(a.questions[1].answer).toBe("The concerts here were played from 3 to 5 June 1995.");
    expect(a.questions[3].answer).toBe("Pearl Jam, with 2,000 views on YouTube.");
  });
  it("says 'recorded at' for a room and leaves out what it does not know", () => {
    const room = [gig(1, "Blur", { venueKind: { slug: "room", name: "Room" } })];
    const a = venueYearAnswers({ name: "Brixton Academy", city: null, country: null }, "Brixton Academy 1995", 1995, room, false);
    expect(a.lead).toBe("1 full concert recorded at Brixton Academy in 1995: Blur. Every concert plays in full on its own page.");
    expect(a.questions.some((q) => q.question.startsWith("Where"))).toBe(false);
    expect(a.questions.some((q) => q.question.startsWith("When"))).toBe(false);
  });
  it("spans days only when they are known", () => {
    expect(daySpan([{ performedOn: null }])).toBeNull();
    expect(daySpan([{ performedOn: new Date("1995-06-03T00:00:00Z") }])).toBe("3 June 1995");
    expect(daySpan([{ performedOn: new Date("1995-05-31T00:00:00Z") }, { performedOn: new Date("1995-06-02T00:00:00Z") }])).toBe("31 May to 2 June 1995");
  });
  it("marks a festival year as a Festival with each concert as a sub-event", () => {
    const ld = venueYearJsonLd(pinkpop, "Pinkpop 1995", 1995, "/venues/pinkpop/1995", two, true) as Record<string, unknown>;
    expect(ld["@type"]).toBe("Festival");
    expect(ld.name).toBe("Pinkpop 1995");
    expect(ld.startDate).toBe("1995-06-03");
    expect(ld.endDate).toBe("1995-06-05");
    expect((ld.superEvent as Record<string, unknown>)["@type"]).toBe("EventSeries");
    const sub = ld.subEvent as Record<string, unknown>[];
    expect(sub).toHaveLength(2);
    expect(sub[0]["@id"]).toBe("https://stagedive.example/concerts/bush-pinkpop-1995#event");
  });
  it("keeps only the year when a day is missing, and describes a room as a place with events", () => {
    const partial = [two[0], gig(3, "Blur")];
    expect((venueYearJsonLd(pinkpop, "Pinkpop 1995", 1995, "/venues/pinkpop/1995", partial, true) as Record<string, unknown>).startDate).toBe("1995");
    const room = venueYearJsonLd(pinkpop, "Pinkpop 1995", 1995, "/venues/pinkpop/1995", two, false) as Record<string, unknown>;
    expect(room["@type"]).toBe("Place");
    expect((room.event as unknown[]).length).toBe(2);
  });
});

describe("festival and venue years: AI assistants", () => {
  it("gives a Markdown copy with concerts, other years and questions", () => {
    const md = venueYearMarkdown(pinkpop, 1995, two, true, [
      { year: 1996, count: 4 },
      { year: 1995, count: 2 },
      { year: 2001, count: 1 },
    ]);
    expect(md.startsWith("# Pinkpop 1995: full concerts\n\n2 full concerts from Pinkpop 1995")).toBe(true);
    expect(md).toContain("- **Place:** [Pinkpop](https://stagedive.example/venues/pinkpop), Landgraaf, Netherlands");
    expect(md).toContain("## Other years at Pinkpop\n\n- [Pinkpop 1996](https://stagedive.example/venues/pinkpop/1996): 4 full concerts");
    expect(md).not.toContain("Pinkpop 2001");
    expect(md).toContain("### Who played Pinkpop 1995?");
    expect(md).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(md)).toBe(true);
  });
  it("adds 'More from' to a concert's Markdown copy", () => {
    const md = concertMarkdown(two[0], setlist, [], {}, { name: "Pinkpop 1995", path: "/venues/pinkpop/1995", count: 2, others: [two[1]] });
    expect(md).toContain("## More from Pinkpop 1995\n\n- [Pearl Jam](https://stagedive.example/concerts/pearl-jam-pinkpop-1995)");
    expect(md).toContain("Every concert from Pinkpop 1995 (2): https://stagedive.example/venues/pinkpop/1995");
  });
  it("lists strong place-years in llms-full.txt and explains them in llms.txt", () => {
    const data = {
      bands: [],
      venues: [],
      genres: [],
      decades: [],
      tours: [],
      venueYears: [
        { slug: "pinkpop", name: "Pinkpop", year: 1995, count: 2 },
        { slug: "pinkpop", name: "Pinkpop", year: 2001, count: 1 },
      ],
    };
    const full = llmsFullTxt({ ...data, mostWatched: [], latest: [] });
    expect(full).toContain("## Festival and venue years (1)\n\n- [Pinkpop 1995](https://stagedive.example/venues/pinkpop/1995): 2 full concerts");
    expect(full).not.toContain("Pinkpop 2001");
    expect(llmsTxt(data)).toContain("`/venues/<place>/<year>`");
  });
});
