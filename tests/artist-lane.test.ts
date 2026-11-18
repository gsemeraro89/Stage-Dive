// The per-artist lane: free filters, official channels, budget cap, search order, Haiku/Opus
// agreement. Pure tests, plus a few database tests (TEST_DATABASE_URL).
import "dotenv/config";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GENRES, SITE_GENRES } from "../src/lib/catalogue";
import {
  agreement,
  artistsInTitle,
  chooseClassifierMode,
  ClaudeBudget,
  costOf,
  DEFAULT_LANE_CLASSIFIER,
  DEFAULT_SOURCES,
  handleChannelMatches,
  handleFor,
  isTopicChannel,
  parseSources,
  excludedTitleWord,
  laneFilter,
  matchText,
  officialChannel,
  searchesThatFit,
  searchesToRun,
  searchQuery,
  takeWithinBudget,
  titleHasArtist,
  type LaneVideoFacts,
  type OfficialChannels,
} from "../src/lib/collector/lane";
import { pickArtist, youtubeRefFromRelations } from "../src/lib/collector/musicbrainz";
import {
  decide,
  DEFAULT_CONFIG,
  findArtistRule,
  genresForApprovedArtist,
  isExcludedArtist,
  type ArtistExclusion,
  type ArtistRule,
  type Classification,
} from "../src/lib/collector/rules";
import { YouTubeClient } from "../src/lib/collector/youtube";

// A test list in the shape of data/artist-rules.json, with the names that are hard to match:
// accents, slashes, apostrophes, "&", abbreviations and short common words.
const rules: ArtistRule[] = [
  { name: "The Cure", genres: ["post-punk"], allConcerts: true },
  { name: "Metallica", genres: ["metal"], allConcerts: true },
  { name: "Foo Fighters", genres: ["alternative"], allConcerts: true },
  { name: "Mötley Crüe", genres: ["hard rock"], allConcerts: true },
  { name: "Guns N' Roses", aka: ["Guns and Roses"], genres: ["hard rock"], allConcerts: true },
  { name: "Sigur Rós", genres: ["indie"], allConcerts: true },
  { name: "AC/DC", genres: ["hard rock"], allConcerts: true },
  { name: "Echo & the Bunnymen", genres: ["post-punk"], allConcerts: true },
  { name: "Queens of the Stone Age", aka: ["QOTSA"], genres: ["stoner"], allConcerts: true },
  { name: "Ride", genres: ["shoegaze"], allConcerts: true },
  { name: "Rammstein", genres: ["metal"] },
];
const rule = (name: string) => rules.find((r) => r.name === name)!;
const names = (name: string) => [rule(name).name, ...(rule(name).aka ?? [])];

describe("artist name in the title", () => {
  it("ignores accents, case and punctuation", () => {
    expect(matchText("Mötley Crüe & Sigur Rós @ Wembley!")).toBe("motley crue and sigur ros wembley");
    expect(titleHasArtist("MOTLEY CRUE live at Donington 1984", names("Mötley Crüe"))).toBe(true);
    expect(titleHasArtist("Sigur Ros | Roskilde 2008", names("Sigur Rós"))).toBe(true);
    expect(titleHasArtist("Guns N Roses - Tokyo 1992", names("Guns N' Roses"))).toBe(true);
    expect(titleHasArtist("AC/DC - Live at Donington", names("AC/DC"))).toBe(true);
  });

  it("uses the aka spellings", () => {
    expect(titleHasArtist("QOTSA live at Rock am Ring", names("Queens of the Stone Age"))).toBe(true);
    expect(titleHasArtist("Guns and Roses - Paris 1992", names("Guns N' Roses"))).toBe(true);
  });

  it("matches a name of several words written as one, and & written out", () => {
    expect(titleHasArtist("ACDC Live at River Plate", names("AC/DC"))).toBe(true);
    expect(titleHasArtist("#FooFighters at Pinkpop", names("Foo Fighters"))).toBe(true);
    expect(titleHasArtist("Echo and the Bunnymen - Glastonbury", names("Echo & the Bunnymen"))).toBe(true);
    expect(titleHasArtist("Echo The Bunnymen - Live 1983", names("Echo & the Bunnymen"))).toBe(true);
  });

  it("needs whole words", () => {
    expect(titleHasArtist("Riders on the Storm live", names("Ride"))).toBe(false);
    expect(titleHasArtist("Ride - live at Primavera 2018", names("Ride"))).toBe(true);
    expect(titleHasArtist("Metallica - Live at Pinkpop", names("The Cure"))).toBe(false);
  });

  it("finds every lane artist in a shared title, in list order", () => {
    const lane = rules.filter((r) => r.allConcerts);
    expect(artistsInTitle("Foo Fighters with Metallica - Bridge School", lane).map((r) => r.name)).toEqual(["Metallica", "Foo Fighters"]);
  });
});

