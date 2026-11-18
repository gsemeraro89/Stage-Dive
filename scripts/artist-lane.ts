// The per-artist lane (owner, 17 Nov 2026): every official full concert (40 minutes or more) of the artists
// marked "allConcerts" in data/artist-rules.json, with no view threshold, as cheaply as possible.
//
//   npm run artist-lane [-- --dry-run] [-- --no-batch]   the lane
//   npm run artist-lane -- --haiku-test                  Haiku vs the stored Opus answers, nothing published
//
// Sources, cheapest first: (a) the remembered long videos (long_videos) read again with videos.list,
// (b) each artist's official channel (uploads playlist, capped), (c) one YouTube search per artist,
// never repeated (results stored, so a dry run's searches serve the real run). Free filters come
// first (src/lib/collector/lane.ts); only official videos that pass them are sent to Claude Haiku.
// Settings (environment): CLAUDE_BUDGET_USD (default 3), LANE_CLASSIFIER (auto | haiku | haiku+opus),
// YOUTUBE_UNIT_BUDGET, LANE_SEARCHES (most searches this run; default: as many as the units allow),
// LANE_CHANNEL_CAP (uploads read per artist channel, default 150), LANE_WAIT_MINUTES (default 40).
import "dotenv/config";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createPrismaClient } from "../src/lib/db";
import { collectBatch, collectPendingBatches, submitBatch } from "../src/lib/collector/batch";
import { cachedClassifications, storeClassification } from "../src/lib/collector/cache";
import { Classifier, ClassificationSchema, PROMPT_VERSION, toDecisionInput, type FullClassification } from "../src/lib/collector/classify";
import {
  estimateUsd,
  HaikuLane,
  LANE_CLASSIFY_VERSION,
  promptVersionOf,
  storedLaneAnswers,
  storeLaneAnswer,
  toFullClassification,
  videosInLaneBatches,
  type LaneClassification,
  type LanePass,
} from "../src/lib/collector/haiku";
import {
  agreement,
  artistNames,
  artistsInTitle,
  chooseClassifierMode,
  ClaudeBudget,
  costOf,
  DEFAULT_LANE_CLASSIFIER,
  handleChannelMatches,
  handleFor,
  isTopicChannel,
  parseSources,
  laneFilter,
  searchesThatFit,
  searchesToRun,
  searchQuery,
  takeWithinBudget,
  type AgreementPair,
  type OfficialChannels,
} from "../src/lib/collector/lane";
import { nameKey, resolveArtistIdentity } from "../src/lib/collector/musicbrainz";
import {
  configFromEnv,
  decide,
  expandGroups,
  findArtistRule,
  genresForApprovedArtist,
  genresInText,
  genresWithFallback,
  type ArtistGroup,
  type ArtistRule,
  type ChannelKindName,
  type Decision,
} from "../src/lib/collector/rules";
import { chunks, recentDecisions, recordDecision, saveConcert } from "../src/lib/collector/store";
import { QuotaBudgetExceeded, YouTubeClient, type ChannelInfo, type YouTubeVideo } from "../src/lib/collector/youtube";
import { slugify } from "../src/lib/slug";
import { findBestThumbnail } from "../src/lib/thumbnails";
import { TracklistExtractor } from "../src/lib/tracklist/extract";
import { lookUpTracklist, tracklistFields } from "../src/lib/tracklist/lookup";

const args = process.argv.slice(2);
const haikuTest = args.includes("--haiku-test");
const dryRun = args.includes("--dry-run");
const useBatch = !args.includes("--no-batch");
const waitMinutes = Number(process.env.LANE_WAIT_MINUTES ?? 40);
/** Write-ups must come back within the run, so the real run can publish at once (owner, 17 Nov 2026). */
const writeUpWaitMinutes = Number(process.env.LANE_WRITEUP_WAIT_MINUTES ?? 30);
const unitBudget = Number(process.env.YOUTUBE_UNIT_BUDGET ?? 8000);
const budget = new ClaudeBudget(Number(process.env.CLAUDE_BUDGET_USD || 3));
const ttlDays = Number(process.env.DECISION_TTL_DAYS ?? 30);
const channelCap = Number(process.env.LANE_CHANNEL_CAP || 150);
const maxSearchesSetting = process.env.LANE_SEARCHES ? Number(process.env.LANE_SEARCHES) : Infinity;
/** MusicBrainz identity and channel are looked up again after this many days. */
const IDENTITY_DAYS = 90;
const config = { ...configFromEnv(), viewThreshold: 0 };
/** Rough cost of one Opus classification (only with LANE_CLASSIFIER=haiku+opus), from the prompt size. */
const opusEstimateUsd = (v: YouTubeVideo) =>
  costOf("claude-opus-5-5", { input_tokens: Math.ceil((Math.min(v.description.length, 6000) + v.title.length + 400) / 3.5) + 900, output_tokens: 900 }, useBatch);

const artistFile = JSON.parse(await readFile("data/artist-rules.json", "utf8")) as { include: ArtistRule[]; groups?: ArtistGroup[] };
const allRules = artistFile.include;
const groups = artistFile.groups ?? [];
const laneRules = allRules.filter((r) => r.allConcerts);
const channelFile = JSON.parse(await readFile("data/channels.json", "utf8")) as { channels: { name: string }[] };

const db = createPrismaClient();
const yt = new YouTubeClient(process.env.YOUTUBE_API_KEY ?? "", unitBudget);
const haiku = new HaikuLane();
let opusClient: Classifier | null = null;
/** Created only when Opus is used. */
const opusOf = () => (opusClient ??= new Classifier());
let opusCostCounted = 0;
/** Add whatever the Opus classifier spent since the last call to the budget. */
const countOpusCost = () => {
  const now = opusClient?.estimatedCostUsd() ?? 0;
  budget.addSpent(now - opusCostCounted);
  opusCostCounted = now;
};

const errors: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const url = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const channelUrl = (id: string) => `https://www.youtube.com/channel/${id}`;
const round = (usd: number) => Math.round(usd * 1000) / 1000;

// ---------- Shared: the decision for one video ----------

