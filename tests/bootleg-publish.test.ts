// Publishing bootlegs (owner, 20 Nov 2026): official always wins, official twin, hide and restore, official sources
// never bootlegs, fan sources, what is stored. Pure rules; the database side is in tests/bootleg-store.test.ts.
import { describe, expect, it } from "vitest";
import type { BootlegAnswer, ExistingConcert } from "../src/lib/collector/bootleg";
import {
  bootlegClassification,
  bootlegSlug,
  emptyTally,
  isOfficialSource,
  officialTwinOf,
  parseFanSources,
  sameConcertAs,
  sourceLine,
  twinAction,
} from "../src/lib/collector/bootleg-publish";
import { bootlegStatusAfterRefresh, resolveDuplicate, type ConcertIdentity } from "../src/lib/collector/rules";

const concert = (over: Partial<ExistingConcert> = {}): ExistingConcert => ({
  id: 1,
  youtubeId: "official001",
  slug: "nirvana-teatro-castello-1991",
  artists: ["Nirvana"],
  venue: "Teatro Castello",
  city: "Rome",
  performedYear: 1991,
  performedOn: new Date("1991-11-19T00:00:00Z"),
  durationSeconds: 3600,
  publishedAt: new Date("2020-01-01T00:00:00Z"),
  channelId: "UCofficial",
  isOfficial: true,
  bootleg: false,
  ...over,
});
const bootleg = (over: Partial<ExistingConcert> = {}) =>
  concert({ id: 2, youtubeId: "bootleg0001", slug: "nirvana-teatro-castello-1991-bootleg", channelId: "UCfan", isOfficial: false, bootleg: true, durationSeconds: 3400, ...over });

const identity = (over: Partial<ConcertIdentity> = {}): ConcertIdentity => ({
  youtubeId: "a",
  artistSlugs: ["nirvana"],
  venueName: "Teatro Castello",
  publishedAt: new Date("2020-01-01T00:00:00Z"),
  durationSeconds: 3600,
  isOfficial: true,
  channelId: "UCofficial",
  ...over,
});

describe("an official version always wins (resolveDuplicate)", () => {
  it("an official concert arriving later replaces (hides) a listed bootleg", () => {
    expect(resolveDuplicate(identity({ isBootleg: true, isOfficial: false }), identity({ youtubeId: "b" }))).toBe("replace-existing");
  });
  it("even from a channel not marked official (the lane's 'other channel' path)", () => {
    expect(resolveDuplicate(identity({ isBootleg: true, isOfficial: false }), identity({ youtubeId: "b", isOfficial: false }))).toBe("replace-existing");
  });
  it("a bootleg never replaces an official concert, nor a fan concert already listed", () => {
    expect(resolveDuplicate(identity(), identity({ youtubeId: "b", isBootleg: true, isOfficial: false }))).toBe("keep-existing");
    expect(resolveDuplicate(identity({ isOfficial: false }), identity({ youtubeId: "b", isBootleg: true, isOfficial: true }))).toBe("keep-existing");
  });
  it("two bootlegs: the one listed stays", () => {
    expect(resolveDuplicate(identity({ isBootleg: true }), identity({ youtubeId: "b", isBootleg: true }))).toBe("keep-existing");
  });
  it("the rule between official and fan uploads is unchanged", () => {
    expect(resolveDuplicate(identity({ isOfficial: false }), identity({ youtubeId: "b" }))).toBe("replace-existing");
    expect(resolveDuplicate(identity(), identity({ youtubeId: "b", isOfficial: false }))).toBe("keep-existing");
  });
});

