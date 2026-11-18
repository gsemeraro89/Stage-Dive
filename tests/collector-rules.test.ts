// Ingestion rules: filters, classifier decision, de-duplication, refresh (CLAUDE.md asks for these tests).
import { describe, expect, it } from "vitest";
import {
  checkRules,
  decide,
  DEFAULT_CONFIG,
  genresInText,
  isDueForRefresh,
  isElectronicGenreList,
  isSameConcert,
  parseIsoDuration,
  refreshAction,
  statusAfterRefresh,
  blockedRegions,
  resolveDuplicate,
  titleSaysNotAConcert,
  worthRemembering,
  type DecisionInput,
  type ConcertIdentity,
  type VideoFacts,
} from "../src/lib/collector/rules";
import { toVideo } from "../src/lib/collector/youtube";

const config = DEFAULT_CONFIG;

function video(overrides: Partial<VideoFacts> = {}): VideoFacts {
  return {
    youtubeId: "AAAAAAAAAAA",
    title: "Artist live at Somewhere",
    durationSeconds: 90 * 60,
    viewCount: 12_000_000,
    embeddable: true,
    privacyStatus: "public",
    madeForKids: false,
    liveBroadcastContent: "none",
    uploadStatus: "processed",
    blockedIn: [],
    ...overrides,
  };
}

describe("parseIsoDuration", () => {
  it("reads YouTube durations", () => {
    expect(parseIsoDuration("PT2H3M36S")).toBe(7416);
    expect(parseIsoDuration("PT56M46S")).toBe(3406);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("P1DT1H")).toBe(90000);
  });
  it("returns 0 for missing or odd values", () => {
    expect(parseIsoDuration(undefined)).toBe(0);
    expect(parseIsoDuration("P0D")).toBe(0);
    expect(parseIsoDuration("garbage")).toBe(0);
  });
});

describe("titles and long videos (saving calls and tokens)", () => {
  it("leaves out trailers, aftermovies, interviews and documentaries without asking the classifier", () => {
    for (const t of ["Tomorrowland 2024 | Official Aftermovie", "Awakenings Trailer", "Interview with Charlotte de Witte", "Afterlife – The Documentary", "Weekend recap", "Teaser: NTO live"])
      expect(titleSaysNotAConcert(t), t).toBe(true);
    for (const t of ["Stephan Bodzin live at Cercle", "Anyma presents Afterlife Tulum (Full Concert)", "Recapitulation live concert", "Moviemaker b2b DJ"])
      expect(titleSaysNotAConcert(t), t).toBe(false);
    expect(checkRules(video({ title: "Time Warp 2024 Aftermovie" }), config)).toEqual(["not-a-concert-title"]);
  });

  it("remembers long videos kept out only by things that can change", () => {
    expect(worthRemembering(checkRules(video({ viewCount: 6_000_000 }), config))).toBe(true);
    expect(worthRemembering(checkRules(video({ viewCount: 6_000_000, embeddable: false }), config))).toBe(true);
    expect(worthRemembering(checkRules(video({ durationSeconds: 300, viewCount: 6_000_000 }), config))).toBe(false); // length never changes
    expect(worthRemembering(checkRules(video({ viewCount: 6_000_000, madeForKids: true }), config))).toBe(false);
    expect(worthRemembering(checkRules(video({ viewCount: 6_000_000, title: "Official trailer" }), config))).toBe(false);
    expect(worthRemembering(checkRules(video(), config))).toBe(false); // passes: goes to the classifier
  });
});

