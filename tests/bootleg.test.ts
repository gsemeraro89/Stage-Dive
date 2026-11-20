// Fan uploads ("bootlegs", owner 20 Nov 2026): free filters, shot type, verdict, one video per concert,
// official wins. Pure tests: no YouTube, Claude or database.
import { describe, expect, it } from "vitest";
import {
  bootlegTitleDrop,
  bootlegVerdict,
  compareBootlegs,
  concertKey,
  decideShotType,
  groupByConcert,
  listedVersionOf,
  normalVenue,
  pickBestPerConcert,
  sameConcert,
  type BootlegAnswer,
  type BootlegItem,
  type ExistingConcert,
} from "../src/lib/collector/bootleg";
import { BootlegAnswerSchema, LANE_BOOTLEG_VERSION, LANE_CLASSIFY_VERSION, laneRequestParams, parseLaneAnswer, promptVersionOf } from "../src/lib/collector/haiku";
import type { YouTubeVideo } from "../src/lib/collector/youtube";

describe("bootleg free filters", () => {
  it.each([
    ["Metallica - Full Album (Master of Puppets)", "full album"],
    ["Foo Fighters documentary 2011", "documentary"],
    ["Nirvana interview + live 1991", "interview"],
    ["The Cure - Best of live", "best of"],
    ["Queen live compilation 1975-1986", "compilation"],
    ["Reaction: Iron Maiden live in Rio", "reaction"],
    ["Metallica tribute band live 2019", "tribute"],
    ["Pearl Jam cover band - live at the Rex", "cover"],
    ["Pearl Jam Coverband live at the Rex", "cover band"],
    ["Bon Jovi karaoke night", "karaoke"],
    ["Rush - Moving Pictures album stream", "album stream"],
    ["Iron Maiden - Live 2016 (drum cam)", "instrument cam"],
    ["Linkin Park rehearsal 2017", "rehearsal"],
    ["Muse soundcheck Wembley", "rehearsal"],
    ["Daft Punk vs AC/DC megamix", "remix"],
    ["The Smiths - Lyrics compilation", "lyrics"],
  ])("drops %s (%s)", (title, word) => {
    expect(bootlegTitleDrop(title)).toBe(word);
  });

  it.each([
    "Metallica - Live in Moscow 1991 (Full Concert, pro-shot)",
    "The Cure - Rockpalast 1980",
    "Nirvana - Live at Reading 1992 [AUD]",
    "Queen Live at Wembley 1986 FULL CONCERT",
    "Iron Maiden plays the album live, Rock in Rio 2001",
  ])("keeps %s for Claude", (title) => {
    expect(bootlegTitleDrop(title)).toBeNull();
  });
});

describe("shot type rules", () => {
  it("Claude's PRO_SHOT stands, unless the title says audience and names no broadcaster", () => {
    expect(decideShotType("PRO_SHOT", "Metallica - Seattle 1989 full concert")).toBe("PRO_SHOT");
    expect(decideShotType("PRO_SHOT", "Metallica live 2017 front row (iPhone)")).toBe("AUDIENCE");
    expect(decideShotType("PRO_SHOT", "Metallica - Rockpalast 1983 (not audience)")).toBe("PRO_SHOT");
  });

  it("audience and audio-only answers are kept", () => {
    expect(decideShotType("AUDIENCE", "Pearl Jam - MTV Unplugged")).toBe("AUDIENCE");
    expect(decideShotType("AUDIO_ONLY", "Pearl Jam - live 1992")).toBe("AUDIO_ONLY");
  });

  it("audio-only words in the title win over Claude", () => {
    expect(decideShotType("PRO_SHOT", "Led Zeppelin - BBC Sessions FM broadcast 1971")).toBe("AUDIO_ONLY");
    expect(decideShotType("PRO_SHOT", "Rush - Live in Toronto 1976 [AUDIO]")).toBe("AUDIO_ONLY");
    expect(decideShotType("UNKNOWN", "The Cure - Radio Show 1985")).toBe("AUDIO_ONLY");
    // "audio" alone is not audio only: remastered sound over a filmed show
    expect(decideShotType("PRO_SHOT", "Queen - Live Aid 1985 (remastered audio)")).toBe("PRO_SHOT");
  });

  it("an unsure Claude counts as pro-shot only with a broadcaster or pro word in the title", () => {
    expect(decideShotType("UNKNOWN", "The Police - Rockpalast 1980")).toBe("PRO_SHOT");
    expect(decideShotType("UNKNOWN", "Iron Maiden - Rock in Rio 2001 multicam")).toBe("PRO_SHOT");
    expect(decideShotType("UNKNOWN", "Oasis - Knebworth 1996 BBC TV broadcast")).toBe("PRO_SHOT");
    expect(decideShotType("UNKNOWN", "Oasis - Knebworth 1996")).toBe("UNKNOWN");
    expect(decideShotType("UNKNOWN", "Oasis - BBC 1994 audience recording")).toBe("UNKNOWN");
  });

  it("words match whole words only", () => {
    expect(decideShotType("UNKNOWN", "Smashing Pumpkins - Smarte Show 1996")).toBe("UNKNOWN"); // not "arte"
    expect(decideShotType("PRO_SHOT", "Saxophone night: The Psychedelic Furs live 1984")).toBe("PRO_SHOT"); // not "phone"
  });
});