/** Artists already in the catalogue, with their concerts' genres (owner rule, 13 Nov 2026), as in collect.ts. */
async function catalogueArtists() {
  const out = new Map<string, string[]>();
  for (const a of await db.artist.findMany({
    where: { credits: { some: { role: "MAIN", concert: { status: "PUBLISHED" } } } },
    select: { slug: true, credits: { where: { role: "MAIN" }, select: { concert: { select: { genres: { select: { genre: { select: { name: true } } } } } } } } },
  })) {
    const counts = new Map<string, number>();
    for (const c of a.credits) for (const g of c.concert.genres) counts.set(g.genre.name, (counts.get(g.genre.name) ?? 0) + 1);
    out.set(a.slug, [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([n]) => n));
  }
  return out;
}

/** MusicBrainz genres already stored for an artist (no network), for mixed or unknown channels. */
async function storedArtistGenres(name: string | undefined): Promise<string[] | null> {
  if (!name) return null;
  const row = await db.artistLookup.findUnique({ where: { nameKey: nameKey(name) } });
  return row?.mbid ? row.genres : null;
}

/** The same decision collect.ts makes: owner-approved and catalogue artists, genre fallbacks, decide(). */
async function decideFor(video: YouTubeVideo, kind: ChannelKindName, stored: FullClassification, known: Map<string, string[]>) {
  const answer = { ...stored, mainArtists: expandGroups(stored.mainArtists, groups) };
  const rule = findArtistRule(answer.mainArtists, allRules);
  const fromCatalogue = rule ? null : known.get(slugify(answer.mainArtists[0] ?? ""));
  const classification: FullClassification = rule
    ? { ...answer, genres: genresForApprovedArtist(answer.genres, rule) as FullClassification["genres"] }
    : fromCatalogue
      ? { ...answer, genres: genresWithFallback(answer.genres, fromCatalogue) as FullClassification["genres"] }
      : answer;
  const textGenres = genresInText(video.title, video.description, video.tags);
  const mbGenres = kind === "MIXED" || kind === "UNKNOWN" ? await storedArtistGenres(classification.mainArtists[0]) : null;
  const decision = decide(
    { channelKind: kind, ownerApproved: Boolean(rule || fromCatalogue), classification: toDecisionInput(classification), textGenres, artistGenres: mbGenres },
    config,
  );
  return { decision, classification, textGenres, mbGenres };
}

/** Wait for batches to end (up to `minutes`), polling every 30 seconds. */
async function waitFor<T>(minutes: number, poll: () => Promise<T | null>): Promise<T | null> {
  const deadline = Date.now() + minutes * 60_000;
  while (Date.now() < deadline) {
    await sleep(30_000);
    const out = await poll();
    if (out) return out;
  }
  return null;
}

/**
 * Ask Haiku one pass for these videos, inside the budget: half-price batch (waiting up to
 * LANE_WAIT_MINUTES) or straight away with --no-batch. Answers are stored in lane_answers.
 */
async function askHaiku(
  pass: LanePass,
  items: { video: YouTubeVideo; channelKind?: string; classification?: LaneClassification | FullClassification }[],
  minutes: number,
) {
  const waiting = await videosInLaneBatches(db, pass);
  const todo = items.filter((it) => !waiting.has(it.video.youtubeId));
  const sent = takeWithinBudget(todo, (it) => estimateUsd(pass, it.video, useBatch), budget);
  const outcome = { sent: sent.length, overBudget: todo.length - sent.length, refused: [] as string[], failed: [] as string[], notBack: 0 };
  if (!sent.length) return outcome;
  const estimate = sent.reduce((sum, it) => sum + estimateUsd(pass, it.video, useBatch), 0);
  if (!useBatch) {
    for (const it of sent) {
      const r = await haiku.direct(pass, it.video, it);
      budget.addSpent(r.costUsd);
      if (r.answer) await storeLaneAnswer(db, it.video.youtubeId, pass, promptVersionOf(pass), r.answer);
      else if (r.error === "declined") outcome.refused.push(it.video.youtubeId);
      else outcome.failed.push(it.video.youtubeId);
    }
    budget.settle(estimate, 0);
    return outcome;
  }
  try {
    const batchId = await haiku.submit(db, pass, sent);
    const back = await waitFor(minutes, () => haiku.collect(db, batchId));
    if (back) {
      budget.settle(estimate, back.costUsd);
      outcome.refused = back.refused;
      outcome.failed = back.failed;
    } else outcome.notBack = sent.length; // collected by the next run; the estimate stays counted
  } catch (error) {
    budget.settle(estimate, 0);
    errors.push(`Haiku ${pass} batch: ${(error as Error).message.slice(0, 300)}`);
  }
  return outcome;
}

/** Ask Opus (the main classifier) about these videos through its half-price batch, inside the budget. */
async function askOpus(items: { video: YouTubeVideo; channelKind: string }[]) {
  const opus = opusOf();
  const sent = takeWithinBudget(items, (it) => opusEstimateUsd(it.video), budget);
  if (!sent.length) return { sent: 0, overBudget: items.length };
  const estimate = sent.reduce((sum, it) => sum + opusEstimateUsd(it.video), 0);
  try {
    if (useBatch) {
      const batchId = await submitBatch(db, opus, sent);
      const back = await waitFor(Math.min(waitMinutes, 30), () => collectBatch(db, opus, batchId));
      if (!back) {
        countOpusCost();
        return { sent: sent.length, overBudget: items.length - sent.length }; // estimate stays counted until it comes back
      }
    } else {
      for (const it of sent) {
        try {
          await storeClassification(db, it.video.youtubeId, PROMPT_VERSION, await opus.classify(it.video, it.channelKind));
        } catch (error) {
          errors.push(`Opus ${it.video.youtubeId}: ${(error as Error).message}`);
        }
      }
    }
    budget.settle(estimate, 0);
    countOpusCost();
  } catch (error) {
    budget.settle(estimate, 0);
    errors.push(`Opus batch: ${(error as Error).message.slice(0, 300)}`);
  }
  return { sent: sent.length, overBudget: items.length - sent.length };
}