describe("excluded words", () => {
  it("drops the collector's list: trailers, aftermovies, interviews, reactions, covers, tutorials, lyrics, full album", () => {
    expect(excludedTitleWord("Pinkpop 2024 Official Aftermovie")).toBe("aftermovie");
    expect(excludedTitleWord("Dave Grohl interview")).toBe("interview");
    expect(excludedTitleWord("First time reaction to Metallica - One")).toBe("reaction");
    expect(excludedTitleWord("Fade to Black (cover)")).toBe("cover");
    expect(excludedTitleWord("Nothing Else Matters guitar tutorial")).toBe("tutorial");
    expect(excludedTitleWord("Metallica - Enter Sandman (Lyrics)")).toBe("lyrics");
    expect(excludedTitleWord("Metallica - Master of Puppets (Full Album)")).toBe("full album");
  });
  it("drops podcasts, compilations, best of, greatest hits", () => {
    expect(excludedTitleWord("The Metallica Podcast 12")).toBe("podcast");
    expect(excludedTitleWord("Grunge Compilation 1994")).toBe("compilation");
    expect(excludedTitleWord("Best of The Cure live")).toBe("best of");
    expect(excludedTitleWord("Greatest Hits live in Paris")).toBe("greatest hits");
  });
  it("keeps normal concert titles, also ones that name an album", () => {
    expect(excludedTitleWord("Metallica - Live at Pinkpop 2008 (Full Concert)")).toBeNull();
    expect(excludedTitleWord("The Cure plays Disintegration live at Sydney Opera House")).toBeNull();
    expect(excludedTitleWord("Metallica: Black Album live, Muskegon 1991")).toBeNull();
    expect(excludedTitleWord("Linkin Park | Rock in Rio Lisboa 2026")).toBeNull();
  });
});

const channels: OfficialChannels = {
  listed: new Map([["UCpinkpop0000000000000", "ARCHIVE"], ["UClabel00000000000000", "MIXED"]]),
  artistChannels: new Map([["UCartist00000000000000", "Metallica"]]),
  approved: new Map([["UCold0000000000000000", "UNKNOWN"]]),
};

describe("official channels", () => {
  it("accepts our channel list, the band's own channel and channels already approved", () => {
    expect(officialChannel("UCpinkpop0000000000000", channels)).toEqual({ reason: "channel-list", kind: "ARCHIVE" });
    expect(officialChannel("UClabel00000000000000", channels)).toEqual({ reason: "channel-list", kind: "MIXED" });
    expect(officialChannel("UCartist00000000000000", channels)).toEqual({ reason: "artist-channel", kind: "ARTIST" });
    // An approved channel of unknown kind is treated as mixed (needs two signals unless the band is approved).
    expect(officialChannel("UCold0000000000000000", channels)).toEqual({ reason: "approved-channel", kind: "MIXED" });
  });
  it("leaves everything else out (fan uploads)", () => {
    expect(officialChannel("UCfan000000000000000000", channels)).toBeNull();
  });
});