describe("the official twin", () => {
  it("same band, year and venue: the official concert is the bootleg's twin", () => {
    expect(sameConcertAs(bootleg(), concert())).toBe(true);
    expect(officialTwinOf(bootleg(), [concert()])?.youtubeId).toBe("official001");
  });
  it("a venue written differently still matches (loosely), the city decides without a venue", () => {
    expect(officialTwinOf(bootleg({ venue: "the Teatro Castello" }), [concert()])).not.toBeNull();
    expect(officialTwinOf(bootleg({ venue: null }), [concert({ venue: null })])).not.toBeNull();
  });
  it("another year, another place or another band is not a twin", () => {
    expect(officialTwinOf(bootleg({ performedYear: 1992, performedOn: null }), [concert()])).toBeNull();
    expect(officialTwinOf(bootleg({ venue: "Palaghiaccio", city: "Marino", performedOn: null }), [concert({ performedOn: null })])).toBeNull();
    expect(officialTwinOf(bootleg({ artists: ["Mudhoney"] }), [concert()])).toBeNull();
  });
  it("another bootleg is never a twin (only official concerts hide a bootleg)", () => {
    expect(officialTwinOf(bootleg(), [bootleg({ youtubeId: "bootleg0002", id: 3 })])).toBeNull();
  });
});

describe("hide and restore (twinAction)", () => {
  it("a published bootleg with an official twin is hidden behind it", () => {
    expect(twinAction({ status: "PUBLISHED", officialTwinId: null, playable: true }, 7)).toEqual({ action: "hide", twinId: 7 });
  });
  it("a bootleg hidden for a twin that is gone comes back while its video plays", () => {
    expect(twinAction({ status: "HIDDEN", officialTwinId: 7, playable: true }, null)).toEqual({ action: "restore" });
    expect(twinAction({ status: "HIDDEN", officialTwinId: 7, playable: false }, null)).toEqual({ action: "keep" });
  });
  it("a bootleg the owner hid, or a removed one, is left alone", () => {
    expect(twinAction({ status: "HIDDEN", officialTwinId: null, playable: true }, null)).toEqual({ action: "keep" });
    expect(twinAction({ status: "HIDDEN", officialTwinId: null, playable: true }, 7)).toEqual({ action: "keep" });
    expect(twinAction({ status: "REMOVED", officialTwinId: null, playable: false }, 7)).toEqual({ action: "keep" });
  });
  it("nothing to do when already hidden behind the same twin, or published with none", () => {
    expect(twinAction({ status: "HIDDEN", officialTwinId: 7, playable: true }, 7)).toEqual({ action: "keep" });
    expect(twinAction({ status: "PUBLISHED", officialTwinId: null, playable: true }, null)).toEqual({ action: "keep" });
  });
  it("the refresh: a bootleg hidden behind its twin becomes REMOVED when its video goes, else stays hidden", () => {
    expect(bootlegStatusAfterRefresh("HIDDEN", "remove", true)).toBe("REMOVED");
    expect(bootlegStatusAfterRefresh("HIDDEN", "update", true)).toBe("HIDDEN");
    expect(bootlegStatusAfterRefresh("HIDDEN", "update", false)).toBe("HIDDEN"); // the owner's choice
    expect(bootlegStatusAfterRefresh("PUBLISHED", "remove", false)).toBe("REMOVED");
    expect(bootlegStatusAfterRefresh("REMOVED", "update", false)).toBe("PUBLISHED");
  });
});

describe("official sources are never bootlegs", () => {
  const listed = [
    { name: "WDR Rockpalast", expect: "rockpalast", kind: "ARCHIVE" },
    { name: "Resurrection Fest", expect: "resurrection fest", kind: "ARCHIVE" },
    { name: "R.E.M. (remhq)", expect: "remhq", kind: "ARTIST" },
    { name: "Metallica", expect: "metallica", kind: "ARTIST" },
  ];
  const ctx = { officialChannelIds: new Set(["UCofficial"]), listed };
  it("a channel marked official in our table, or a band's own channel", () => {
    expect(isOfficialSource({ channelId: "UCofficial", channelTitle: "Anything" }, ctx)).toBe(true);
  });
  it("festival and broadcaster channels of data/channels.json, by name, before their ID is stored", () => {
    expect(isOfficialSource({ channelId: "UCx", channelTitle: "WDR Rockpalast" }, ctx)).toBe(true);
    expect(isOfficialSource({ channelId: "UCx", channelTitle: "Resurrection Fest" }, ctx)).toBe(true);
    expect(isOfficialSource({ channelId: "UCx", channelTitle: "remhq" }, ctx)).toBe(true);
  });
  it("a band's channel only by its exact name: a fan channel named after the band stays a fan channel", () => {
    expect(isOfficialSource({ channelId: "UCx", channelTitle: "Metallica" }, ctx)).toBe(true);
    expect(isOfficialSource({ channelId: "UCx", channelTitle: "metfan4l" }, ctx)).toBe(false);
    expect(isOfficialSource({ channelId: "UCx", channelTitle: "Metallica Bootlegs Forever" }, ctx)).toBe(false);
  });
  it("an ordinary fan channel", () => {
    expect(isOfficialSource({ channelId: "UCfan", channelTitle: "Better Than Nothing Videos" }, ctx)).toBe(false);
  });
});

