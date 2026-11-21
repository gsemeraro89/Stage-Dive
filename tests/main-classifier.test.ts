// The main collector on Haiku (owner, 20 Nov 2026): when Opus gives a second opinion, which answer counts,
// write-ups for accepted concerts, the --reconsider scope, and channels whose uploads list YouTube does not return.
import { describe, expect, it } from "vitest";
import type { FullClassification } from "../src/lib/collector/classify";
import type { LaneClassification } from "../src/lib/collector/haiku";
import { DEFAULT_MAIN_CLASSIFIER, mainClassifierMode, needsOpus, needsWriteUp, pickAnswer, type SecondOpinionInput } from "../src/lib/collector/main-classifier";
import { keepForReconsider, reconsiderScope } from "../src/lib/collector/reconsider";
import { decide, DEFAULT_CONFIG } from "../src/lib/collector/rules";
import { toDecisionInput } from "../src/lib/collector/classify";
import { PlaylistNotFound, QuotaBudgetExceeded, YouTubeClient } from "../src/lib/collector/youtube";

const haikuAnswer = (over: Partial<LaneClassification> = {}): LaneClassification => ({
  isFullConcert: true,
  notConcertReason: "",
  isRock: true,
  confidence: 0.9,
  mainArtists: ["Massive Attack"],
  collaborators: [],
  venue: "Pinkpop",
  city: "Landgraaf",
  country: "Netherlands",
  venueKind: "Festival",
  performed: "1999",
  genres: ["trip hop"],
  uploaderIsOfficial: true,
  tour: "",
  ...over,
});

const opusAnswer = (over: Partial<FullClassification> = {}): FullClassification => ({
  ...haikuAnswer(),
  collaborators: [],
  writeUp: "Massive Attack bring the Mezzanine tour to Pinkpop in 1999: slow, heavy and loud.",
  ...over,
});

const input = (over: Partial<SecondOpinionInput> = {}): SecondOpinionInput => ({
  mode: "haiku+opus",
  hasOpusAnswer: false,
  haiku: { confidence: 0.9, uploaderIsOfficial: true },
  haikuRefused: false,
  verdict: "ACCEPTED",
  channelKind: "ARCHIVE",
  minConfidence: 0.75,
  ...over,
});

describe("main collector classifier mode", () => {
  it("defaults to Haiku first and Opus for unsure answers", () => {
    expect(DEFAULT_MAIN_CLASSIFIER).toBe("haiku+opus");
    expect(mainClassifierMode(undefined)).toBe("haiku+opus");
    expect(mainClassifierMode("")).toBe("haiku+opus");
    expect(mainClassifierMode(" Haiku ")).toBe("haiku");
    expect(mainClassifierMode("opus")).toBe("opus");
    expect(() => mainClassifierMode("sonnet")).toThrow(/COLLECT_CLASSIFIER/);
  });
});

describe("Opus as a second opinion (haiku+opus)", () => {
  it("leaves a sure Haiku answer alone", () => {
    expect(needsOpus(input())).toBe(false);
    expect(needsOpus(input({ verdict: "NOT_ROCK", haiku: { confidence: 0.95, uploaderIsOfficial: true } }))).toBe(false);
  });
  it("asks Opus below 0.75 confidence, on UNCERTAIN, and when Haiku declined", () => {
    expect(needsOpus(input({ haiku: { confidence: 0.74, uploaderIsOfficial: true } }))).toBe(true);
    expect(needsOpus(input({ haiku: { confidence: 0.75, uploaderIsOfficial: true } }))).toBe(false); // exactly the threshold counts
    expect(needsOpus(input({ verdict: "UNCERTAIN" }))).toBe(true);
    expect(needsOpus(input({ haiku: null, haikuRefused: true, verdict: null }))).toBe(true);
  });
  it("never asks twice, and never for a video with no Haiku answer yet (still in a batch)", () => {
    expect(needsOpus(input({ hasOpusAnswer: true, verdict: "UNCERTAIN" }))).toBe(false);
    expect(needsOpus(input({ haiku: null, verdict: null }))).toBe(false);
  });
  it("does not pay for a second opinion on fan uploads (they only go to the report)", () => {
    expect(needsOpus(input({ channelKind: "UNKNOWN", haiku: { confidence: 0.5, uploaderIsOfficial: false }, verdict: "UNCERTAIN" }))).toBe(false);
    expect(needsOpus(input({ channelKind: "UNKNOWN", haiku: null, haikuRefused: true, verdict: null }))).toBe(false);
    // An uploader Haiku recognises as official (a band's channel found by search) does get one.
    expect(needsOpus(input({ channelKind: "UNKNOWN", haiku: { confidence: 0.5, uploaderIsOfficial: true }, verdict: "UNCERTAIN" }))).toBe(true);
  });
  it("haiku mode never asks Opus; opus mode asks it for every video without an Opus answer", () => {
    expect(needsOpus(input({ mode: "haiku", verdict: "UNCERTAIN", haiku: { confidence: 0.2, uploaderIsOfficial: true } }))).toBe(false);
    expect(needsOpus(input({ mode: "opus", haiku: null, verdict: null }))).toBe(true);
    expect(needsOpus(input({ mode: "opus", hasOpusAnswer: true }))).toBe(false);
  });
  it("a Haiku answer that decide() calls UNCERTAIN gets a second opinion", () => {
    const h = haikuAnswer({ confidence: 0.6 });
    const verdict = decide(
      { channelKind: "ARCHIVE", official: true, classification: toDecisionInput(pickAnswer(undefined, h)!.classification), textGenres: [], artistGenres: null },
      DEFAULT_CONFIG,
    ).verdict;
    expect(verdict).toBe("UNCERTAIN");
    expect(needsOpus(input({ haiku: h, verdict }))).toBe(true);
  });
});