describe("checkRules (YouTube and product rules)", () => {
  it("lets a long, popular, public, embeddable video through", () => {
    expect(checkRules(video(), config)).toEqual([]);
  });
  it("needs at least 40 minutes and the view threshold", () => {
    expect(checkRules(video({ durationSeconds: 39 * 60 + 59 }), config)).toEqual(["too-short"]);
    expect(checkRules(video({ durationSeconds: 40 * 60 }), config)).toEqual([]);
    expect(checkRules(video({ viewCount: 9_999_999 }), config)).toEqual(["below-view-threshold"]);
  });
  it("never lets through what YouTube says may not be embedded or shown", () => {
    expect(checkRules(video({ embeddable: false }), config)).toContain("not-embeddable");
    expect(checkRules(video({ privacyStatus: "unlisted" }), config)).toContain("not-public");
    expect(checkRules(video({ madeForKids: true }), config)).toContain("made-for-kids");
    expect(checkRules(video({ liveBroadcastContent: "live" }), config)).toContain("live-or-upcoming");
    expect(checkRules(video({ uploadStatus: "uploaded" }), config)).toContain("not-processed");
  });
  it("reads the threshold from the environment", async () => {
    const { configFromEnv } = await import("../src/lib/collector/rules");
    expect(configFromEnv({ VIEW_THRESHOLD: "200000" }).viewThreshold).toBe(200000);
    expect(configFromEnv({ VIEW_THRESHOLD: "nonsense" }).viewThreshold).toBe(10_000_000);
  });
});

describe("toVideo", () => {
  it("turns a videos.list item into facts", () => {
    const v = toVideo({
      id: "2is2o6_Hxe0",
      snippet: { title: "T", channelId: "UC1", channelTitle: "NTO", publishedAt: "2026-09-30T10:00:00Z", liveBroadcastContent: "none", tags: ["melodic techno"] },
      contentDetails: { duration: "PT2H3M36S" },
      statistics: { viewCount: "66693" },
      status: { embeddable: true, privacyStatus: "public", madeForKids: false, uploadStatus: "processed" },
    })!;
    expect(v.durationSeconds).toBe(7416);
    expect(v.viewCount).toBe(66693);
    expect(v.tags).toEqual(["melodic techno"]);
    expect(checkRules(v, { ...config, viewThreshold: 0 })).toEqual([]);
  });
  it("treats missing status as not allowed", () => {
    const v = toVideo({ id: "x", snippet: {}, contentDetails: {}, statistics: {} })!;
    expect(v.embeddable).toBe(false);
    expect(checkRules(v, config)).toContain("not-public");
  });
});

describe("genresInText", () => {
  it("finds our genres in titles, descriptions and hashtags", () => {
    expect(genresInText("Thrash Metal live 1986")).toEqual(["metal"]);
    expect(genresInText("", "", ["#grunge", "seattle"])).toEqual(["grunge"]);
    expect(genresInText("Post-punk legends live")).toEqual(["post-punk"]);
    expect(genresInText("post punk and punk rock night")).toEqual(["punk", "post-punk"]);
    expect(genresInText("Best of Drum and Bass")).toEqual([]); // not on our list
  });
  it("does not match words inside other words", () => {
    expect(genresInText("Metallica live", "punkish")).toEqual([]);
    expect(genresInText("Indiepop", "emotional")).toEqual([]);
  });
  it("does not count genres that are not on our list", () => {
    expect(genresInText("Live at the Hard Rock Cafe")).toEqual([]);
    expect(genresInText("Pop punk all-dayer")).toEqual([]);
    expect(genresInText("Techno and house night")).toEqual([]);
  });
});

describe("isElectronicGenreList (MusicBrainz)", () => {
  it("recognises electronic genres", () => {
    expect(isElectronicGenreList(["melodic techno", "french"])).toBe(true);
    expect(isElectronicGenreList(["electronic"])).toBe(true);
  });
  it("rejects other music", () => {
    expect(isElectronicGenreList(["rock", "indie", "folk"])).toBe(false);
    expect(isElectronicGenreList([])).toBe(false);
  });
});