const answer = (over: Partial<BootlegAnswer> = {}): BootlegAnswer => ({
  isConcert: true,
  notConcertReason: "",
  complete: true,
  shotType: "PRO_SHOT",
  shotEvidence: "Rockpalast",
  mainArtist: "The Police",
  venue: "Grugahalle",
  city: "Essen",
  country: "Germany",
  venueKind: "Room",
  performed: "1980-04-19",
  confidence: 0.9,
  ...over,
});
const ctx = { onList: true, excluded: false, minConfidence: 0.75 };
const title = "The Police - Rockpalast 1980 full concert";

describe("bootleg verdict", () => {
  it("accepts a complete, pro-shot, dated concert of a listed band", () => {
    expect(bootlegVerdict(answer(), title, ctx).verdict).toBe("PRO_SHOT_COMPLETE");
  });

  it.each([
    [{ isConcert: false, notConcertReason: "compilation" }, ctx, "NOT_A_CONCERT"],
    [{}, { ...ctx, onList: false }, "OTHER_ARTIST"],
    [{}, { ...ctx, excluded: true }, "EXCLUDED"],
    [{ venue: "Live from home", venueKind: "Livestream" }, ctx, "HOME_OR_ONLINE"],
    [{ venue: "", city: "", venueKind: "Livestream" }, ctx, "HOME_OR_ONLINE"],
    [{ shotType: "AUDIO_ONLY" as const }, ctx, "AUDIO_ONLY"],
    [{ shotType: "AUDIENCE" as const }, ctx, "AUDIENCE"],
    [{ complete: false }, ctx, "PARTIAL"],
    [{ shotType: "UNKNOWN" as const }, ctx, "PRO_SHOT_COMPLETE"], // "Rockpalast" in the title rescues it
    [{ performed: "" }, ctx, "NO_DATE"],
    [{ confidence: 0.5 }, ctx, "UNCERTAIN"],
  ])("%j -> %s", (over, c, verdict) => {
    expect(bootlegVerdict(answer(over), title, c).verdict).toBe(verdict);
  });

  it("an unsure shot type without a pro word stays out", () => {
    expect(bootlegVerdict(answer({ shotType: "UNKNOWN" }), "The Police - Essen 1980 full concert", ctx).verdict).toBe("UNKNOWN_SHOT");
  });

  it("a partial audience video counts as audience (how it was filmed comes first)", () => {
    expect(bootlegVerdict(answer({ shotType: "AUDIENCE", complete: false }), title, ctx).verdict).toBe("AUDIENCE");
  });
});