describe("which answer counts (stored answers are never paid for twice)", () => {
  it("Opus's answer wins over Haiku's; Haiku's is used when it is the only one", () => {
    const o = opusAnswer({ confidence: 0.99 });
    expect(pickAnswer(o, haikuAnswer())).toEqual({ from: "opus", classification: o });
    const h = pickAnswer(undefined, haikuAnswer({ collaborators: ["Horace Andy"] }))!;
    expect(h.from).toBe("haiku");
    expect(h.classification.writeUp).toBe("");
    expect(h.classification.uploaderIsOfficial).toBe(true);
    expect(h.classification.collaborators).toEqual([{ name: "Horace Andy", note: "" }]);
    expect(pickAnswer(undefined, undefined)).toBeNull();
  });
});

describe("write-ups for accepted concerts (owner rule: content for every new concert)", () => {
  it("sends an accepted concert without a write-up to the write-up pass", () => {
    const fromHaiku = pickAnswer(undefined, haikuAnswer())!.classification;
    expect(needsWriteUp("ACCEPTED", fromHaiku)).toBe(true);
    expect(needsWriteUp("ACCEPTED", { writeUp: "   " })).toBe(true);
  });
  it("does not pay for write-ups of rejected videos, or of Opus answers that carry one", () => {
    expect(needsWriteUp("NOT_ROCK", pickAnswer(undefined, haikuAnswer())!.classification)).toBe(false);
    expect(needsWriteUp("UNCERTAIN", { writeUp: "" })).toBe(false);
    expect(needsWriteUp("ACCEPTED", opusAnswer())).toBe(false);
  });
});

describe("--reconsider scope (re-check NOT_ROCK / UNCERTAIN without paying for fan uploads)", () => {
  it("defaults to official sources", () => {
    expect(reconsiderScope(undefined)).toBe("official");
    expect(reconsiderScope("ARCHIVE")).toBe("archive");
    expect(() => reconsiderScope("fans")).toThrow(/RECONSIDER_SCOPE/);
  });
  it("keeps archives, artist and other official channels; leaves fan uploads out unless asked", () => {
    expect(["ARCHIVE", "ARTIST", "MIXED"].every((k) => keepForReconsider("official", k as "ARCHIVE"))).toBe(true);
    expect(keepForReconsider("official", "UNKNOWN")).toBe(false);
    expect(keepForReconsider("archive", "ARCHIVE")).toBe(true);
    expect(keepForReconsider("archive", "ARTIST")).toBe(false);
    expect(keepForReconsider("all", "UNKNOWN")).toBe(true);
  });
});

describe("a channel whose uploads playlist YouTube does not return", () => {
  const notFound = () => new Response('{"error":{"code":404,"errors":[{"reason":"playlistNotFound"}]}}', { status: 404 });
  it("is a PlaylistNotFound (skipped with a report line), not a run error, and costs one unit", async () => {
    const yt = new YouTubeClient("key", 100, (async () => notFound()) as typeof fetch, 1);
    const error = await yt.playlistVideoIds("UUKuG9-MGolUuWbEcoz5qijw", null).catch((e) => e);
    expect(error).toBeInstanceOf(PlaylistNotFound);
    expect((error as PlaylistNotFound).playlistId).toBe("UUKuG9-MGolUuWbEcoz5qijw");
    expect(yt.unitsUsed).toBe(1);
  });
  it("an empty playlist ID is skipped the same way, without asking YouTube", async () => {
    let calls = 0;
    const yt = new YouTubeClient("key", 100, (async () => (calls++, notFound())) as typeof fetch, 1);
    await expect(yt.playlistVideoIds("", null)).rejects.toBeInstanceOf(PlaylistNotFound);
    expect(calls).toBe(0);
  });
  it("other errors stay errors, and a used-up quota still stops the run", async () => {
    const down = new YouTubeClient("key", 100, (async () => new Response("bad", { status: 400 })) as typeof fetch, 1);
    const e = await down.playlistVideoIds("UUx", null).catch((x) => x);
    expect(e).not.toBeInstanceOf(PlaylistNotFound);
    expect(String(e.message)).toMatch(/400/);
    const quota = new YouTubeClient("key", 100, (async () => new Response('{"error":{"errors":[{"reason":"quotaExceeded"}]}}', { status: 403 })) as typeof fetch, 1);
    await expect(quota.playlistVideoIds("UUx", null)).rejects.toBeInstanceOf(QuotaBudgetExceeded);
  });
  it("a 404 on videos.list still only skips that batch of 50", async () => {
    const yt = new YouTubeClient("key", 100, (async () => notFound()) as typeof fetch, 1);
    expect((await yt.videos(["AAAAAAAAAAA"])).size).toBe(0);
    expect(yt.skippedBatches).toBe(1);
  });
});

describe("data/channels.json", () => {
  it("finds The Current by its handle", async () => {
    const { readFile } = await import("node:fs/promises");
    const file = JSON.parse(await readFile("data/channels.json", "utf8")) as { channels: { name: string; handle?: string }[] };
    expect(file.channels.find((c) => c.name === "The Current")?.handle).toBe("@TheCurrent");
  });
});