describe("decide", () => {
  const base: DecisionInput = {
    channelKind: "ELECTRONIC_ONLY",
    classification: { isFullConcert: true, isElectronic: true, confidence: 0.9, genres: ["Melodic Techno"], mainArtists: ["NTO"] },
    textGenres: [],
    artistGenres: null,
  };
  const with_ = (patch: Partial<DecisionInput>, cls: Partial<DecisionInput["classification"]> = {}) =>
    decide({ ...base, ...patch, classification: { ...base.classification, ...cls } }, config);

  it("accepts a confident electronic concert on an electronic-only channel", () => {
    expect(with_({}).verdict).toBe("ACCEPTED");
    expect(with_({ channelKind: "ARTIST" }).verdict).toBe("ACCEPTED");
  });
  it("needs two independent signals on mixed channels and for fan uploads", () => {
    expect(with_({ channelKind: "MIXED" }).verdict).toBe("UNCERTAIN");
    expect(with_({ channelKind: "UNKNOWN" }).verdict).toBe("UNCERTAIN");
    expect(with_({ channelKind: "MIXED", textGenres: ["Techno"] }).verdict).toBe("ACCEPTED");
    expect(with_({ channelKind: "UNKNOWN", artistGenres: ["techno"] }).verdict).toBe("ACCEPTED");
  });
  it("does not count a namesake's genres or other music as a signal", () => {
    expect(with_({ channelKind: "MIXED", artistGenres: ["hip hop"] }).verdict).toBe("UNCERTAIN");
  });
  it("other signals cannot outvote a doubtful classifier", () => {
    const d = with_({ channelKind: "MIXED", textGenres: ["Techno"], artistGenres: ["techno"] }, { confidence: 0.5 });
    expect(d.verdict).toBe("UNCERTAIN");
  });
  it("rejects clips and non-electronic concerts only when the classifier is sure", () => {
    expect(with_({}, { isFullConcert: false }).verdict).toBe("NOT_A_SET");
    expect(with_({}, { isFullConcert: false, confidence: 0.4 }).verdict).toBe("UNCERTAIN");
    expect(with_({}, { isElectronic: false }).verdict).toBe("NOT_ELECTRONIC");
  });
  it("keeps out concerts with no genre of ours or no identified artist", () => {
    expect(with_({}, { genres: [] }).verdict).toBe("UNCERTAIN");
    expect(with_({}, { mainArtists: [] }).verdict).toBe("UNCERTAIN");
  });
  it("respects the confidence threshold exactly", () => {
    expect(with_({}, { confidence: 0.75 }).verdict).toBe("ACCEPTED");
    expect(with_({}, { confidence: 0.74 }).verdict).toBe("UNCERTAIN");
  });
});