function video(overrides: Partial<LaneVideoFacts> = {}): LaneVideoFacts {
  return {
    youtubeId: "VID00000001",
    title: "Metallica - Live at Pinkpop 2008",
    channelId: "UCpinkpop0000000000000",
    durationSeconds: 90 * 60,
    embeddable: true,
    privacyStatus: "public",
    madeForKids: false,
    liveBroadcastContent: "none",
    uploadStatus: "processed",
    blockedIn: [],
    ...overrides,
  };
}
const ctx = (o: Partial<Parameters<typeof laneFilter>[1]> = {}) => ({
  names: names("Metallica"),
  isConcert: false,
  decided: false,
  channels,
  minDurationSeconds: 40 * 60,
  ...o,
});

describe("laneFilter (free filters, in the owner's order)", () => {
  it("sends an official full concert to Claude, whatever its views", () => {
    expect(laneFilter(video(), ctx())).toEqual({ outcome: "classify", official: { reason: "channel-list", kind: "ARCHIVE" } });
  });
  it("skips concerts and decided videos first", () => {
    expect(laneFilter(video({ durationSeconds: 60 }), ctx({ isConcert: true }))).toEqual({ outcome: "drop", reason: "already-a-concert" });
    expect(laneFilter(video(), ctx({ decided: true }))).toEqual({ outcome: "drop", reason: "already-decided" });
  });
  it("drops on YouTube, region and length rules before looking at the title", () => {
    expect(laneFilter(video({ durationSeconds: 39 * 60, title: "trailer" }), ctx())).toEqual({ outcome: "drop", reason: "rule:too-short" });
    expect(laneFilter(video({ embeddable: false }), ctx())).toEqual({ outcome: "drop", reason: "rule:not-embeddable" });
    expect(laneFilter(video({ privacyStatus: "unlisted" }), ctx())).toEqual({ outcome: "drop", reason: "rule:not-public" });
    expect(laneFilter(video({ madeForKids: true }), ctx())).toEqual({ outcome: "drop", reason: "rule:made-for-kids" });
    expect(laneFilter(video({ liveBroadcastContent: "live" }), ctx())).toEqual({ outcome: "drop", reason: "rule:live-or-upcoming" });
    expect(laneFilter(video({ uploadStatus: "uploaded" }), ctx())).toEqual({ outcome: "drop", reason: "rule:not-processed" });
    expect(laneFilter(video({ blockedIn: ["DE"] }), ctx())).toEqual({ outcome: "drop", reason: "rule:region-blocked" });
  });
  it("drops a title without the band's name, then titles with excluded words", () => {
    expect(laneFilter(video({ title: "Pinkpop 2008 aftermovie" }), ctx())).toEqual({ outcome: "drop", reason: "name-not-in-title" });
    expect(laneFilter(video({ title: "Metallica - Pinkpop aftermovie" }), ctx())).toEqual({ outcome: "drop", reason: "excluded-word:aftermovie" });
  });
  it("on the band's own channel the name may be missing from the title", () => {
    const own = video({ title: "Live at The Metro, Chicago - August 12, 1983", channelId: "UCartist00000000000000" });
    expect(laneFilter(own, ctx({ onOwnChannel: true }))).toEqual({ outcome: "classify", official: { reason: "artist-channel", kind: "ARTIST" } });
  });
  it("on the band's own channel a bare title (a promo or a chat stream) is not a concert", () => {
    const promo = video({ title: "Happy holidays from all of us!", channelId: "UCartist00000000000000" });
    expect(laneFilter(promo, ctx({ onOwnChannel: true }))).toEqual({ outcome: "drop", reason: "own-channel-title-not-a-concert" });
    for (const title of ["Muskegon, MI - November 1, 1991", "Full show: Yankee Stadium", "#MetallicaMondays: Olympiastadion Munich 2004", "S&M2 concert"]) {
      expect(laneFilter(video({ title, channelId: "UCartist00000000000000" }), ctx({ onOwnChannel: true })).outcome).toBe("classify");
    }
  });
  it("fan uploads go to the report only", () => {
    expect(laneFilter(video({ channelId: "UCfan000000000000000000" }), ctx())).toEqual({ outcome: "report-only" });
  });
  it("a band with no readable official channel: any channel may go to Claude (via other channel)", () => {
    expect(laneFilter(video({ channelId: "UCfan000000000000000000" }), ctx({ otherChannelsOk: true }))).toEqual({
      outcome: "classify",
      official: { reason: "other-channel", kind: "UNKNOWN" },
    });
    // Official channels keep their own kind; the free filters still apply first.
    expect(laneFilter(video(), ctx({ otherChannelsOk: true }))).toEqual({ outcome: "classify", official: { reason: "channel-list", kind: "ARCHIVE" } });
    expect(laneFilter(video({ channelId: "UCfan", title: "Some other band live" }), ctx({ otherChannelsOk: true }))).toEqual({ outcome: "drop", reason: "name-not-in-title" });
    expect(laneFilter(video({ channelId: "UCfan", durationSeconds: 1200 }), ctx({ otherChannelsOk: true }))).toEqual({ outcome: "drop", reason: "rule:too-short" });
    expect(laneFilter(video({ channelId: "UCfan", title: "Metallica - best of 2024" }), ctx({ otherChannelsOk: true }))).toEqual({ outcome: "drop", reason: "excluded-word:best of" });
  });
});