/** Channel kinds by YouTube channel ID, from our channels table. */
async function channelKinds() {
  const listedNames = new Set(channelFile.channels.map((c) => c.name.toLowerCase()));
  const rows = await db.channel.findMany({ where: { youtubeChannelId: { not: null } }, select: { name: true, youtubeChannelId: true, kind: true, isOfficial: true } });
  const listed = new Map<string, ChannelKindName>();
  const approved = new Map<string, ChannelKindName>();
  const any = new Map<string, ChannelKindName>();
  for (const r of rows) {
    any.set(r.youtubeChannelId!, r.kind as ChannelKindName);
    if (!r.isOfficial) continue;
    if (listedNames.has(r.name.toLowerCase())) listed.set(r.youtubeChannelId!, r.kind as ChannelKindName);
    else approved.set(r.youtubeChannelId!, r.kind as ChannelKindName);
  }
  return { listed, approved, any };
}

// ---------- Mode 1: Haiku vs Opus ----------

async function runHaikuTest() {
  const rows = await db.classificationCache.findMany({ select: { youtubeId: true, result: true } });
  const opusAnswers = new Map<string, FullClassification>();
  for (const r of rows) {
    const parsed = ClassificationSchema.safeParse(r.result);
    if (parsed.success) opusAnswers.set(r.youtubeId, parsed.data);
  }
  const videos = await yt.videos([...opusAnswers.keys()]);
  const kinds = await channelKinds();
  const kindOf = (v: YouTubeVideo) => kinds.any.get(v.channelId) ?? "UNKNOWN";
  const list = [...videos.values()];
  let haikuAnswers = await storedLaneAnswers(db, list.map((v) => v.youtubeId), "classify", ttlDays);
  const missing = list.filter((v) => !haikuAnswers.has(v.youtubeId));
  const asked = await askHaiku("classify", missing.map((v) => ({ video: v, channelKind: kindOf(v) })), waitMinutes);
  haikuAnswers = await storedLaneAnswers(db, list.map((v) => v.youtubeId), "classify", ttlDays);

  const known = await catalogueArtists();
  const pairs: AgreementPair[] = [];
  for (const v of list) {
    const h = haikuAnswers.get(v.youtubeId) as LaneClassification | undefined;
    const o = opusAnswers.get(v.youtubeId)!;
    if (!h) continue;
    const kind = kindOf(v);
    const opusDecision = (await decideFor(v, kind, o, known)).decision;
    const haikuDecision = (await decideFor(v, kind, toFullClassification(h, "", o.uploaderIsOfficial), known)).decision;
    pairs.push({ youtubeId: v.youtubeId, title: v.title, opus: opusDecision, haiku: haikuDecision });
  }
  const result = agreement(pairs);
  const mode = chooseClassifierMode("auto", pairs.length ? result.rate : null);
  const summary = {
    mode: "haiku-test",
    opusAnswers: opusAnswers.size,
    stillOnYouTube: list.length,
    compared: result.total,
    agree: result.agree,
    agreementPercent: Math.round(result.rate * 1000) / 10,
    laneWillUse: mode,
    haikuAsked: asked.sent,
    haikuNotBackYet: asked.notBack,
    overBudget: asked.overBudget,
    claudeCostUsd: round(budget.spentUsd),
    youtubeUnits: yt.unitsUsed,
    errors,
  };
  // Stored so LANE_CLASSIFIER=auto can follow it (no YouTube data in it, only our own counts).
  if (pairs.length) await db.jobRun.create({ data: { job: "haiku-test", finishedAt: new Date(), ok: true, summary: { ...summary, rate: result.rate } } });
  const row = (p: AgreementPair) => `| [${p.title.replace(/\|/g, "/")}](${url(p.youtubeId)}) | ${p.opus.verdict} (${p.opus.reason}) | ${p.haiku.verdict} (${p.haiku.reason}) |`;
  const md = [
    `# Haiku test ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Haiku agreed with Opus on publish / not publish for **${result.agree} of ${result.total}** videos (**${summary.agreementPercent}%**; needed: 95%).`,
    `The lane will use: **${mode === "haiku" ? "Haiku only" : "Haiku first, Opus for Haiku answers below 0.75 confidence"}** (LANE_CLASSIFIER=auto).`,
    "",
    `Claude cost: ~$${summary.claudeCostUsd} · YouTube units: ${summary.youtubeUnits}`,
    "",
    `## Opus published, Haiku would not (${result.onlyOpusAccepted.length})`,
    "| Video | Opus | Haiku |",
    "|---|---|---|",
    ...result.onlyOpusAccepted.map(row),
    "",
    `## Haiku would publish, Opus did not (${result.onlyHaikuAccepted.length})`,
    "| Video | Opus | Haiku |",
    "|---|---|---|",
    ...result.onlyHaikuAccepted.map(row),
  ].join("\n");
  return { summary, md, details: { onlyOpusAccepted: result.onlyOpusAccepted, onlyHaikuAccepted: result.onlyHaikuAccepted } };
}

// ---------- Mode 2: the lane ----------

interface ArtistReport {
  name: string;
  mbid: string | null;
  channel: string | null;
  channelFrom: "owner" | "musicbrainz" | "youtube-handle" | null;
  /** False when the channel's uploads cannot be read (closed, no uploads playlist, 404, Topic channel). */
  channelReadable: boolean;
  /** Owner (17 Nov 2026): no readable official channel, so videos from any channel may go to Claude. */
  otherChannelsOk: boolean;
  namesakes: number | null;
  search: "this run" | "earlier run" | "not yet";
  found: { longVideos: number; earlierMatches: number; channel: number; search: number };
  dropped: Record<string, number>;
  reportOnly: { title: string; url: string; channel: string; channelUrl: string }[];
  /** Videos sent to Claude from a channel that is not official (allowed because otherChannelsOk). */
  viaOtherChannel: { title: string; url: string; channel: string; channelUrl: string; verdict: string }[];
  sentToClaude: number;
  accepted: number;
  verdicts: Record<string, number>;
  waitingForClassification: number;
  waitingForWriteUp: number;
  created: string[];
}