const item = (over: Partial<BootlegItem> = {}): BootlegItem => ({
  youtubeId: "aaaaaaaaaaa",
  artist: "The Police",
  title: "The Police - Rockpalast 1980",
  channelId: "UCfan1",
  channelTitle: "Fan 1",
  durationSeconds: 5400,
  viewCount: 1000,
  publishedAt: new Date("2015-01-01T00:00:00Z"),
  shotType: "PRO_SHOT",
  complete: true,
  venue: "Grugahalle",
  city: "Essen",
  performed: "1980-04-19",
  ...over,
});

describe("concert identity", () => {
  it("normalises venue names", () => {
    expect(normalVenue("Rock in Rio 1985")).toBe("rock-rio");
    expect(normalVenue("The Rock in Rio Festival")).toBe("rock-rio");
    expect(normalVenue("Wembley Stadium")).toBe("wembley-stadium");
  });

  it("same band, year, venue (loosely) -> same concert", () => {
    expect(sameConcert(concertKey(item()), concertKey(item({ venue: "Grugahalle Essen", performed: "1980" })))).toBe(true);
    expect(sameConcert(concertKey(item({ venue: "Wembley" })), concertKey(item({ venue: "Wembley Stadium" })))).toBe(true);
  });

  it("a different day, year, venue or band -> another concert", () => {
    expect(sameConcert(concertKey(item()), concertKey(item({ performed: "1980-04-20" })))).toBe(false);
    expect(sameConcert(concertKey(item()), concertKey(item({ performed: "1981" })))).toBe(false);
    expect(sameConcert(concertKey(item()), concertKey(item({ venue: "Philipshalle" })))).toBe(false);
    expect(sameConcert(concertKey(item()), concertKey(item({ artist: "Sting" })))).toBe(false);
  });

  it("no venue: the city decides; no place on one side: only the same exact day", () => {
    expect(sameConcert(concertKey(item({ venue: "" })), concertKey(item({ venue: "", performed: "1980" })))).toBe(true);
    expect(sameConcert(concertKey(item({ venue: "" })), concertKey(item({ venue: "", city: "Dortmund" })))).toBe(false);
    expect(sameConcert(concertKey(item({ venue: "", city: "" })), concertKey(item()))).toBe(true);
    expect(sameConcert(concertKey(item({ venue: "", city: "", performed: "1980" })), concertKey(item({ performed: "1980" })))).toBe(false);
  });

  it("never the same without a year", () => {
    expect(sameConcert(concertKey(item({ performed: "" })), concertKey(item({ performed: "" })))).toBe(false);
  });
});

describe("one video per concert", () => {
  it("orders pro-shot, then complete, then longest, then most viewed", () => {
    const a = item({ youtubeId: "a", shotType: "UNKNOWN", durationSeconds: 9000 });
    const b = item({ youtubeId: "b", complete: false, durationSeconds: 9000 });
    const c = item({ youtubeId: "c", durationSeconds: 5000, viewCount: 9_000_000 });
    const d = item({ youtubeId: "d", durationSeconds: 5400, viewCount: 10 });
    const e = item({ youtubeId: "e", durationSeconds: 5400, viewCount: 500 });
    expect([a, b, c, d, e].sort(compareBootlegs).map((x) => x.youtubeId)).toEqual(["e", "d", "c", "b", "a"]);
  });

  it("groups copies of the same show and keeps the best", () => {
    const items = [
      item({ youtubeId: "short", durationSeconds: 4800, viewCount: 50_000 }),
      item({ youtubeId: "long", durationSeconds: 5600, viewCount: 2_000 }),
      item({ youtubeId: "yearonly", performed: "1980", durationSeconds: 5000 }),
      item({ youtubeId: "other", venue: "Hammersmith Odeon", city: "London", performed: "1979-12-22" }),
      item({ youtubeId: "sting", artist: "Sting" }),
    ];
    const picked = pickBestPerConcert(items);
    expect(picked).toHaveLength(3);
    const police = picked.find((p) => p.best.youtubeId === "long")!;
    expect(police.collapsed.map((x) => x.youtubeId).sort()).toEqual(["short", "yearonly"]);
    expect(groupByConcert(items).map((g) => g.length).sort()).toEqual([1, 1, 3]);
  });

  it("follows links through: A~B and B~C are one concert", () => {
    const a = item({ youtubeId: "a", venue: "", city: "Essen", performed: "1980" });
    const b = item({ youtubeId: "b", venue: "", city: "Essen", performed: "1980-04-19" });
    const c = item({ youtubeId: "c", venue: "", city: "", performed: "1980-04-19" });
    expect(groupByConcert([a, b, c])).toHaveLength(1);
  });
});