describe("searches: resume order and units", () => {
  const a = [
    { name: "Adam Beyer", searchedAt: new Date("2026-11-17") },
    { name: "I Hate Models", searchedAt: null },
    { name: "Amelie Lens", searchedAt: null },
    { name: "Reinier Zonneveld", searchedAt: new Date("2026-11-17") },
    { name: "Joseph Capriati", searchedAt: null },
  ];
  it("searches only artists never searched, in the owner's order, up to the limit", () => {
    expect(searchesToRun(a, 2).map((x) => x.name)).toEqual(["I Hate Models", "Amelie Lens"]);
    expect(searchesToRun(a, 10).map((x) => x.name)).toEqual(["I Hate Models", "Amelie Lens", "Joseph Capriati"]);
    expect(searchesToRun(a, 0)).toEqual([]);
  });
  it("the next day resumes where the first stopped, and never repeats a search", () => {
    const day1 = searchesToRun(a, 2);
    const after = a.map((x) => (day1.includes(x) ? { ...x, searchedAt: new Date() } : x));
    expect(searchesToRun(after, 10).map((x) => x.name)).toEqual(["Joseph Capriati"]);
  });
  it("counts 101 units per search (search + reading its results) and keeps a reserve", () => {
    expect(searchesThatFit(10_000 - 1_400)).toBe(84);
    expect(searchesThatFit(150)).toBe(0);
    expect(searchesThatFit(50)).toBe(0);
  });
  it("searches the band's name in quotes, then 'full concert'", () => {
    expect(searchQuery("Metallica")).toBe('"Metallica" full concert');
  });
  it("takes each channel's uploads playlist from YouTube, 50 channels per unit", async () => {
    const calls: string[] = [];
    const fake = (async (u: string) => {
      calls.push(u);
      const ids = new URL(u).searchParams.get("id")!.split(",");
      const items = ids
        .filter((id) => id !== "UCgone")
        .map((id) => ({ id, snippet: { title: id }, contentDetails: { relatedPlaylists: { uploads: `UUreal${id}` } }, statistics: { videoCount: "12" } }));
      return new Response(JSON.stringify({ items }), { status: 200 });
    }) as typeof fetch;
    const yt = new YouTubeClient("key", 100, fake);
    const ids = [...Array.from({ length: 60 }, (_, i) => `UC${i}`), "UCgone"];
    const info = await yt.channelsInfo(ids);
    expect(calls).toHaveLength(2);
    expect(yt.unitsUsed).toBe(2);
    expect(info.get("UC7")).toEqual({ id: "UC7", title: "UC7", uploadsPlaylistId: "UUrealUC7", videoCount: 12 });
    expect(info.has("UCgone")).toBe(false);
  });
});

