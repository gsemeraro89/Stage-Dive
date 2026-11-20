// Keyword research (src/lib/keywords.ts): seeds from the catalogue, intent, strict page matching,
// noise, gaps, scoring and the report, on recorded Google and Bing answers.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  askEngines,
  BAND_MODIFIERS,
  buildIndex,
  buildSeeds,
  cleanPhrase,
  decadeIn,
  estimateMinutes,
  fetchSuggestions,
  findNamed,
  GAPS,
  gapSummary,
  HEAD_TERMS,
  headTargetCheck,
  intentOf,
  isAmbiguous,
  isNoise,
  logTail,
  matchPage,
  NameIndex,
  nameVariants,
  placeShortName,
  parseSuggestions,
  rankKeywords,
  reportMarkdown,
  scoreOf,
  stripNames,
  type KwCatalogue,
  type Seed,
  type SuggestResult,
} from "../src/lib/keywords";
import { GENRES } from "../src/lib/catalogue";
import { BANNED } from "./fixtures/concert-view";

const cat: KwCatalogue = {
  bands: [
    { name: "Metallica", slug: "metallica", concerts: 3, years: [1991, 1993, 2008], festivals: ["Pinkpop"], venues: ["Tushino Airfield"], hasSongs: true },
    { name: "The Cure", slug: "the-cure", concerts: 1, years: [1986], festivals: [], venues: ["Théâtre Antique d'Orange"] },
    { name: "Muse", slug: "muse", concerts: 1, years: [2007], festivals: ["Glastonbury"], venues: [] },
    { name: "AC/DC", slug: "ac-dc", concerts: 1, years: [1991], festivals: [], venues: ["Tushino Airfield"] },
    { name: "Grateful Dead", slug: "grateful-dead", concerts: 1, years: [1972], festivals: [], venues: [] },
  ],
  venues: [
    { name: "Pinkpop", slug: "pinkpop", concerts: 3, festival: true },
    { name: "Glastonbury", slug: "glastonbury", concerts: 1, festival: true },
    { name: "Tushino Airfield", slug: "tushino-airfield", concerts: 2, festival: false },
  ],
  venueYears: [
    { slug: "pinkpop", name: "Pinkpop", year: 1993, count: 2 },
    { slug: "pinkpop", name: "Pinkpop", year: 2008, count: 1 },
    { slug: "glastonbury", name: "Glastonbury", year: 2007, count: 1 },
  ],
  genres: [
    { name: "metal", slug: "metal", count: 3 },
    { name: "trip hop", slug: "trip-hop", count: 2 },
    { name: "new wave / synth", slug: "new-wave-synth", count: 1 },
    { name: "shoegaze", slug: "shoegaze", count: 0 },
  ],
  decades: [
    { label: "1980s", count: 1 },
    { label: "1990s", count: 3 },
  ],
  tours: [{ name: "Wherever We May Roam Tour", slug: "wherever-we-may-roam", band: "Metallica", bandSlug: "metallica", count: 2 }],
  songs: [
    { title: "Enter Sandman", slug: "enter-sandman", band: "Metallica", bandSlug: "metallica", versions: 3 },
    { title: "One", slug: "one", band: "Metallica", bandSlug: "metallica", versions: 2 },
  ],
  concerts: [
    { slug: "metallica-pinkpop-1993", bands: ["metallica"], venueSlug: "pinkpop", year: 1993, hasSetlist: true },
    { slug: "metallica-moscow-1991", bands: ["metallica"], venueSlug: "tushino-airfield", year: 1991, hasSetlist: false },
    { slug: "metallica-pinkpop-2008", bands: ["metallica"], venueSlug: "pinkpop", year: 2008, hasSetlist: true },
    { slug: "the-cure-orange-1986", bands: ["the-cure"], venueSlug: null, year: 1986, hasSetlist: true },
    { slug: "muse-glastonbury-2007", bands: ["muse"], venueSlug: "glastonbury", year: 2007, hasSetlist: false },
  ],
  bests: [
    { slug: "most-watched-rock-concerts", kind: "all", key: null, strong: true },
    { slug: "best-live-metal-concerts", kind: "genre", key: "metal", strong: false },
    { slug: "most-watched-rock-concerts-1990s", kind: "decade", key: "1990s", strong: true },
  ],
};
const idx = buildIndex(cat);
const page = (phrase: string, subjects: string[] = [], year = 2026) => matchPage(phrase, intentOf(phrase, { year }), idx, new Set(subjects));