describe("an official version always wins", () => {
  const official = (over: Partial<ExistingConcert> = {}): ExistingConcert => ({
    youtubeId: "official001",
    slug: "the-police-rockpalast-1980",
    artists: ["The Police"],
    venue: "Grugahalle",
    city: "Essen",
    performedYear: 1980,
    performedOn: new Date("1980-04-19T00:00:00Z"),
    durationSeconds: 5000,
    publishedAt: new Date("2021-06-01T00:00:00Z"),
    channelId: "UCrockpalast",
    isOfficial: true,
    ...over,
  });

  it("drops a fan upload of a concert that is already listed officially", () => {
    expect(listedVersionOf(item(), [official()])?.slug).toBe("the-police-rockpalast-1980");
  });

  it("also against a listed fan upload (never two copies)", () => {
    expect(listedVersionOf(item(), [official({ isOfficial: false })])?.isOfficial).toBe(false);
  });

  it("keeps a fan upload of another concert of the same band", () => {
    expect(listedVersionOf(item(), [official({ performedYear: 1983, performedOn: null, venue: "Loreley" })])).toBeNull();
    expect(listedVersionOf(item(), [official({ artists: ["Sting"] })])).toBeNull();
  });

  it("catches the same recording posted again (collector duplicate rule) when the listing has no venue", () => {
    const listed = official({ venue: null, city: null, performedYear: null, performedOn: null, durationSeconds: 5430, publishedAt: new Date("2015-06-01T00:00:00Z") });
    expect(listedVersionOf(item({ durationSeconds: 5400 }), [listed])).not.toBeNull();
    // ...but not when the years disagree
    expect(listedVersionOf(item({ durationSeconds: 5400 }), [{ ...listed, performedYear: 1983 }])).toBeNull();
  });
});

describe("Haiku bootleg pass", () => {
  const video: YouTubeVideo = {
    youtubeId: "vid00000001",
    title: "The Police - Rockpalast 1980",
    durationSeconds: 5400,
    viewCount: 1000,
    embeddable: true,
    privacyStatus: "public",
    madeForKids: false,
    liveBroadcastContent: "none",
    uploadStatus: "processed",
    blockedIn: [],
    channelId: "UCfan1",
    channelTitle: "Fan 1",
    description: "Grugahalle Essen 19.4.1980",
    tags: [],
    publishedAt: new Date("2015-01-01T00:00:00Z"),
  };

  it("has its own prompt version, so answers are cached apart from the lane's", () => {
    expect(promptVersionOf("bootleg")).toBe(LANE_BOOTLEG_VERSION);
    expect(LANE_BOOTLEG_VERSION).toMatch(/^bootleg-/);
    expect(LANE_BOOTLEG_VERSION).not.toBe(LANE_CLASSIFY_VERSION);
  });

  it("caches the fixed instructions and sends the video as data", () => {
    const params = laneRequestParams("bootleg", video, {});
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.system[0].text.length / 3.5).toBeGreaterThan(512); // long enough to be cached on Haiku 5.5
    expect(params.messages[0].content).toContain("Rockpalast 1980");
  });

  it("parses and checks an answer", () => {
    const parsed = parseLaneAnswer("bootleg", [{ type: "text", text: JSON.stringify(answer()) }]);
    expect(BootlegAnswerSchema.parse(parsed).shotType).toBe("PRO_SHOT");
    expect(() => parseLaneAnswer("bootleg", [{ type: "text", text: JSON.stringify({ ...answer(), shotType: "VHS" }) }])).toThrow();
  });
});