async function runLane() {
  const sources = parseSources(process.env.LANE_SOURCES);
  const lookups = new Map((await db.artistLookup.findMany({ where: { nameKey: { in: laneRules.map((r) => nameKey(r.name)) } } })).map((l) => [l.nameKey, l]));
  const reports = new Map<string, ArtistReport>();
  for (const r of laneRules) {
    reports.set(r.name, {
      name: r.name, mbid: null, channel: null, channelFrom: null, channelReadable: false, otherChannelsOk: false, namesakes: null, search: "not yet",
      found: { longVideos: 0, earlierMatches: 0, channel: 0, search: 0 }, dropped: {}, reportOnly: [], viaOtherChannel: [], sentToClaude: 0,
      accepted: 0, verdicts: {}, waitingForClassification: 0, waitingForWriteUp: 0, created: [],
    });
  }
  const totals = {
    mode: dryRun ? "artist-search (dry run: nothing published)" : "artist-search",
    classifier: "",
    sources: [...sources].join(","),
    artists: laneRules.length,
    artistsWithReadableChannel: 0,
    channelsFoundByHandle: 0,
    longVideosRead: 0,
    skippedKnown: 0,
    searchesUsed: 0,
    searchesLeft: 0,
    sentToClaude: 0,
    viaOtherChannel: 0,
    reusedAnswers: 0,
    haikuAsked: 0,
    opusAsked: 0,
    writeUpsAsked: 0,
    overBudget: 0,
    waitingForClassification: 0,
    accepted: 0,
    readyToPublish: 0,
    waitingForWriteUp: 0,
    created: [] as string[],
    duplicates: 0,
    reportOnly: 0,
    claudeCostUsd: 0,
    claudeBudgetUsd: budget.limitUsd,
    youtubeUnits: 0,
    stoppedEarly: "",
  };
  /** Once YouTube's units run out, no more reading or searching; what was read is still classified. */
  const quotaOut = (error: unknown) => {
    if (!(error instanceof QuotaBudgetExceeded)) return false;
    totals.stoppedEarly ||= `${error.message}; the rest is read next run`;
    return true;
  };
  const lastTest = await db.jobRun.findFirst({ where: { job: "haiku-test", ok: true }, orderBy: { startedAt: "desc" } });
  const lastRate = (lastTest?.summary as { rate?: number } | null)?.rate ?? null;
  const mode = chooseClassifierMode(process.env.LANE_CLASSIFIER || DEFAULT_LANE_CLASSIFIER, lastRate);
  totals.classifier = `${mode}${lastRate !== null ? ` (last Haiku test: ${Math.round(lastRate * 1000) / 10}% agreement)` : ""}`;

  // 1. Who is who: MusicBrainz identity and official channel (owner override wins). Stored, also in dry runs.
  for (const rule of laneRules) {
    const rep = reports.get(rule.name)!;
    const key = nameKey(rule.name);
    let row = lookups.get(key);
    const fresh = row?.channelCheckedAt && Date.now() - row.channelCheckedAt.getTime() < IDENTITY_DAYS * 86_400_000;
    if (!fresh && !(rule.youtubeChannelId && rule.mbid)) {
      try {
        const id = await resolveArtistIdentity(rule.name, { aka: rule.aka, mbid: rule.mbid });
        let channelId: string | null = null;
        // A handle or legacy user name in MusicBrainz is turned into the channel ID (1 unit).
        if (id.youtube) channelId = "id" in id.youtube ? id.youtube.id : ((await yt.channel(id.youtube))?.id ?? null);
        const keepHandle = row?.channelFrom === "youtube-handle" && row.youtubeChannelId;
        const data = {
          ...(keepHandle ? {} : { youtubeChannelId: channelId, channelFrom: channelId ? "musicbrainz" : null }),
          channelCheckedAt: new Date(),
          ...(id.mbid ? { mbid: id.mbid, genres: id.genres } : {}),
        };
        row = await db.artistLookup.upsert({ where: { nameKey: key }, create: { nameKey: key, ...data, mbid: id.mbid, genres: id.genres }, update: data });
        lookups.set(key, row);
        rep.namesakes = id.namesakes;
      } catch (error) {
        if (!quotaOut(error)) errors.push(`identity of ${rule.name}: ${(error as Error).message}`);
      }
    }
    rep.mbid = rule.mbid ?? row?.mbid ?? null;
    rep.channel = rule.youtubeChannelId ?? row?.youtubeChannelId ?? null;
    rep.channelFrom = rule.youtubeChannelId ? "owner" : rep.channel ? ((row?.channelFrom as ArtistReport["channelFrom"]) ?? "musicbrainz") : null;
  }

  // 1b. Check the channels with YouTube itself, 50 per unit: the real uploads playlist
  // (contentDetails.relatedPlaylists.uploads), and whether there is anything to read.
  let info = new Map<string, ChannelInfo>();
  const withChannel = laneRules.filter((r) => reports.get(r.name)!.channel);
  try {
    info = await yt.channelsInfo(withChannel.map((r) => reports.get(r.name)!.channel!));
  } catch (error) {
    if (!quotaOut(error)) errors.push(`channels: ${(error as Error).message.slice(0, 200)}`);
  }
  const usable = (c: ChannelInfo | undefined) => Boolean(c && c.uploadsPlaylistId && c.videoCount > 0 && !isTopicChannel(c.title));
  for (const r of withChannel) {
    const rep = reports.get(r.name)!;
    const c = info.get(rep.channel!);
    if (c && isTopicChannel(c.title)) {
      // An automatic "Artist - Topic" channel holds tracks, not concerts: as good as no channel.
      errors.push(`${r.name}: MusicBrainz channel is a YouTube Topic channel (${c.title}); ignored`);
      rep.channel = null;
      rep.channelFrom = null;
    } else rep.channelReadable = usable(c);
  }

  // 1c. Artists still without a channel: try YouTube @handle with their name (1 unit each, once per 90 days).
  if (sources.has("handles")) {
    for (const r of laneRules) {
      const rep = reports.get(r.name)!;
      if (rep.channel || r.youtubeChannelId) continue;
      const key = nameKey(r.name);
      const row = lookups.get(key);
      if (row?.handleCheckedAt && Date.now() - row.handleCheckedAt.getTime() < IDENTITY_DAYS * 86_400_000) continue;
      try {
        const c = await yt.channelInfoByHandle(handleFor(r.name));
        const ok = c !== null && handleChannelMatches(c, artistNames(r));
        const data = { handleCheckedAt: new Date(), ...(ok ? { youtubeChannelId: c!.id, channelFrom: "youtube-handle" } : {}) };
        lookups.set(key, await db.artistLookup.upsert({ where: { nameKey: key }, create: { nameKey: key, genres: [], ...data }, update: data }));
        if (ok) {
          rep.channel = c!.id;
          rep.channelFrom = "youtube-handle";
          rep.channelReadable = usable(c!);
          info.set(c!.id, c!);
          totals.channelsFoundByHandle++;
        }
      } catch (error) {
        if (quotaOut(error)) break;
        errors.push(`handle of ${r.name}: ${(error as Error).message.slice(0, 200)}`);
      }
    }
  }

  // 2. Where each video came from.
  const origin = new Map<string, { long: boolean; earlier: boolean; artists: Map<string, Set<"channel" | "search">> }>();
  const note = (id: string, from: { long?: boolean; earlier?: boolean; artist?: string; source?: "channel" | "search" }) => {
    const o = origin.get(id) ?? { long: false, earlier: false, artists: new Map() };
    if (from.long) o.long = true;
    if (from.earlier) o.earlier = true;
    if (from.artist && from.source) o.artists.set(from.artist, (o.artists.get(from.artist) ?? new Set()).add(from.source));
    origin.set(id, o);
  };
  // Earlier passes: the videos already matched to an artist, and those Haiku already classified.
  // Read first, so a cheap pass spends its few units on them.
  if (sources.has("answers")) {
    for (const r of await db.laneAnswer.findMany({ where: { kind: "classify", promptVersion: LANE_CLASSIFY_VERSION }, select: { youtubeId: true } })) note(r.youtubeId, { earlier: true });
  }
  if (sources.has("matches")) {
    for (const r of await db.laneMatch.findMany({ select: { youtubeId: true } })) note(r.youtubeId, { earlier: true });
  }
  // (a) Remembered long videos.
  if (sources.has("long")) {
    for (const r of await db.longVideo.findMany({ select: { youtubeId: true } })) note(r.youtubeId, { long: true });
    totals.longVideosRead = [...origin.values()].filter((o) => o.long).length;
  }
  // (b) Each artist's official channel, newest uploads first, capped. A channel that cannot be read
  // (404 and the like) counts as no channel for this run.
  if (sources.has("channel")) {
    for (const r of laneRules) {
      const rep = reports.get(r.name)!;
      const c = rep.channel ? info.get(rep.channel) : undefined;
      if (!rep.channelReadable || !c) continue;
      try {
        const ids = (await yt.playlistVideoIds(c.uploadsPlaylistId, null, Math.ceil(channelCap / 50))).slice(0, channelCap);
        ids.forEach((id) => note(id, { artist: r.name, source: "channel" }));
      } catch (error) {
        if (quotaOut(error)) break;
        rep.channelReadable = false;
        errors.push(`uploads of ${r.name}: ${(error as Error).message.slice(0, 200)}`);
      }
    }
  }
  for (const rep of reports.values()) rep.otherChannelsOk = !rep.channelReadable;
  totals.artistsWithReadableChannel = [...reports.values()].filter((r) => r.channelReadable).length;
  const artistChannel = new Map<string, string>(); // YouTube channel ID -> artist name (readable or not)
  for (const rep of reports.values()) if (rep.channel) artistChannel.set(rep.channel, rep.name);
  const kinds = await channelKinds();
  const official: OfficialChannels = { listed: kinds.listed, artistChannels: artistChannel, approved: kinds.approved };

  // (c, earlier runs) Stored search results: a search is never repeated. Artists without a readable
  // channel first: their results may now go to Claude.
  if (sources.has("search")) {
    const order = [...laneRules].sort((a, b) => Number(reports.get(b.name)!.otherChannelsOk) - Number(reports.get(a.name)!.otherChannelsOk));
    for (const rule of order) {
      const row = lookups.get(nameKey(rule.name)) ?? (await db.artistLookup.findUnique({ where: { nameKey: nameKey(rule.name) } }));
      if (row?.searchedAt) {
        reports.get(rule.name)!.search = "earlier run";
        row.searchResultIds.forEach((id) => note(id, { artist: rule.name, source: "search" }));
      }
    }
  } else {
    for (const rule of laneRules) if (lookups.get(nameKey(rule.name))?.searchedAt) reports.get(rule.name)!.search = "earlier run";
  }

  // 3. Skip what is already a concert or already decided (UNCERTAIN and NOT_ELECTRONIC get a new look:
  // these artists are now approved by the owner, which changes the outcome).
  const known = new Set<string>();
  const decided = new Set<string>();
  const videos = new Map<string, YouTubeVideo>();
  const fetchFresh = async (ids: string[]) => {
    const todo = ids.filter((id) => !videos.has(id) && !known.has(id) && !decided.has(id));
    for (const slice of chunks(todo)) {
      (await db.concert.findMany({ where: { youtubeId: { in: slice } }, select: { youtubeId: true } })).forEach((s) => known.add(s.youtubeId));
    }
    (await recentDecisions(db, todo, ttlDays, ["UNCERTAIN", "NOT_ELECTRONIC"])).forEach((id) => decided.add(id));
    const ask = todo.filter((id) => !known.has(id) && !decided.has(id));
    // 50 at a time, so the videos read before the units run out are kept.
    for (let i = 0; i < ask.length; i += 50) {
      try {
        for (const [id, v] of await yt.videos(ask.slice(i, i + 50))) videos.set(id, v);
      } catch (error) {
        if (quotaOut(error)) return;
        throw error;
      }
    }
  };
  await fetchFresh([...origin.keys()]);

  // (c, this run) New searches with the units left, artists never searched first, in the owner's order.
  if (sources.has("search")) {
    const states = laneRules.map((r) => ({ name: r.name, searchedAt: reports.get(r.name)!.search === "not yet" ? null : new Date() }));
    const fit = Math.min(maxSearchesSetting, searchesThatFit(unitBudget - yt.unitsUsed));
    for (const s of searchesToRun(states, fit)) {
      try {
        const ids = await yt.searchArtistConcerts(searchQuery(s.name));
        const key = nameKey(s.name);
        // Stored at once (dry runs too), so the search is never paid for again.
        await db.artistLookup.upsert({
          where: { nameKey: key },
          create: { nameKey: key, genres: [], searchedAt: new Date(), searchResultIds: ids },
          update: { searchedAt: new Date(), searchResultIds: ids },
        });
        ids.forEach((id) => note(id, { artist: s.name, source: "search" }));
        reports.get(s.name)!.search = "this run";
        totals.searchesUsed++;
        await fetchFresh(ids);
      } catch (error) {
        if (quotaOut(error)) break;
        errors.push(`search ${s.name}: ${(error as Error).message.slice(0, 200)}`);
      }
    }
  }
  totals.searchesLeft = laneRules.filter((r) => reports.get(r.name)!.search === "not yet").length;

  // 4. Free filters, per video, for the artist it belongs to.
  const toClassify: { video: YouTubeVideo; kind: ChannelKindName; artist: string; otherChannel: boolean }[] = [];
  const matches: { youtubeId: string; artist: string }[] = [];
  for (const [id, o] of origin) {
    const sourceArtists = [...o.artists.keys()];
    if (known.has(id) || decided.has(id)) {
      const who = sourceArtists[0];
      const reason = known.has(id) ? "already-a-concert" : "already-decided";
      if (who) reports.get(who)!.dropped[reason] = (reports.get(who)!.dropped[reason] ?? 0) + 1;
      else totals.skippedKnown++;
      continue;
    }
    const video = videos.get(id);
    if (!video) continue; // gone from YouTube, not read (units), or a batch skipped after errors
    const inTitle = artistsInTitle(video.title, laneRules).map((r) => r.name);
    // The artist's own channel names the artist even when the title does not; a label or festival
    // channel of our list (e.g. an artist's label) does not count as "own".
    const own = official.listed.has(video.channelId) ? undefined : artistChannel.get(video.channelId);
    const artist = own ?? sourceArtists.find((a) => inTitle.includes(a)) ?? inTitle[0] ?? sourceArtists[0];
    if (!artist) continue; // a remembered long video of someone else: not this lane's business
    const rep = reports.get(artist)!;
    if (o.long) rep.found.longVideos++;
    if (o.earlier) rep.found.earlierMatches++;
    if (o.artists.get(artist)?.has("channel") || own) rep.found.channel++;
    if (o.artists.get(artist)?.has("search")) rep.found.search++;
    if (own || inTitle.length) matches.push({ youtubeId: id, artist });
    const rule = laneRules.find((r) => r.name === artist)!;
    const result = laneFilter(video, {
      names: artistNames(rule),
      isConcert: false,
      decided: false,
      channels: official,
      minDurationSeconds: config.minDurationSeconds,
      onOwnChannel: own === artist,
      otherChannelsOk: rep.otherChannelsOk,
    });
    if (result.outcome === "drop") rep.dropped[result.reason] = (rep.dropped[result.reason] ?? 0) + 1;
    else if (result.outcome === "report-only") {
      rep.reportOnly.push({ title: video.title, url: url(id), channel: video.channelTitle, channelUrl: channelUrl(video.channelId) });
      totals.reportOnly++;
    } else {
      const otherChannel = result.official.reason === "other-channel";
      toClassify.push({ video, kind: result.official.kind, artist, otherChannel });
      rep.sentToClaude++;
      if (otherChannel) totals.viaOtherChannel++;
    }
  }
  totals.sentToClaude = toClassify.length;
  // IDs only (and our own note), so the next pass can skip re-reading all long videos (LANE_SOURCES=matches).
  for (let i = 0; i < matches.length; i += 5_000) {
    await db.laneMatch.createMany({ data: matches.slice(i, i + 5_000), skipDuplicates: true });
  }

  // 5. Classifier answers: stored ones first (a stored Opus answer is used as it is, free).
  const lanePending = await haiku.collectPending(db);
  budget.addSpent(lanePending.costUsd);
  if (mode === "haiku+opus") {
    await collectPendingBatches(db, opusOf());
    countOpusCost();
  }
  const ids = toClassify.map((t) => t.video.youtubeId);
  const answersOf = async () => ({
    opus: await cachedClassifications(db, ids, PROMPT_VERSION, ttlDays),
    haiku: await storedLaneAnswers(db, ids, "classify", ttlDays),
  });
  let answers = await answersOf();
  // Only videos with no stored answer at all go to Haiku; most watched first, in case the budget is tight.
  const needHaiku = toClassify
    .filter((t) => !answers.opus.has(t.video.youtubeId) && !answers.haiku.has(t.video.youtubeId))
    .sort((a, b) => b.video.viewCount - a.video.viewCount);
  totals.reusedAnswers = toClassify.length - needHaiku.length;
  const asked = await askHaiku("classify", needHaiku.map((t) => ({ video: t.video, channelKind: t.kind })), waitMinutes);
  totals.haikuAsked = asked.sent;
  totals.overBudget += asked.overBudget;
  answers = await answersOf();

  // Haiku + Opus (only when asked for): Opus looks at the answers Haiku is not sure about.
  if (mode === "haiku+opus") {
    const unsure = toClassify.filter((t) => {
      const id = t.video.youtubeId;
      if (answers.opus.has(id)) return false;
      const h = answers.haiku.get(id) as LaneClassification | undefined;
      return h ? h.confidence < config.minConfidence : asked.refused.includes(id) || lanePending.refused.includes(id);
    });
    const o = await askOpus(unsure.map((t) => ({ video: t.video, channelKind: t.kind })));
    totals.opusAsked = o.sent;
    totals.overBudget += o.overBudget;
    answers = await answersOf();
  }

  // 6. Decisions.
  const knownArtists = await catalogueArtists();
  type Ready = { t: (typeof toClassify)[number]; classification: FullClassification; decision: Decision; fromOpus: boolean };
  const accepted: Ready[] = [];
  const outcomes: Ready[] = [];
  for (const t of toClassify) {
    const id = t.video.youtubeId;
    const o = answers.opus.get(id);
    const h = answers.haiku.get(id) as LaneClassification | undefined;
    const rep = reports.get(t.artist)!;
    if (!o && !h) {
      rep.waitingForClassification++;
      totals.waitingForClassification++;
      continue;
    }
    const base = o ?? toFullClassification(h!, "", !t.otherChannel);
    const { decision, classification } = await decideFor(t.video, t.kind, base, knownArtists);
    // No view threshold only for the lane's artists: a concert by someone else (e.g. another DJ on a lane
    // artist's channel) is left to the main collector and its view threshold. No verdict is recorded.
    if (!findArtistRule(expandGroups(classification.mainArtists, groups), laneRules)) {
      rep.verdicts.OTHER_ARTIST = (rep.verdicts.OTHER_ARTIST ?? 0) + 1;
      continue;
    }
    const ready = { t, classification, decision, fromOpus: Boolean(o) };
    if (decision.verdict === "ACCEPTED") accepted.push(ready);
    outcomes.push(ready);
  }

  // 7. Original write-ups, only for accepted concerts, in dry runs too (so the real run publishes at once).
  const needText = accepted.filter((a) => !a.fromOpus || !a.classification.writeUp);
  let texts = await storedLaneAnswers(db, needText.map((a) => a.t.video.youtubeId), "writeup", ttlDays);
  const textTodo = needText.filter((a) => !texts.has(a.t.video.youtubeId));
  const w = await askHaiku("writeup", textTodo.map((a) => ({ video: a.t.video, classification: a.classification })), writeUpWaitMinutes);
  totals.writeUpsAsked = w.sent;
  totals.overBudget += w.overBudget;
  texts = await storedLaneAnswers(db, needText.map((a) => a.t.video.youtubeId), "writeup", ttlDays);

  // 8. Publish (not in a dry run), and record the verdicts.
  const extractor = process.env.ANTHROPIC_API_KEY ? new TracklistExtractor() : null;
  const rows: Record<string, unknown>[] = [];
  for (const r of outcomes) {
    const { t, decision } = r;
    const id = t.video.youtubeId;
    const rep = reports.get(t.artist)!;
    let verdict: string = decision.verdict;
    let detail = decision.reason;
    let classification = r.classification;
    const via = t.otherChannel ? "other channel" : "official";
    if (verdict === "ACCEPTED") {
      rep.accepted++;
      totals.accepted++;
      const text = (texts.get(id) as { writeUp: string } | undefined)?.writeUp ?? (r.fromOpus ? classification.writeUp : "");
      if (!text) {
        // No original text yet: the concert waits for its write-up (next run) rather than going up without one.
        rep.waitingForWriteUp++;
        totals.waitingForWriteUp++;
        if (t.otherChannel) rep.viaOtherChannel.push({ title: t.video.title, url: url(id), channel: t.video.channelTitle, channelUrl: channelUrl(t.video.channelId), verdict: "ACCEPTED (waiting for write-up)" });
        rows.push({ artist: t.artist, youtubeId: id, url: url(id), title: t.video.title, channel: t.video.channelTitle, via, verdict: "WAITING_FOR_WRITE_UP", reason: detail });
        continue;
      }
      classification = { ...classification, writeUp: text };
      totals.readyToPublish++;
    }
    if (verdict === "ACCEPTED" && !dryRun) {
      const saved = await saveConcert(db, {
        video: t.video,
        classification,
        // A video via another channel is not official: an official upload of the same concert replaces it.
        channel: { youtubeChannelId: t.video.channelId, name: t.video.channelTitle, isOfficial: !t.otherChannel },
        thumbnail: await findBestThumbnail(id),
      });
      if (saved.status === "duplicate") {
        verdict = "DUPLICATE";
        detail = `same concert as ${saved.ofYoutubeId}`;
        totals.duplicates++;
      } else {
        rep.created.push(saved.slug);
        totals.created.push(saved.slug);
        try {
          const found = await lookUpTracklist(yt, t.video, { extractor, claudeMax: 20 });
          await db.concert.update({ where: { id: saved.concertId }, data: tracklistFields(found, new Date()) });
        } catch (error) {
          // Never lose a new concert over its tracklist: the refresh job looks again.
          if (!(error instanceof QuotaBudgetExceeded)) errors.push(`tracklist for ${saved.slug}: ${(error as Error).message}`);
        }
      }
    }
    rep.verdicts[verdict] = (rep.verdicts[verdict] ?? 0) + 1;
    if (t.otherChannel) rep.viaOtherChannel.push({ title: t.video.title, url: url(id), channel: t.video.channelTitle, channelUrl: channelUrl(t.video.channelId), verdict });
    if (!dryRun) {
      await recordDecision(db, id, verdict as Parameters<typeof recordDecision>[2], `artist lane${t.otherChannel ? " (via other channel)" : ""}: ${detail}`);
      if (verdict === "UNCERTAIN") {
        await db.reviewItem.create({
          data: {
            youtubeId: id,
            reason: `artist lane: ${detail}`,
            confidence: classification.confidence,
            payload: {
              title: t.video.title, channel: t.video.channelTitle, channelId: t.video.channelId, channelKind: t.kind, views: t.video.viewCount,
              durationSeconds: t.video.durationSeconds, publishedAt: t.video.publishedAt.toISOString(), classification, signals: decision.signals,
            },
          },
        });
      }
    }
    rows.push({
      artist: t.artist, youtubeId: id, url: url(id), title: t.video.title, channel: t.video.channelTitle, channelKind: t.kind, via,
      minutes: Math.round(t.video.durationSeconds / 60), views: t.video.viewCount, verdict, reason: detail, answeredBy: r.fromOpus ? "opus" : "haiku",
      artists: classification.mainArtists, genres: classification.genres, confidence: classification.confidence,
      venue: classification.venue, writeUp: verdict === "ACCEPTED" || verdict === "DUPLICATE" ? classification.writeUp : undefined,
    });
  }
  if (!dryRun) {
    await db.jobRun.create({ data: { job: "artist-lane", finishedAt: new Date(), ok: errors.length === 0, summary: { ...totals, claudeCostUsd: round(budget.spentUsd), youtubeUnits: yt.unitsUsed } } });
  }
  return { totals, reports: [...reports.values()], rows };
}