describe("de-duplication", () => {
  const official: ConcertIdentity = {
    youtubeId: "OFFICIAL000",
    artistSlugs: ["nto"],
    venueName: "Tour Saint-Jacques",
    publishedAt: new Date("2017-09-26"),
    durationSeconds: 5140,
    isOfficial: true,
    channelId: "UCcercle",
  };
  it("same artist, same venue, same year is the same concert", () => {
    expect(isSameConcert(official, { ...official, youtubeId: "FAN00000000", venueName: "Cercle - Tour Saint-Jacques", publishedAt: new Date("2018-01-10"), durationSeconds: 5000, isOfficial: false, channelId: "UCfan" })).toBe(true);
    expect(isSameConcert(official, { ...official, youtubeId: "SAME0000000", publishedAt: new Date("2017-10-20") })).toBe(true);
  });
  it("a re-upload with the same length is the same concert even if the venue is not named", () => {
    expect(isSameConcert(official, { ...official, youtubeId: "FAN00000000", venueName: null, publishedAt: new Date("2019-03-01"), durationSeconds: 5180, channelId: "UCfan" })).toBe(true);
  });
  it("the same festival channel a year later is a new show, even with the same slot length", () => {
    const tml = { ...official, artistSlugs: ["swedish-house-mafia"], venueName: "Tomorrowland", publishedAt: new Date("2024-08-01"), durationSeconds: 3600, channelId: "UCtml" };
    expect(isSameConcert(tml, { ...tml, youtubeId: "TML20250000", publishedAt: new Date("2025-08-05"), durationSeconds: 3620 })).toBe(false);
    expect(isSameConcert(tml, { ...tml, youtubeId: "TWORLD00000", venueName: "TomorrowWorld", publishedAt: new Date("2023-10-01"), durationSeconds: 3590 })).toBe(false);
  });
  it("a solo concert and a b2b, or weekend 1 and weekend 2, are different shows; the same recording posted twice is one", () => {
    const solo = { ...official, artistSlugs: ["steve-aoki"], venueName: "Tomorrowland", publishedAt: new Date("2019-07-25"), durationSeconds: 3600, channelId: "UCtml" };
    expect(isSameConcert(solo, { ...solo, youtubeId: "B2B00000000", artistSlugs: ["dimitri-vegas-and-like-mike", "steve-aoki"], publishedAt: new Date("2019-07-28") })).toBe(false);
    expect(isSameConcert(solo, { ...solo, youtubeId: "WEEKEND2000", publishedAt: new Date("2019-08-02"), durationSeconds: 3500 })).toBe(false);
    expect(isSameConcert(solo, { ...solo, youtubeId: "HQVERSION00", publishedAt: new Date("2019-08-02"), durationSeconds: 3610 })).toBe(true);
  });
  it("two shows at different venues are different even with the same 2-hour length", () => {
    const tml = { ...official, artistSlugs: ["solomun"], venueName: "Tomorrowland", publishedAt: new Date("2018-08-01"), durationSeconds: 7200, channelId: "UCtml" };
    expect(isSameConcert(tml, { ...tml, youtubeId: "CERCLE00000", venueName: "Chambord", publishedAt: new Date("2019-05-17"), durationSeconds: 7210, channelId: "UCcercle" })).toBe(false);
  });
  it("different artists, or the same artist at another show, are different concerts", () => {
    expect(isSameConcert(official, { ...official, youtubeId: "OTHER000000", artistSlugs: ["marsh"] })).toBe(false);
    expect(isSameConcert(official, { ...official, youtubeId: "OTHER000000", venueName: "Spectra Festival", durationSeconds: 7416 })).toBe(false);
    expect(isSameConcert(official, { ...official, youtubeId: "OTHER000000", publishedAt: new Date("2021-01-01"), durationSeconds: 3000 })).toBe(false);
  });
  it("keeps the official upload", () => {
    const fan = { ...official, youtubeId: "FAN00000000", isOfficial: false };
    expect(resolveDuplicate(fan, official)).toBe("replace-existing");
    expect(resolveDuplicate(official, fan)).toBe("keep-existing");
    expect(resolveDuplicate(official, { ...official, youtubeId: "OFFICIAL001" })).toBe("keep-existing");
  });
});

describe("refresh (30-day rule)", () => {
  const ok = { embeddable: true, privacyStatus: "public", blockedIn: [] as string[] };
  it("hides concerts YouTube no longer lets us show, instead of deleting them", () => {
    expect(refreshAction(null)).toEqual({ action: "remove", reason: "deleted from YouTube" });
    expect(refreshAction({ ...ok, privacyStatus: "private" }).action).toBe("remove");
    expect(refreshAction({ ...ok, embeddable: false }).action).toBe("remove");
    expect(refreshAction({ ...ok, blockedIn: ["DE"] })).toEqual({ action: "remove", reason: "blocked in DE" });
    expect(refreshAction(ok).action).toBe("update");
  });
  it("brings a removed concert back when its video returns, but never one the owner hid", () => {
    expect(statusAfterRefresh("PUBLISHED", "remove")).toBe("REMOVED");
    expect(statusAfterRefresh("REMOVED", "remove")).toBe("REMOVED");
    expect(statusAfterRefresh("REMOVED", "update")).toBe("PUBLISHED");
    expect(statusAfterRefresh("PUBLISHED", "update")).toBe("PUBLISHED");
    expect(statusAfterRefresh("HIDDEN", "update")).toBe("HIDDEN");
    expect(statusAfterRefresh("HIDDEN", "remove")).toBe("HIDDEN");
  });
  it("refreshes well inside 30 days", () => {
    const now = new Date("2026-12-06T00:00:00Z");
    expect(isDueForRefresh(new Date("2026-11-11T00:00:00Z"), now)).toBe(true); // 25 days
    expect(isDueForRefresh(new Date("2026-11-20T00:00:00Z"), now)).toBe(false);
  });
});