describe("seeds", () => {
  const seeds = buildSeeds(cat);
  const q = new Set(seeds.map((s) => s.query));
  it("asks every 'full concert' head term and its long tail", () => {
    for (const t of ["full concert", "full concerts", "full concert live", "fullconcert", "full live concert", "full show", "full set", "complete concert", "entire concert", "live full concert hd", "full concert 4k", "full concert video", "rock concert", "best rock concerts of all time", "rockpalast full concert", "pinkpop full concert"])
      expect(q.has(t), t).toBe(true);
    expect(q.has("full concert a")).toBe(true);
    expect(q.has("full concert z")).toBe(true);
    expect(q.has("full concert 0")).toBe(true);
    expect(q.has("full concert 9")).toBe(true);
    expect(buildSeeds(cat, { longTail: false }).some((s) => s.kind === "expand")).toBe(false);
  });
  it("asks every band with the rock modifiers, its years, festivals and venues", () => {
    for (const m of BAND_MODIFIERS) expect(q.has(`metallica${m}`), m).toBe(true);
    for (const t of ["metallica live 2008", "metallica tour 1993", "metallica at pinkpop", "metallica live at tushino airfield", "metallica rockpalast", "metallica pro shot", "metallica last concert"]) expect(q.has(t), t).toBe(true);
  });
  it("only the top bands get every modifier, the rest the core ones", () => {
    const light = buildSeeds(cat, { fullBands: 1 });
    expect(light.some((s) => s.query === "muse bootleg")).toBe(false);
    expect(light.some((s) => s.query === "muse full concert")).toBe(true);
    expect(light.some((s) => s.query === "metallica bootleg")).toBe(true);
  });
  it("asks festivals and their editions, genres in natural spellings, decades, tours and songs", () => {
    for (const t of ["pinkpop lineup", "pinkpop 1993 full show", "pinkpop 2008 lineup", "pinkpop 1993 setlist", "glastonbury 2007 full concert"]) expect(q.has(t), t).toBe(true);
    for (const t of ["full metal concert", "metal full concert", "best live metal concerts", "full trip hop concert", "trip hop live concert", "full new wave concert", "full synth pop concert", "metal concerts"]) expect(q.has(t), t).toBe(true);
    expect([...q].some((x) => x.includes("shoegaze"))).toBe(false); // no concert, no seed
    for (const t of ["80s rock concert", "90s rock concert full", "1990s rock concerts", "best 80s concerts"]) expect(q.has(t), t).toBe(true);
    for (const t of ["metallica wherever we may roam tour", "wherever we may roam tour full concert"]) expect(q.has(t), t).toBe(true);
    for (const t of ["metallica enter sandman live", "enter sandman live version", "metallica one live"]) expect(q.has(t), t).toBe(true);
    expect(q.has("one live")).toBe(false); // too short to ask alone
  });
  it("puts the head terms first, asks each query once, and covers every genre's natural spelling", () => {
    expect(seeds[0].kind).toBe("head");
    expect(new Set(seeds.map((s) => s.query)).size).toBe(seeds.length);
    expect(HEAD_TERMS.length).toBeGreaterThan(80);
    const allGenres = buildSeeds({ ...cat, genres: GENRES.map((g) => ({ name: g, slug: g, count: 1 })) }).map((s) => s.query);
    for (const t of ["full classic rock concert", "full hard rock concert", "full punk concert", "full post-punk concert", "full indie concert", "full alternative rock concert", "full grunge concert", "full garage rock concert", "full shoegaze concert", "full stoner rock concert", "full emo concert", "full big beat concert", "full art pop concert"])
      expect(allGenres, t).toContain(t);
  });
  it("estimates the run", () => {
    expect(estimateMinutes(6000, 350)).toBe(60);
  });
});