// ---------- Run, then report ----------

const date = new Date().toISOString().slice(0, 10);
await mkdir("reports", { recursive: true });
let exitCode = 0;
try {
  if (haikuTest) {
    const { summary, md, details } = await runHaikuTest();
    console.log(JSON.stringify(summary, null, 2));
    await writeFile(`reports/haiku-test-${date}.json`, JSON.stringify({ summary, ...details }, null, 2));
    await writeFile(`reports/haiku-test-${date}.md`, md + "\n");
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  } else {
    let out: Awaited<ReturnType<typeof runLane>> | null = null;
    try {
      out = await runLane();
    } catch (error) {
      if (error instanceof QuotaBudgetExceeded) errors.push(`stopped: ${error.message}`);
      else throw error;
    }
    if (out) {
      out.totals.claudeCostUsd = round(budget.spentUsd);
      out.totals.youtubeUnits = yt.unitsUsed;
      if (budget.stopped && !out.totals.stoppedEarly) out.totals.stoppedEarly = `Claude budget of $${budget.limitUsd} reached; the rest waits for the next run`;
      const summary = { ...out.totals, errors };
      console.log(JSON.stringify({ summary, artists: out.reports.map((r) => ({ ...r, reportOnly: r.reportOnly.length, viaOtherChannel: r.viaOtherChannel.length })) }, null, 2));
      const md = laneMarkdown(summary, out.reports);
      const name = `reports/artist-search-${date}${dryRun ? "-dry-run" : ""}`;
      await writeFile(`${name}.json`, JSON.stringify({ summary, artists: out.reports, videos: out.rows }, null, 2));
      await writeFile(`${name}.md`, md + "\n");
      if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md + "\n");
    } else console.log(JSON.stringify({ errors, youtubeUnits: yt.unitsUsed }, null, 2));
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await db.$disconnect();
}
process.exitCode = exitCode;