describe("YouTubeClient error handling", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  it("retries YouTube's temporary 503 errors", async () => {
    const { YouTubeClient } = await import("../src/lib/collector/youtube");
    let calls = 0;
    const fetchFn = (async () => (++calls < 3 ? new Response("busy", { status: 503 }) : ok({ items: [] }))) as typeof fetch;
    const yt = new YouTubeClient("key", 100, fetchFn, 1);
    expect((await yt.videos(["AAAAAAAAAAA"])).size).toBe(0);
    expect(calls).toBe(3);
  });
  it("skips a batch that keeps failing instead of stopping the whole run", async () => {
    const { YouTubeClient } = await import("../src/lib/collector/youtube");
    const fetchFn = (async () => new Response("down", { status: 503 })) as typeof fetch;
    const yt = new YouTubeClient("key", 100, fetchFn, 1);
    expect((await yt.videos(["AAAAAAAAAAA"])).size).toBe(0);
    expect(yt.skippedBatches).toBe(1);
  });
  it("in refresh mode, stops on errors so no concert is deleted by mistake", async () => {
    const { YouTubeClient } = await import("../src/lib/collector/youtube");
    const fetchFn = (async () => new Response("down", { status: 503 })) as typeof fetch;
    const yt = new YouTubeClient("key", 100, fetchFn, 1);
    yt.failFast = true;
    await expect(yt.videos(["AAAAAAAAAAA"])).rejects.toThrow(/503/);
  });
  it("treats a used-up daily quota as a clean stop", async () => {
    const { QuotaBudgetExceeded, YouTubeClient } = await import("../src/lib/collector/youtube");
    const fetchFn = (async () => new Response('{"error":{"errors":[{"reason":"quotaExceeded"}]}}', { status: 403 })) as typeof fetch;
    const yt = new YouTubeClient("key", 100, fetchFn, 1);
    await expect(yt.videos(["AAAAAAAAAAA"])).rejects.toBeInstanceOf(QuotaBudgetExceeded);
  });
});