describe("intent", () => {
  it("reads what people want", () => {
    expect(intentOf("fullconcert.live")).toBe("brand");
    expect(intentOf("full concert live")).toBe("brand");
    expect(intentOf("metallica full concert live")).toBe("watch");
    expect(intentOf("metallica setlist 1993")).toBe("setlist");
    expect(intentOf("pinkpop 1995 line up")).toBe("lineup");
    expect(intentOf("best rock concerts of all time")).toBe("best-of");
    expect(intentOf("full concert 4k")).toBe("quality");
    expect(intentOf("metallica pro shot")).toBe("quality");
    expect(intentOf("metallica last concert")).toBe("band-fact");
    expect(intentOf("metallica reunion")).toBe("band-fact");
    expect(intentOf("metallica bootleg")).toBe("bootleg");
    expect(intentOf("metallica live album")).toBe("live-album");
    expect(intentOf("pinkpop tickets")).toBe("tickets");
    expect(intentOf("metallica tour 2031", { year: 2026 })).toBe("tickets");
    expect(intentOf("metallica tour 2026", { year: 2026 })).toBe("tickets");
    expect(intentOf("metallica tour 1993", { year: 2026 })).toBe("tour");
    expect(intentOf("enter sandman live", { song: true })).toBe("song-live");
    expect(intentOf("full concert")).toBe("watch");
    expect(intentOf("who is metallica")).toBe("info");
  });
});

describe("strict matching", () => {
  it("knows the ways a name is typed", () => {
    expect(nameVariants("The Cure")).toEqual(["the cure", "cure"]);
    expect(nameVariants("AC/DC")).toEqual(["ac dc", "acdc"]);
    expect(isAmbiguous("Muse")).toBe(true);
    expect(isAmbiguous("The Cure")).toBe(true);
    expect(isAmbiguous("Metallica")).toBe(false);
    expect(isAmbiguous("Grateful Dead")).toBe(false);
  });
  it("matches a whole name only, never part of one", () => {
    expect(findNamed("metallica live", cat.bands, new Set())?.slug).toBe("metallica");
    expect(findNamed("metallicaa live", cat.bands, new Set())).toBeNull();
    expect(findNamed("grateful live", cat.bands, new Set())).toBeNull();
    expect(findNamed("acdc live 1991", cat.bands, new Set())?.slug).toBe("ac-dc");
  });
  it("knows places by the short name people type", () => {
    expect(placeShortName("Glastonbury Festival")).toBe("glastonbury");
    expect(placeShortName("Red Rocks Amphitheatre")).toBe("red rocks");
    expect(placeShortName("Coachella Valley Music and Arts Festival")).toBe("coachella");
    expect(placeShortName("Pinkpop")).toBeNull();
    const short = (v: { name: string }) => [placeShortName(v.name)].filter((x): x is string => Boolean(x));
    expect(new NameIndex([{ name: "Glastonbury Festival" }], short).find("glastonbury 1997 full set", new Set())?.name).toBe("Glastonbury Festival");
    expect(new NameIndex([{ name: "Arenal Festival" }], short).find("arenal 2014", new Set())).toBeNull();
    expect(new NameIndex([{ name: "Arenal Festival" }], short).find("arenal 2014", new Set(["Arenal Festival"]))?.name).toBe("Arenal Festival");
    const seeds = buildSeeds({ ...cat, venues: [{ name: "Glastonbury Festival", slug: "glastonbury", concerts: 1, festival: true }] }).map((s) => s.query);
    expect(seeds).toContain("glastonbury lineup");
    expect(seeds).toContain("muse at glastonbury");
  });
  it("a short or common name counts only from its own seed or with its article", () => {
    expect(findNamed("muse live 2007", cat.bands, new Set())).toBeNull();
    expect(findNamed("muse live 2007", cat.bands, new Set(["Muse"]))?.slug).toBe("muse");
    expect(findNamed("the cure live", cat.bands, new Set())?.slug).toBe("the-cure");
    expect(findNamed("cure for cancer concert", cat.bands, new Set())).toBeNull();
  });
});