describe("Claude budget", () => {
  it("prices real usage, Batch at half, cached system prompt at a tenth", () => {
    expect(costOf("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 }, false)).toBeCloseTo(0.6);
    expect(costOf("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 }, true)).toBeCloseTo(0.3);
    expect(costOf("claude-haiku-5-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 }, false)).toBeCloseTo(0.01);
    expect(costOf("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 }, true)).toBeCloseTo(2);
  });

  it("a pass stops at the first request that does not fit", () => {
    const budget = new ClaudeBudget(1);
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(takeWithinBudget(items, () => 0.3, budget)).toEqual([0, 1, 2]);
    expect(budget.stopped).toBe(true);
  });

  it("estimates do not block later passes once the batch is back at its real cost", () => {
    // Pass 2 of 17 Nov: big estimates were reserved, the batch came back cheap, and the write-ups got
    // nothing because the stop was permanent. Now the real cost frees the room again.
    const budget = new ClaudeBudget(3);
    expect(takeWithinBudget(Array.from({ length: 99 }, (_, i) => i), () => 0.03, budget)).toHaveLength(99);
    budget.settle(99 * 0.03, 0.5);
    expect(takeWithinBudget(Array.from({ length: 2000 }, (_, i) => i), () => 0.0003, budget)).toHaveLength(2000);
  });

  it("real spend at the cap stops everything", () => {
    const budget = new ClaudeBudget(1);
    budget.addSpent(1);
    expect(takeWithinBudget([1, 2], () => 0.0001, budget)).toEqual([]);
  });

  it("all of yesterday's ~2,600 candidates fit the default $3 with Haiku", async () => {
    const { estimateUsd } = await import("../src/lib/collector/haiku");
    const v = { youtubeId: "x", title: "t".repeat(80), description: "d".repeat(5000), channelTitle: "c", tags: [], publishedAt: new Date() } as never;
    const budget = new ClaudeBudget(3);
    const items = Array.from({ length: 2600 }, () => v);
    expect(takeWithinBudget(items, (it) => estimateUsd("classify", it, true) + estimateUsd("writeup", it, true), budget)).toHaveLength(2600);
  });

  it("counts real costs when answers come back, and earlier runs' batches", () => {
    const budget = new ClaudeBudget(3);
    budget.addSpent(2.5); // a batch from yesterday came back
    expect(budget.tryCommit(0.4)).toBe(true);
    budget.settle(0.4, 0.1);
    expect(budget.spentUsd).toBeCloseTo(2.6);
    expect(budget.committedUsd).toBe(0);
    expect(budget.leftUsd).toBeCloseTo(0.4);
    expect(budget.tryCommit(0.5)).toBe(false);
  });
});

describe("Haiku or Haiku + Opus", () => {
  it("this lane uses Haiku only by default (owner, 17 Nov 2026)", () => {
    expect(DEFAULT_LANE_CLASSIFIER).toBe("haiku");
    expect(chooseClassifierMode(DEFAULT_LANE_CLASSIFIER, 0.5)).toBe("haiku");
  });
  it("auto follows the last test: Haiku alone from 95% agreement", () => {
    expect(chooseClassifierMode("auto", 0.95)).toBe("haiku");
    expect(chooseClassifierMode("auto", 0.949)).toBe("haiku+opus");
    expect(chooseClassifierMode(undefined, null)).toBe("haiku+opus");
    expect(chooseClassifierMode("", 0.99)).toBe("haiku");
  });
  it("an explicit venueKind wins", () => {
    expect(chooseClassifierMode("haiku", null)).toBe("haiku");
    expect(chooseClassifierMode("haiku+opus", 1)).toBe("haiku+opus");
  });
});

describe("Haiku/Opus agreement", () => {
  const cls = (o: Partial<Classification>): Classification => ({ isFullConcert: true, isRock: true, confidence: 0.9, genres: ["metal"], mainArtists: ["X"], ...o });
  const d = (c: Classification) => decide({ channelKind: "ARCHIVE", official: true, classification: c, textGenres: [], artistGenres: null }, DEFAULT_CONFIG);

  it("compares the accept/reject outcome of the same decide()", () => {
    const pairs = [
      { youtubeId: "a", title: "A", opus: d(cls({})), haiku: d(cls({ confidence: 0.8 })) }, // both accept
      { youtubeId: "b", title: "B", opus: d(cls({ isFullConcert: false })), haiku: d(cls({ isFullConcert: false, confidence: 0.5 })) }, // both reject (different reasons)
      { youtubeId: "c", title: "C", opus: d(cls({})), haiku: d(cls({ confidence: 0.6 })) }, // Haiku unsure
      { youtubeId: "d", title: "D", opus: d(cls({ isRock: false })), haiku: d(cls({})) }, // Haiku too generous
    ];
    const r = agreement(pairs);
    expect(r).toMatchObject({ total: 4, agree: 2, rate: 0.5 });
    expect(r.onlyOpusAccepted.map((p) => p.youtubeId)).toEqual(["c"]);
    expect(r.onlyHaikuAccepted.map((p) => p.youtubeId)).toEqual(["d"]);
  });
  it("no pairs: rate 0", () => {
    expect(agreement([]).rate).toBe(0);
  });
});

describe("band channels found by @handle", () => {
  it("tries the name in plain letters, no spaces", () => {
    expect(handleFor("Metallica")).toBe("@metallica");
    expect(handleFor("Mötley Crüe")).toBe("@motleycrue");
    expect(handleFor("Queens of the Stone Age")).toBe("@queensofthestoneage");
  });
  it("accepts it only when the title is the band's name and the channel has real content", () => {
    expect(handleChannelMatches({ title: "Metallica", videoCount: 120 }, names("Metallica"))).toBe(true);
    expect(handleChannelMatches({ title: "METALLICA OFFICIAL", videoCount: 40 }, names("Metallica"))).toBe(true);
    expect(handleChannelMatches({ title: "Motley Crue", videoCount: 30 }, names("Mötley Crüe"))).toBe(true);
    expect(handleChannelMatches({ title: "Metallica", videoCount: 3 }, names("Metallica"))).toBe(false);
    expect(handleChannelMatches({ title: "Metallica - Topic", videoCount: 300 }, names("Metallica"))).toBe(false);
    expect(handleChannelMatches({ title: "Metallica fan page", videoCount: 300 }, names("Metallica"))).toBe(false);
    expect(handleChannelMatches({ title: "Ride Cycling", videoCount: 300 }, names("Ride"))).toBe(false);
  });
  it("recognises YouTube's automatic Topic channels", () => {
    expect(isTopicChannel("The Cure - Topic")).toBe(true);
    expect(isTopicChannel("The Cure")).toBe(false);
  });
});

describe("sources of a pass", () => {
  it("defaults to long videos, artist channels, searches and handles", () => {
    expect([...parseSources("")]).toEqual(DEFAULT_SOURCES);
    expect([...parseSources(undefined)]).toEqual(["long", "channel", "search", "handles"]);
  });
  it("a cheap pass reads only what the lane matched or classified before", () => {
    expect([...parseSources("answers, matches")]).toEqual(["answers", "matches"]);
    expect(() => parseSources("answers,everything")).toThrow(/unknown LANE_SOURCES/);
  });
});

describe("namesakes on MusicBrainz", () => {
  const c = (mbid: string, genres: string[], youtube = false) => ({ mbid, genres, youtube: youtube ? { id: `UC${mbid.padEnd(22, "0")}` } : null });
  it("takes the one rock band among namesakes", () => {
    expect(pickArtist([c("dj", ["techno"]), c("band", ["rock", "indie"]), c("pop", ["pop"])])?.mbid).toBe("band");
  });
  it("among several rock namesakes, only the one with a YouTube channel", () => {
    expect(pickArtist([c("a", ["punk"]), c("b", ["metal"], true)])?.mbid).toBe("b");
    expect(pickArtist([c("a", ["punk"], true), c("b", ["metal"], true)])).toBeNull();
  });
  it("a single namesake without genres is taken; one that is clearly not rock is not", () => {
    expect(pickArtist([c("only", [])])?.mbid).toBe("only");
    expect(pickArtist([c("dj", ["techno"])])).toBeNull();
    expect(pickArtist([c("x", []), c("y", [])])).toBeNull();
  });
  it("reads the YouTube channel among an artist's links", () => {
    expect(
      youtubeRefFromRelations([
        { type: "official homepage", url: { resource: "https://example.com" } },
        { type: "youtube", ended: true, url: { resource: "https://www.youtube.com/@old" } },
        { type: "youtube", url: { resource: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv" } },
      ]),
    ).toEqual({ id: "UCabcdefghijklmnopqrstuv" });
  });
});

describe("data/artist-rules.json", () => {
  const file = JSON.parse(readFileSync("data/artist-rules.json", "utf8")) as { include: ArtistRule[]; exclude: ArtistExclusion[] };
  it("lists each band once, with genres from our list", () => {
    const keys = file.include.map((r) => matchText(r.name));
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of file.include) for (const g of r.genres) expect(SITE_GENRES as readonly string[]).toContain(g);
  });
  it("keeps The Rolling Stones out (official sources only, owner 17 Nov 2026)", () => {
    expect(isExcludedArtist(["The Rolling Stones"], file.exclude)).toBe(true);
    expect(isExcludedArtist(["Rolling Stones"], file.exclude)).toBe(true);
    expect(isExcludedArtist(["The Stone Roses"], file.exclude)).toBe(false);
  });
  it("finds an included band by any spelling and uses its genres when the classifier gives none", () => {
    expect(findArtistRule(["guns and roses"], rules)?.name).toBe("Guns N' Roses");
    expect(genresForApprovedArtist([], rule("Ride"))).toEqual(["shoegaze"]);
    expect(GENRES).toContain("shoegaze");
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("lane storage (database)", () => {
  let db: ReturnType<typeof import("../src/lib/db").getDb>;
  let haiku: typeof import("../src/lib/collector/haiku");

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    db = (await import("../src/lib/db")).getDb();
    haiku = await import("../src/lib/collector/haiku");
    await db.laneAnswer.deleteMany();
    await db.classifierBatch.deleteMany();
  });
  afterAll(async () => {
    await db.laneAnswer.deleteMany();
    await db.classifierBatch.deleteMany();
  });

  const answer = { isFullConcert: true, notConcertReason: "", isRock: true, confidence: 0.9, mainArtists: ["Ben Klock"], collaborators: [], venue: "Berghain", city: "Berlin", country: "Germany", venueKind: "Club" as const, genres: ["Techno" as const], liveAct: false };

  it("stores Haiku answers by prompt version and reuses them (a dry run's answers serve the real run)", async () => {
    await haiku.storeLaneAnswer(db, "LANEVID0001", "classify", haiku.LANE_CLASSIFY_VERSION, answer);
    await haiku.storeLaneAnswer(db, "LANEVID0001", "writeup", haiku.LANE_WRITEUP_VERSION, { writeUp: "Ben Klock plays Berghain." });
    await haiku.storeLaneAnswer(db, "LANEVID0002", "classify", "lane-c-oldversion", answer);
    const got = await haiku.storedLaneAnswers(db, ["LANEVID0001", "LANEVID0002"], "classify", 30);
    expect([...got.keys()]).toEqual(["LANEVID0001"]);
    expect((await haiku.storedLaneAnswers(db, ["LANEVID0001"], "writeup", 30)).get("LANEVID0001")).toEqual({ writeUp: "Ben Klock plays Berghain." });
  });

  it("reuses every stored answer, however many (pass 2 sent stored videos to Haiku again?)", async () => {
    const ids = Array.from({ length: 12_000 }, (_, i) => `REUSE${String(i).padStart(6, "0")}`);
    for (let i = 0; i < ids.length; i += 2_000) {
      await db.laneAnswer.createMany({
        data: ids.slice(i, i + 2_000).map((youtubeId) => ({ youtubeId, kind: "classify", promptVersion: haiku.LANE_CLASSIFY_VERSION, result: answer })),
      });
    }
    // Stored by the batch collector exactly as parseLaneAnswer returns them, so they read back.
    const got = await haiku.storedLaneAnswers(db, [...ids, "NEVERASKED1"], "classify", 30);
    expect(got.size).toBe(12_000);
    expect(got.has("NEVERASKED1")).toBe(false);
    await db.laneAnswer.deleteMany({ where: { youtubeId: { startsWith: "REUSE" } } });
  });

  it("remembers the lane's matches (IDs only) for a cheap next pass", async () => {
    await db.laneMatch.createMany({ data: [{ youtubeId: "MATCH000001", artist: "Ben Klock" }], skipDuplicates: true });
    await db.laneMatch.createMany({ data: [{ youtubeId: "MATCH000001", artist: "Ben Klock" }], skipDuplicates: true });
    expect(await db.laneMatch.count({ where: { youtubeId: "MATCH000001" } })).toBe(1);
    await db.laneMatch.deleteMany();
  });

  it("lane answers expire with the 30-day rule", async () => {
    await db.laneAnswer.updateMany({ where: { youtubeId: "LANEVID0001" }, data: { createdAt: new Date(Date.now() - 31 * 86_400_000) } });
    const { expireOldData } = await import("../src/lib/collector/store");
    expect((await expireOldData(db, 30)).laneAnswers).toBe(2);
  });

  it("the main collector never picks up the lane's Haiku batches", async () => {
    await db.classifierBatch.create({ data: { batchId: "msgbatch_lane", promptVersion: haiku.LANE_CLASSIFY_VERSION, youtubeIds: ["LANEVID0003"], lane: "lane-classify" } });
    const { collectPendingBatches } = await import("../src/lib/collector/batch");
    const { videosInPendingBatches } = await import("../src/lib/collector/cache");
    const untouchable = { get anthropic(): never { throw new Error("must not be called"); } } as never;
    expect((await collectPendingBatches(db, untouchable)).batches).toBe(0);
    expect((await videosInPendingBatches(db, haiku.LANE_CLASSIFY_VERSION)).size).toBe(0);
    expect(await haiku.videosInLaneBatches(db, "classify")).toEqual(new Set(["LANEVID0003"]));
  });

  it("stores each artist's search so it is never repeated", async () => {
    await db.artistLookup.upsert({
      where: { nameKey: "lane test artist" },
      create: { nameKey: "lane test artist", genres: [], searchedAt: new Date(), searchResultIds: ["A", "B"] },
      update: { searchedAt: new Date(), searchResultIds: ["A", "B"] },
    });
    const row = await db.artistLookup.findUniqueOrThrow({ where: { nameKey: "lane test artist" } });
    expect(searchesToRun([{ name: "Lane Test Artist", searchedAt: row.searchedAt }], 5)).toEqual([]);
    expect(row.searchResultIds).toEqual(["A", "B"]);
    await db.artistLookup.delete({ where: { nameKey: "lane test artist" } });
  });
});