describe("needsClassification (never pay twice)", () => {
  it("skips videos with a stored answer or already waiting in a batch", async () => {
    const { needsClassification } = await import("../src/lib/collector/cache");
    expect(needsClassification(["a", "b", "c", "d"], new Set(["a"]), new Set(["c"]))).toEqual(["b", "d"]);
  });
  it("changes fingerprint when the rules change", async () => {
    const { PROMPT_VERSION } = await import("../src/lib/collector/classify");
    expect(PROMPT_VERSION).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("owner-approved artists", () => {
  const rules = [
    { name: "Fred again..", genres: ["indie", "alternative"] },
    { name: "Yousuke Yukimatsu", aka: ["¥ØU$UK€ ¥UK1MAT$U"], genres: ["indie", "garage", "Disco"] },
  ];
  it("matches names ignoring case, punctuation and stylised spellings", async () => {
    const { findArtistRule } = await import("../src/lib/collector/rules");
    expect(findArtistRule(["fred again"], rules)?.name).toBe("Fred again..");
    expect(findArtistRule(["¥ØU$UK€ ¥UK1MAT$U"], rules)?.name).toBe("Yousuke Yukimatsu");
    expect(findArtistRule(["Someone Else"], rules)).toBeNull();
  });
  it("keeps the classifier's genres, else uses the owner's (only those on our list)", async () => {
    const { genresForApprovedArtist } = await import("../src/lib/collector/rules");
    expect(genresForApprovedArtist(["grunge"], rules[0])).toEqual(["grunge"]);
    expect(genresForApprovedArtist([], rules[1])).toEqual(["indie", "garage"]);
  });
  it("a group name that is not an artist is credited to each member", async () => {
    const { expandGroups } = await import("../src/lib/collector/rules");
    const groups = [{ name: "3 Are Legend", members: ["Dimitri Vegas & Like Mike", "Steve Aoki"] }];
    expect(expandGroups(["3 Are Legend"], groups)).toEqual(["Dimitri Vegas & Like Mike", "Steve Aoki"]);
    expect(expandGroups(["Steve Aoki", "3 are legend"], groups)).toEqual(["Steve Aoki", "Dimitri Vegas & Like Mike"]);
    expect(expandGroups(["NTO"], groups)).toEqual(["NTO"]);
  });
  it("accepts a full concert by an approved artist on any channel, but never a clip", () => {
    const base = {
      channelKind: "MIXED" as const,
      ownerApproved: true,
      classification: { isFullConcert: true, isElectronic: false, confidence: 0.5, genres: ["Tech House"], mainArtists: ["Honey Dijon"] },
      textGenres: [],
      artistGenres: null,
    };
    expect(decide(base, config).verdict).toBe("ACCEPTED");
    expect(decide({ ...base, classification: { ...base.classification, isFullConcert: false, confidence: 0.9 } }, config).verdict).toBe("NOT_A_SET");
    expect(decide({ ...base, classification: { ...base.classification, genres: [] } }, config).verdict).toBe("UNCERTAIN");
  });
});

describe("artist profiles", () => {
  it("reads the JSON answer even with text around it", async () => {
    const { parseProfile } = await import("../src/lib/collector/profiles");
    const p = parseProfile(
      'Here it is: {"origin":"Antwerp, Belgium","bornYear":1990,"style":"techno DJ","bio":"Belgian techno DJ and producer known for fast, hard-hitting concerts and her own label.","confident":true,"sources":["https://example.org"]} done',
    );
    expect(p.origin).toBe("Antwerp, Belgium");
    expect(p.bornYear).toBe(1990);
  });
  it("rejects answers without a usable bio or with an impossible birth year", async () => {
    const { parseProfile } = await import("../src/lib/collector/profiles");
    expect(() => parseProfile("no json here")).toThrow();
    expect(() => parseProfile('{"origin":"","bornYear":1700,"style":"","bio":"Too short","confident":true,"sources":[]}')).toThrow();
  });
});

describe("channel names and catalogue artists", () => {
  it("matches channel names ignoring accents and punctuation", async () => {
    const { channelMatches } = await import("../src/lib/collector/rules");
    expect(channelMatches("Hï Ibiza", "hi ibiza")).toBe(true);
    expect(channelMatches("Be-At.TV", "be-at")).toBe(true);
    expect(channelMatches("Sónar Festival", "sonar")).toBe(true);
    expect(channelMatches("Tale Of Us", "afterlife")).toBe(false);
  });
  it("falls back to the artist's genres on the site when the classifier gives none of ours", async () => {
    const { genresWithFallback } = await import("../src/lib/collector/rules");
    expect(genresWithFallback(["metal"], ["punk"])).toEqual(["metal"]);
    expect(genresWithFallback([], ["punk", "metal", "grunge", "indie"])).toEqual(["punk", "metal", "grunge"]);
    expect(genresWithFallback([], [])).toEqual([]);
  });
});

describe("region check (ES, IT, GB, US, DE)", () => {
  it("reads YouTube's blocked and allowed lists", () => {
    expect(blockedRegions(undefined)).toEqual([]);
    expect(blockedRegions({ blocked: ["FR", "DE"] })).toEqual(["DE"]);
    expect(blockedRegions({ blocked: ["FR"] })).toEqual([]);
    // An allowed list that leaves a key country out blocks it there.
    expect(blockedRegions({ allowed: ["NL", "BE", "DE"] })).toEqual(["ES", "IT", "GB", "US"]);
    expect(blockedRegions({ allowed: ["ES", "IT", "GB", "US", "DE", "FR"] })).toEqual([]);
  });
  it("keeps a region-blocked video out, as something that can change", () => {
    const failures = checkRules(video({ blockedIn: ["GB"] }), DEFAULT_CONFIG);
    expect(failures).toContain("region-blocked");
    expect(worthRemembering(["region-blocked"])).toBe(true);
  });
  it("reads the restriction from a videos.list item", () => {
    const item = {
      id: "IA9xKr_Dmek",
      snippet: { title: "x", channelId: "c", channelTitle: "c", publishedAt: "2021-01-01T00:00:00Z" },
      contentDetails: { duration: "PT2H27M", regionRestriction: { blocked: ["IT"] } },
      statistics: { viewCount: "10" },
      status: { embeddable: true, privacyStatus: "public", madeForKids: false, uploadStatus: "processed" },
    };
    expect(toVideo(item)?.blockedIn).toEqual(["IT"]);
  });
});