describe("pages and gaps", () => {
  it("sends each phrase to the most precise page we have", () => {
    expect(page("metallica pinkpop 1993 full concert")).toMatchObject({ pageType: "concert", page: "/concerts/metallica-pinkpop-1993", gap: null });
    expect(page("metallica live 1991")).toMatchObject({ pageType: "concert", page: "/concerts/metallica-moscow-1991" });
    expect(page("metallica live at pinkpop")).toMatchObject({ pageType: "concert", page: "/concerts/metallica-pinkpop-1993" });
    expect(page("metallica enter sandman live")).toMatchObject({ pageType: "song", page: "/songs/metallica/enter-sandman" });
    expect(page("metallica wherever we may roam tour")).toMatchObject({ pageType: "tour", page: "/tours/wherever-we-may-roam" });
    expect(page("metallica full concert")).toMatchObject({ pageType: "band", page: "/artists/metallica", gap: null });
    expect(page("metallica setlist")).toMatchObject({ pageType: "band-songs", page: "/songs/metallica" });
    expect(page("pinkpop 1993")).toMatchObject({ pageType: "venue-year", page: "/venues/pinkpop/1993" });
    expect(page("pinkpop full show")).toMatchObject({ pageType: "venue", page: "/venues/pinkpop" });
    expect(page("full metal concert")).toMatchObject({ pageType: "genre", page: "/genres/metal", gap: null });
    expect(page("full trip hop concert")).toMatchObject({ pageType: "genre", page: "/genres/trip-hop" });
    expect(page("full synth pop concert")).toMatchObject({ pageType: "genre", page: "/genres/new-wave-synth" });
    expect(page("90s rock concert")).toMatchObject({ pageType: "decade", page: "/decades/1990s" });
    expect(page("best 90s rock concerts")).toMatchObject({ pageType: "best", page: "/best/most-watched-rock-concerts-1990s" });
    expect(page("best rock concerts of all time")).toMatchObject({ pageType: "best", page: "/best/most-watched-rock-concerts" });
    expect(page("full concert")).toMatchObject({ pageType: "home", page: "/", gap: null });
    expect(page("fullconcert live")).toMatchObject({ pageType: "home", page: "/" });
  });
  it("reports what would serve a phrase we cannot serve yet", () => {
    expect(page("metallica live 1985")).toMatchObject({ page: "/artists/metallica", gap: GAPS.concertMissing });
    expect(page("metallica last concert")).toMatchObject({ page: "/artists/metallica", gap: GAPS.bandFaq });
    expect(page("pinkpop 1995 lineup")).toMatchObject({ page: "/venues/pinkpop", gap: GAPS.venueYearMissing });
    expect(page("pinkpop 2027 lineup")).toMatchObject({ page: null, gap: GAPS.lineupFuture });
    expect(page("full concert 4k")).toMatchObject({ page: "/concerts", gap: GAPS.qualityFilter });
    expect(page("live full concert hd")).toMatchObject({ gap: GAPS.qualityFilter });
    expect(page("best live metal concerts")).toMatchObject({ page: "/genres/metal", gap: GAPS.bestWeak });
    expect(page("best trip hop live")).toMatchObject({ page: "/genres/trip-hop", gap: GAPS.bestMissing });
    expect(page("full concert pink floyd")).toMatchObject({ page: null, gap: GAPS.bandMissing });
    expect(page("metallica live album")).toMatchObject({ gap: GAPS.liveAlbum });
    expect(page("pinkpop tickets")).toMatchObject({ page: null, gap: GAPS.tickets });
    expect(page("metallica bootleg")).toMatchObject({ page: "/artists/metallica" });
    expect(page("full concert bootleg")).toMatchObject({ gap: GAPS.bootlegHub });
  });
});