function laneMarkdown(summary: Record<string, unknown> & { created: string[] }, reports: ArtistReport[]): string {
  const cell = (s: string) => s.replace(/\|/g, "/");
  const drops = (d: Record<string, number>) => Object.entries(d).map(([k, v]) => `${k} ${v}`).join(", ") || "-";
  const channel = (r: ArtistReport) =>
    r.channel ? `[${r.channelFrom}${r.channelReadable ? "" : ", unreadable"}](${channelUrl(r.channel)})` : "none found";
  const lines = [
    `# Artist search ${date}${dryRun ? " (dry run: nothing published)" : ""}`,
    "",
    `- Classifier: ${summary.classifier} · sources: ${summary.sources}`,
    `- Artists with a readable official channel: ${summary.artistsWithReadableChannel} of ${summary.artists} (found by @handle this run: ${summary.channelsFoundByHandle}); the others take videos from any channel, marked "via other channel"`,
    `- Sent to Claude: ${summary.sentToClaude} (via other channel: ${summary.viaOtherChannel}; stored answers reused: ${summary.reusedAnswers}; Haiku asked now: ${summary.haikuAsked}; Opus: ${summary.opusAsked})`,
    `- Accepted: ${summary.accepted} (ready to publish, with write-up: ${summary.readyToPublish}; waiting for a write-up: ${summary.waitingForWriteUp}; write-ups asked now: ${summary.writeUpsAsked}) · new concerts: ${summary.created.length} · duplicates: ${summary.duplicates}`,
    `- Waiting for a classification: ${summary.waitingForClassification} · left over budget: ${summary.overBudget} · report only (not official channels): ${summary.reportOnly}`,
    `- Claude cost: ~$${summary.claudeCostUsd} of $${summary.claudeBudgetUsd} · YouTube units: ${summary.youtubeUnits} · searches used: ${summary.searchesUsed}, left: ${summary.searchesLeft}`,
    ...(summary.stoppedEarly ? [`- Stopped early: ${summary.stoppedEarly}`] : []),
    ...((summary.errors as string[]).length ? [`- Errors: ${(summary.errors as string[]).length} (see the JSON)`] : []),
    "",
    "| Artist | Channel | Search | Found (long / earlier / channel / search) | Dropped free | Sent to Claude | Via other channel | Accepted | Waiting (answer / write-up) | Report only | New concerts |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...reports.map(
      (r) =>
        `| ${cell(r.name)} | ${channel(r)} | ${r.search} | ${r.found.longVideos} / ${r.found.earlierMatches} / ${r.found.channel} / ${r.found.search} | ${drops(r.dropped)} | ${r.sentToClaude} | ${r.viaOtherChannel.length} | ${r.accepted} | ${r.waitingForClassification} / ${r.waitingForWriteUp} | ${r.reportOnly.length} | ${r.created.length} |`,
    ),
    "",
    "## Via other channel (artists without a readable official channel; checked by Claude, official uploads still win)",
    "",
    ...reports.flatMap((r) =>
      r.viaOtherChannel.length
        ? [`### ${r.name}`, ...r.viaOtherChannel.map((x) => `- ${x.verdict}: [${cell(x.title)}](${x.url}) on [${cell(x.channel)}](${x.channelUrl})`), ""]
        : [],
    ),
    "## Report only: fan uploads and other channels (not sent to Claude, not published)",
    "",
    ...reports.flatMap((r) =>
      r.reportOnly.length
        ? [`### ${r.name}`, ...r.reportOnly.map((x) => `- [${cell(x.title)}](${x.url}) on [${cell(x.channel)}](${x.channelUrl})`), ""]
        : [],
    ),
  ];
  return lines.join("\n");
}