describe("what is stored for a bootleg", () => {
  const answer: BootlegAnswer = {
    isConcert: true,
    notConcertReason: "",
    complete: true,
    shotType: "PRO_SHOT",
    shotEvidence: "TV broadcast",
    mainArtist: "nirvana",
    venue: " Teatro Castello ",
    city: "Rome",
    country: "Italy",
    venueKind: "Room",
    performed: "1991-11-19",
    confidence: 0.9,
  };
  it("the band of the list (its name and genres), the place and date from the answer, no write-up yet", () => {
    const c = bootlegClassification(answer, { name: "Nirvana", genres: ["grunge", "not-a-genre"] });
    expect(c.mainArtists).toEqual(["Nirvana"]);
    expect(c.genres).toEqual(["grunge"]);
    expect(c.venue).toBe("Teatro Castello");
    expect(c.venueKind).toBe("Room");
    expect(c.performed).toBe("1991-11-19");
    expect(c.uploaderIsOfficial).toBe(false);
    expect(c.writeUp).toBe("");
  });
  it("an unknown kind of place stays Unknown", () => {
    expect(bootlegClassification({ ...answer, venueKind: "Unknown" }, { name: "Nirvana", genres: [] }).venueKind).toBe("Unknown");
  });
  it("its address ends in -bootleg, so the official version keeps the plain one", () => {
    expect(bootlegSlug("nirvana-teatro-castello-1991")).toBe("nirvana-teatro-castello-1991-bootleg");
    expect(bootlegSlug("nirvana-teatro-castello-1991-bootleg")).toBe("nirvana-teatro-castello-1991-bootleg");
  });
});

describe("fan sources (data/fan-channels.json)", () => {
  it("reads channels by one of their videos and playlists by ID; malformed entries are skipped and named", () => {
    const { sources, skipped } = parseFanSources({
      channels: [{ name: "Jakeflix", fromVideo: "qwXjtba57YQ" }, { name: "Broken", fromVideo: "nope" }],
      playlists: [{ name: "Owner list", playlistId: "PL9760EA8B9633FCC0" }, { name: "Bad list", playlistId: "x" }],
    });
    expect(sources).toEqual([
      { kind: "channel", name: "Jakeflix", fromVideo: "qwXjtba57YQ" },
      { kind: "playlist", name: "Owner list", playlistId: "PL9760EA8B9633FCC0" },
    ]);
    expect(skipped).toEqual(["Broken", "Bad list"]);
  });
  it("the shipped file parses whole: 31 fan channels and the owner's playlist", async () => {
    const { readFileSync } = await import("node:fs");
    const { sources, skipped } = parseFanSources(JSON.parse(readFileSync("data/fan-channels.json", "utf8")));
    expect(skipped).toEqual([]);
    expect(sources.filter((s) => s.kind === "channel")).toHaveLength(31);
    expect(sources.filter((s) => s.kind === "playlist").map((s) => (s.kind === "playlist" ? s.playlistId : ""))).toEqual(["PL9760EA8B9633FCC0"]);
  });
  it("one report line per source", () => {
    const t = { ...emptyTally("channel: Jakeflix"), videosRead: 120, longVideos: 30, sentToClaude: 25, proShotComplete: 4, bootlegs: 3 };
    expect(sourceLine(t)).toBe("channel: Jakeflix | read 120 / long 30 / official 0 / sent to Claude 25 / pro-shot complete 4 / bootlegs 3");
  });
});
