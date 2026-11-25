// Full concerts in HD (src/lib/hd.ts): YouTube's definition read from videos.list, the page's lead and
// questions, the backfill run by the refresh, and the sitemap / llms / Markdown entries (from ten).
import { describe, expect, it } from "vitest";
import { toVideo } from "../src/lib/collector/youtube";
import { backfillDefinitions, HD_PATH, HD_TITLE, hdIsStrong, hdLead, hdQuestions } from "../src/lib/hd";
import { hdMarkdown, llmsFullTxt, llmsTxt } from "../src/lib/llms";
import { buildSitemap, type SitemapConcert } from "../src/lib/sitemap";
import { BANNED, concertView, youtubeOnlyWithViews } from "./fixtures/concert-view";

process.env.SITE_URL = "https://stagedive.example";

describe("reading the definition", () => {
  it("keeps contentDetails.definition from videos.list, and nothing when YouTube gives none", () => {
    const item = { id: "x", snippet: {}, statistics: {}, status: {} };
    expect(toVideo({ ...item, contentDetails: { duration: "PT1H", definition: "hd" } })!.definition).toBe("hd");
    expect(toVideo({ ...item, contentDetails: { duration: "PT1H", definition: "sd" } })!.definition).toBe("sd");
    expect("definition" in toVideo({ ...item, contentDetails: {} })!).toBe(false);
  });
});

const ranked = [
  concertView({ id: 1, viewCount: 9_000_000 }),
  concertView({ id: 2, slug: "metallica-pinkpop-1993", venue: { slug: "pinkpop", name: "Pinkpop" }, performedYear: 1993, viewCount: 3_000_000 }),
  concertView({ id: 3, slug: "pixies-2004", credits: "Pixies", artists: [{ slug: "pixies", name: "Pixies", role: "MAIN", creditNote: null, hasPage: true }], venue: null, city: null, performedYear: 2004, viewCount: 12_000 }),
];

describe("the HD page's words", () => {
  it("leads with how many, what HD means, and the range of views", () => {
    expect(HD_TITLE).toBe("Full Concerts in HD · Pro-Shot Rock Concerts in 1080p and 720p");
    expect(hdLead(3, ranked)).toBe(
      "3 full rock concerts in HD on STAGEDIVE: official, pro-shot concerts in high definition (720p, 1080p or better), ranked by views on YouTube, " +
        "from Metallica at L.C. Walker Arena 1991 (9,000,000 views on YouTube) to Pixies in 2004 (12,000 views on YouTube). Every concert plays in full on its own page, updated every night.",
    );
    expect(hdLead(250, ranked)).toContain("The 3 most watched are listed here.");
    expect(hdLead(0, [])).toBe("No full rock concert in HD is on STAGEDIVE right now.");
  });
  it("asks only what the list answers", () => {
    expect(hdQuestions(3, ranked)).toEqual([
      { question: "Where can I watch full rock concerts in HD?", answer: "On STAGEDIVE: 3 official full concerts in high definition, each played in full on its own page." },
      { question: "What is the most watched full concert in HD here?", answer: "Metallica at L.C. Walker Arena 1991, with 9,000,000 views on YouTube." },
      { question: "Which bands have the most full concerts in HD here?", answer: "Metallica (2)." },
    ]);
    expect(hdQuestions(0, [])).toEqual([]);
  });
  it("is worth indexing from ten concerts", () => {
    expect(hdIsStrong(9)).toBe(false);
    expect(hdIsStrong(10)).toBe(true);
  });
  it("writes the Markdown copy by the copy rules", () => {
    const md = hdMarkdown(3, ranked);
    expect(md.startsWith("# Full Concerts in HD\n\n3 full rock concerts in HD")).toBe(true);
    expect(md).toContain("1. [Metallica at L.C. Walker Arena 1991](https://stagedive.example/concerts/metallica-l-c-walker-arena-1991): 9,000,000 views on YouTube, 2:22:00, setlist");
    expect(md).toContain("### Which bands have the most full concerts in HD here?");
    expect(md).toContain("Source: STAGEDIVE, https://stagedive.example/hd");
    expect(md).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(md)).toBe(true);
  });
});

describe("filling in the definition", () => {
  it("asks YouTube only about concerts without one, not removed, not just refreshed, and stores what it gets", async () => {
    const updates: { id: number; definition: string }[] = [];
    let where: unknown;
    const db = {
      concert: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [
            { id: 1, youtubeId: "a" },
            { id: 2, youtubeId: "b" },
            { id: 3, youtubeId: "c" },
            { id: 4, youtubeId: "gone" },
          ];
        },
        update: async ({ where, data }: { where: { id: number }; data: { definition: string } }) => updates.push({ id: where.id, definition: data.definition }),
      },
    } as unknown as Parameters<typeof backfillDefinitions>[0];
    const asked: string[][] = [];
    const filled = await backfillDefinitions(
      db,
      async (ids) => {
        asked.push(ids);
        return new Map([
          ["a", { definition: "hd" }],
          ["c", { definition: "sd" }],
        ]);
      },
      new Set([2]),
    );
    expect(where).toEqual({ definition: null, status: { not: "REMOVED" } });
    expect(asked).toEqual([["a", "c", "gone"]]);
    expect(updates).toEqual([
      { id: 1, definition: "hd" },
      { id: 3, definition: "sd" },
    ]);
    expect(filled).toBe(2);
  });
  it("does not call YouTube when nothing is missing", async () => {
    const db = { concert: { findMany: async () => [] } } as unknown as Parameters<typeof backfillDefinitions>[0];
    expect(await backfillDefinitions(db, async () => { throw new Error("should not ask"); })).toBe(0);
  });
});

describe("sitemap and llms files", () => {
  const sc = (i: number, over: Partial<SitemapConcert> = {}): SitemapConcert => ({
    slug: `c${i}`,
    updatedAt: new Date(Date.UTC(2026, 10, i + 1)),
    hasSetlist: false,
    curated: false,
    writeUp: null,
    performedYear: 1990,
    venueSlug: null,
    tourSlug: null,
    artistSlugs: [],
    genreSlugs: [],
    hd: true,
    ...over,
  });
  it("lists /hd from ten official HD concerts, dated by the newest change; bootlegs and SD do not count", () => {
    const nine = [...Array.from({ length: 9 }, (_, i) => sc(i)), sc(20, { bootleg: true }), sc(21, { hd: false })];
    expect(buildSitemap(nine, []).some((e) => e.path === HD_PATH)).toBe(false);
    const ten = [...nine, sc(9)];
    const entry = buildSitemap(ten, []).find((e) => e.path === HD_PATH);
    expect(entry).toEqual({ path: "/hd", lastModified: new Date(Date.UTC(2026, 10, 10)), priority: 0.6, changeFrequency: "daily" });
  });
  it("names the HD page in llms.txt and llms-full.txt from ten", () => {
    const data = { bands: [], venues: [], genres: [], decades: [], tours: [] };
    expect(llmsTxt({ ...data, hd: 12 })).toContain("- [Full concerts in HD](https://stagedive.example/hd): the 12 official concerts in high definition, most watched first");
    expect(llmsTxt({ ...data, hd: 9 })).not.toContain("/hd)");
    expect(llmsFullTxt({ ...data, hd: 12, mostWatched: [], latest: [] })).toContain("## Full concerts in HD\n\n- [Full Concerts in HD](https://stagedive.example/hd): 12 full concerts in high definition, most watched first");
  });
});