describe("noise", () => {
  const names = ["Metallica", "Grateful Dead", "Death Cab for Cutie", "Guitar Man"];
  it("drops gear, lyrics, prices, piracy, gossip and namesakes", () => {
    for (const p of ["metallica guitar tabs", "metallica lyrics", "metallica tickets price", "metallica mp3 download", "metallica net worth", "full metal jacket", "full metal alchemist", "full house", "metallica movie", "metallica documentary"])
      expect(isNoise(stripNames(p, names)), p).toBe(true);
  });
  it("keeps bands whose names hold a noise word, and concert films", () => {
    for (const p of ["grateful dead full concert", "death cab for cutie live", "guitar man live", "metallica concert film", "metallica full concert"])
      expect(isNoise(stripNames(p, names)), p).toBe(false);
  });
  it("cleans suggestions", () => {
    expect(cleanPhrase("  Full   Concert ")).toBe("full concert");
    expect(cleanPhrase("フルコンサート")).toBeNull();
    expect(cleanPhrase("x")).toBeNull();
  });
});

describe("engines (recorded answers)", () => {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/keyword-suggestions.json", import.meta.url), "utf8")) as Record<string, Record<string, unknown>>;
  const fakeFetch = async (url: string) => {
    const engine = url.includes("google") ? "google" : "bing";
    const q = decodeURIComponent((url.match(/[?&](?:q|query)=([^&]*)/) ?? [])[1] ?? "").replace(/\+/g, " ");
    const body = fixtures[engine][q];
    if (!body) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
  };
  const noSleep = async () => {};

  it("parses both answer shapes", () => {
    expect(parseSuggestions(fixtures.google["full concert"])).toContain("full concert metallica");
    expect(parseSuggestions(fixtures.bing["full concert"])).toContain("full concerts on youtube");
    expect(parseSuggestions({})).toEqual([]);
    expect(parseSuggestions(["q", "nope"])).toEqual([]);
  });
  it("retries after a 429 and gives up quietly", async () => {
    let calls = 0;
    const flaky = async (url: string) => (++calls === 1 ? { ok: false, status: 429, arrayBuffer: async () => new ArrayBuffer(0) } : fakeFetch(url));
    expect(await fetchSuggestions("google", "pinkpop 1995", flaky, noSleep)).toContain("pinkpop 1995 lineup");
    expect(calls).toBe(2);
    const broken = async () => {
      throw new Error("offline");
    };
    expect(await fetchSuggestions("bing", "x", broken, noSleep)).toEqual([]);
  });
  it("asks both engines for every seed and stops at the deadline", async () => {
    const seeds: Seed[] = ["full concert", "pinkpop 1995", "metallica live", "full metal concert"].map((query) => ({
      query,
      kind: query.startsWith("metallica") ? "band" : query.startsWith("pinkpop") ? "venue-year" : "head",
      subject: query.startsWith("metallica") ? "Metallica" : query.startsWith("pinkpop") ? "Pinkpop" : query,
    }));
    const all = await askEngines(seeds, { fetchImpl: fakeFetch, sleep: noSleep });
    expect(all.results).toHaveLength(8);
    expect(all.stoppedEarly).toBe(false);
    let t = 0;
    const cut = await askEngines(seeds, { fetchImpl: fakeFetch, sleep: noSleep, deadline: 2, now: () => t++ });
    expect(cut.stoppedEarly).toBe(true);
    expect(cut.asked).toBeLessThan(4);

    const { rows, noise } = rankKeywords(all.results, cat, { year: 2026 });
    const row = (p: string) => rows.find((r) => r.phrase === p);
    // Both engines and two seeds agree on "full concert live": the brand phrase, on the home page.
    expect(row("full concert live")).toMatchObject({ intent: "brand", page: "/", engines: ["bing", "google"] });
    expect(row("metallica live 1991")).toMatchObject({ page: "/concerts/metallica-moscow-1991", engines: ["bing", "google"] });
    expect(row("pinkpop 1995 metallica full concert")).toMatchObject({ page: "/artists/metallica", gap: GAPS.concertMissing });
    expect(row("full concert pink floyd")).toMatchObject({ page: null, gap: GAPS.bandMissing });
    expect(row("metallica tour 2031")).toMatchObject({ intent: "tickets", gap: GAPS.tickets });
    expect(row("full metal concert")).toMatchObject({ page: "/genres/metal" });
    expect(noise).toEqual(expect.arrayContaining(["full concert guitar tabs", "full metal jacket", "full metal alchemist", "metallica net worth"]));
    expect(rows.some((r) => noise.includes(r.phrase))).toBe(false);
    // Sorted by score, the brand phrase and multi-engine phrases first.
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].score).toBeGreaterThanOrEqual(rows[i].score);

    const summary = { generatedAt: "2026-11-20T10:00:00Z", seeds: 4, seedsAsked: 4, requests: 8, emptyAnswers: 0, phrases: rows.length, noise: noise.length, stoppedEarly: false };
    const md = reportMarkdown(rows, summary);
    expect(md).toContain("# Keyword research · 2026-11-20");
    expect(md).toContain("## Gaps by page type");
    expect(md).toContain(`### ${GAPS.bandMissing}`);
    expect(md).toContain("| full concert | / | yes |");
    const tail = logTail(rows, summary, 300);
    expect(tail[0]).toMatch(/^==== TOP \d+ PHRASES/);
    const gapAt = tail.indexOf("==== GAPS BY PAGE TYPE ====");
    const countsAt = tail.indexOf("==== COUNTS ====");
    expect(gapAt).toBeGreaterThan(0);
    expect(countsAt).toBe(tail.length - 2); // the counts are the very last line
    expect(JSON.parse(tail[tail.length - 1])).toMatchObject({ phrases: rows.length, byIntent: expect.any(Object) });
    expect(headTargetCheck(rows).find((h) => h.phrase === "full concert 4k")).toMatchObject({ seen: true, page: "/concerts" });
    expect(gapSummary(rows)[0].score).toBeGreaterThanOrEqual(gapSummary(rows).at(-1)!.score);
  });
});

describe("scoring", () => {
  it("rewards more seeds, both engines and a top suggestion, weighted by intent", () => {
    expect(scoreOf(1, 1, 5, "watch")).toBe(3);
    expect(scoreOf(1, 2, 5, "watch")).toBe(6);
    expect(scoreOf(1, 2, 0, "watch")).toBe(7.5);
    expect(scoreOf(3, 1, 5, "tickets")).toBe(0.9);
    expect(scoreOf(2, 2, 0, "brand")).toBeGreaterThan(scoreOf(2, 2, 0, "watch"));
  });
  it("decades are read in every spelling", () => {
    expect(decadeIn("80s rock concert")).toBe("1980s");
    expect(decadeIn("1990s concerts")).toBe("1990s");
    expect(decadeIn("best of the seventies live")).toBe("1970s");
    expect(decadeIn("2000s rock")).toBe("2000s");
    expect(decadeIn("full concert")).toBeNull();
  });
  it("report headings use none of the banned words", () => {
    expect(Object.values(GAPS).join(" ")).not.toMatch(BANNED);
  });
});
