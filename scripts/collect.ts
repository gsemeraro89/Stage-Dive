// The collector. Reads the channels in data/channels.json (plus a few discovery searches),
// keeps long, popular, public, embeddable videos, asks Claude what each one is, and publishes
// only the concerts that pass every check. Run with: npm run collect [-- --dry-run] [-- --limit 50]
// Classifier (owner, 20 Nov 2026): Claude Haiku through the half-price Batch API, Claude Opus as a second
// opinion for unsure answers, Haiku's write-up pass for accepted concerts (src/lib/collector/main-classifier.ts).
import "dotenv/config";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createPrismaClient } from "../src/lib/db";
import { collectBatch, collectPendingBatches, submitBatch } from "../src/lib/collector/batch";
import { cachedClassifications, storeClassification, videosInPendingBatches } from "../src/lib/collector/cache";
import { Classifier, PROMPT_VERSION, toDecisionInput, type FullClassification } from "../src/lib/collector/classify";
import {
  HaikuLane,
  promptVersionOf,
  storedLaneAnswers,
  storeLaneAnswer,
  videosInLaneBatches,
  type LaneClassification,
  type LanePass,
} from "../src/lib/collector/haiku";
import { mainClassifierMode, needsOpus, needsWriteUp, pickAnswer } from "../src/lib/collector/main-classifier";
import { reconsiderScope, keepForReconsider } from "../src/lib/collector/reconsider";
import { lookupArtist, nameKey } from "../src/lib/collector/musicbrainz";
import {
  checkRules,
  configFromEnv,
  worthRemembering,
  decide,
  channelMatches,
  findArtistRule,
  isExcludedArtist,
  sourceRank,
  inReadingOrder,
  isYouTubeChannelId,
  onlyChannelNames,
  type ArtistExclusion,
  genresForApprovedArtist,
  expandGroups,
  genresWithFallback,
  genresInText,
  type ArtistGroup,
  type ArtistRule,
  type ChannelKindName,
  type RuleFailure,
} from "../src/lib/collector/rules";
import {
  chunks,
  expireOldData,
  forgetLongVideos,
  longVideosDue,
  recentDecisions,
  recordDecision,
  rememberLongVideos,
  saveConcert,
} from "../src/lib/collector/store";
import { PlaylistNotFound, QuotaBudgetExceeded, YouTubeClient, type YouTubeVideo } from "../src/lib/collector/youtube";
import { slugify } from "../src/lib/slug";
import { findBestThumbnail } from "../src/lib/thumbnails";
import { SetlistExtractor } from "../src/lib/setlist/extract";
import { lookUpSetlist, setlistFields } from "../src/lib/setlist/lookup";

const args = process.argv.slice(2);
// --dry-run: classify and report, publish nothing. The classifier's answers are still stored
// (classification_cache), so the real run that follows reuses them instead of paying again.
const dryRun = args.includes("--dry-run");
// --no-batch: classify straight away at full price instead of through the half-price Batch API.
const useBatch = !args.includes("--no-batch");
const batchWaitMinutes = Number(process.env.BATCH_WAIT_MINUTES ?? 45);
// --reconsider: look again at videos kept out as uncertain or not rock (e.g. after the owner
// approved an artist or widened the genres). Free when their classifier answers are still stored.
// RECONSIDER_SCOPE (official | archive | all; default official): which of them, by source. Fan uploads
// are left out by default: they are never published, so a new paid answer would change nothing.
const reconsider = args.includes("--reconsider");
const reconsiderOnly = reconsiderScope(process.env.RECONSIDER_SCOPE);
// COLLECT_CLASSIFIER (haiku+opus | haiku | opus; default haiku+opus, owner 20 Nov 2026).
const classifierMode = mainClassifierMode(process.env.COLLECT_CLASSIFIER);
/** Write-ups must come back within the run, so accepted concerts are published at once. */
const writeUpWaitMinutes = Number(process.env.WRITEUP_WAIT_MINUTES ?? 30);
// --recrawl: read every channel from its first upload again, ignoring the last read date. Needed once
// to fill long_videos for channels read before it existed; never needed for a lower view threshold.
const recrawl = args.includes("--recrawl");
// --recheck-long: look again at every remembered long video now (e.g. right after lowering the view
// threshold). Otherwise each is looked at again every LONG_RECHECK_DAYS days. Costs 1 unit per 50 videos.
const recheckLong = args.includes("--recheck-long");
const longRecheckDays = Number(process.env.LONG_RECHECK_DAYS ?? 7);
// ONLY_CHANNEL="Pinkpop Archive": read just this channel from data/channels.json (no artist channels, no searches).
// Several names separated by "|" read just those (e.g. a dry run of newly added channels).
// For a small test run, e.g. trying a lower view threshold on one channel.
const onlyChannels = onlyChannelNames(process.env.ONLY_CHANNEL);
const onlyChannel = onlyChannels !== null;
// ONLY_VIDEOS="id1,id2": decide again on just these videos (e.g. after the owner approved their artists),
// ignoring earlier verdicts. No channel reading, no searches, no long-video recheck. Stored classifier
// answers are reused, so it costs 1 YouTube unit per 50 videos and nothing on Claude.
const onlyVideos = (process.env.ONLY_VIDEOS ?? "").split(/[\s,]+/).filter(Boolean);
const limitArg = args.indexOf("--limit");
// 1500 by default since the switch to Haiku (owner, 20 Nov 2026): about $1.5-2 per 1,000 videos.
const maxClassify = Number(limitArg >= 0 ? args[limitArg + 1] : process.env.MAX_CLASSIFY_PER_RUN || 1500);
const unitBudget = Number(process.env.YOUTUBE_UNIT_BUDGET ?? 8000);
const decisionTtlDays = Number(process.env.DECISION_TTL_DAYS ?? 30);
const config = configFromEnv();

interface ChannelConfig {
  name: string;
  /** The channel's YouTube ID (UC...), when known: looked up first (1 unit), still checked against `expect`. */
  id?: string;
  handle?: string;
  search: string;
  expect: string;
  kind: ChannelKindName;
  /** Channel IDs that matched the search but are wrong (e.g. no public uploads). */
  skipIds?: string[];
}
const artistFile = JSON.parse(await readFile("data/artist-rules.json", "utf8")) as {
  include: ArtistRule[];
  exclude?: ArtistExclusion[];
  groups?: ArtistGroup[];
};
const excludedArtists = artistFile.exclude ?? [];
const artistRules = artistFile.include;
const artistGroups = artistFile.groups ?? [];
const channelFile = JSON.parse(await readFile("data/channels.json", "utf8")) as {
  channels: ChannelConfig[];
  discovery: { searchesPerRun: number; queryTemplate: string };
  /** New channels resolved per run, to spread the cost of first full reads over several days. */
  newChannelsPerRun?: number;
};

const db = createPrismaClient();
const yt = new YouTubeClient(process.env.YOUTUBE_API_KEY ?? "", unitBudget);
const run = dryRun ? null : await db.jobRun.create({ data: { job: "collect" } });
// Setlists for new concerts (description, then comments, then Claude for odd formatting).
const setlistExtractor = process.env.ANTHROPIC_API_KEY ? new SetlistExtractor() : null;
const setlistClaudeMax = Number(process.env.SETLIST_CLAUDE_MAX ?? 50);

const stats = {
  dryRun,
  viewThreshold: config.viewThreshold,
  channelsRead: 0,
  videosSeen: 0,
  ruleFailures: {} as Record<RuleFailure, number>,
  alreadyKnown: 0,
  classified: 0,
  verdicts: {} as Record<string, number>,
  created: [] as string[],
  /** New concerts published with a setlist, and those whose setlist waits for the refresh job (quota). */
  setlists: 0,
  setlistsPostponed: 0,
  errors: [] as string[],
  youtubeUnits: 0,
  claudeCostUsd: 0,
  batchesCollected: 0,
  batchSent: 0,
  reusedAnswers: 0,
  longVideosRechecked: 0,
  longVideosRemembered: 0,
  longVideosForgotten: 0,
  waitingForBatch: 0,
  classifier: classifierMode as string,
  /** Videos sent to Haiku, to Opus (second opinion or fallback) and to the write-up pass in this run. */
  haikuAsked: 0,
  opusAsked: 0,
  writeUpsAsked: 0,
  /** Accepted concerts whose write-up is not back yet: published by a later run. */
  waitingForWriteUp: 0,
  /** Kept-out videos looked at again (--reconsider), and those left out because of RECONSIDER_SCOPE. */
  reconsidered: 0,
  reconsiderSkipped: 0,
  /** Channels whose uploads could not be read for a known reason (no public uploads...): not errors. */
  skippedChannels: [] as string[],
  channelsLeftForNextRun: 0,
  stoppedEarly: "" as string,
};
const report: Record<string, unknown>[] = [];

function count<K extends string>(map: Record<K, number>, key: K) {
  map[key] = (map[key] ?? 0) + 1;
}

/** Find (once) and store the YouTube channel for each entry in data/channels.json. */
async function resolveChannels() {
  const resolved: { channelId: number; name: string; youtubeChannelId: string; uploads: string; kind: ChannelKindName; since: Date | null }[] = [];
  let newThisRun = 0;
  const newLimit = Number(process.env.NEW_CHANNELS_PER_RUN || channelFile.newChannelsPerRun || 8);
  for (const cfg of inReadingOrder(channelFile.channels)) {
    if (onlyChannels && !onlyChannels.has(cfg.name.trim().toLowerCase())) continue;
    const skip = new Set(cfg.skipIds ?? []);
    const known = await db.channel.findFirst({
      where: { name: { equals: cfg.name, mode: "insensitive" }, youtubeChannelId: { not: null }, uploadsPlaylistId: { not: null } },
    });
    let ytChannel =
      known && !skip.has(known.youtubeChannelId!)
        ? { id: known.youtubeChannelId!, title: known.name, uploadsPlaylistId: known.uploadsPlaylistId! }
        : null;
    if (!ytChannel) {
      // New channel: resolving costs up to 100 units and the first read can be large, so only a few per run.
      if (newThisRun >= newLimit) continue;
      newThisRun++;
      if (cfg.id && isYouTubeChannelId(cfg.id) && !skip.has(cfg.id)) {
        const found = await yt.channel({ id: cfg.id });
        if (found && found.uploadsPlaylistId && channelMatches(found.title, cfg.expect)) ytChannel = found;
      }
      if (!ytChannel && cfg.handle) {
        const found = await yt.channel({ handle: cfg.handle });
        if (found && !skip.has(found.id) && found.uploadsPlaylistId && channelMatches(found.title, cfg.expect)) ytChannel = found;
      }
      if (!ytChannel) {
        for (const id of await yt.searchChannels(cfg.search)) {
          if (skip.has(id)) continue;
          const found = await yt.channel({ id });
          if (found && found.uploadsPlaylistId && channelMatches(found.title, cfg.expect)) {
            ytChannel = found;
            break;
          }
        }
      }
    }
    if (!ytChannel) {
      stats.errors.push(`channel not found: ${cfg.name}${cfg.handle ? ` (handle ${cfg.handle}, search "${cfg.search}")` : ` (search "${cfg.search}"; add its @handle in data/channels.json)`}`);
      continue;
    }
    // Reuse the row created by the seed import (same name, no YouTube ID yet) when there is one.
    const byId = await db.channel.findUnique({ where: { youtubeChannelId: ytChannel.id } });
    const byName = byId ?? (await db.channel.findUnique({ where: { name: cfg.name } }));
    const data = { youtubeChannelId: ytChannel.id, uploadsPlaylistId: ytChannel.uploadsPlaylistId, kind: cfg.kind, crawl: true, isOfficial: true };
    const row = dryRun
      ? (byName ?? { id: -1, lastCrawledAt: null })
      : byName
        ? await db.channel.update({ where: { id: byName.id }, data })
        : await db.channel.create({ data: { ...data, name: cfg.name } });
    resolved.push({ channelId: row.id, name: cfg.name, youtubeChannelId: ytChannel.id, uploads: ytChannel.uploadsPlaylistId, kind: cfg.kind, since: row.lastCrawledAt });
  }
  // Official artist channels found by the refresh job.
  const artistChannels = await db.channel.findMany({ where: { kind: "ARTIST", crawl: true, youtubeChannelId: { not: null }, uploadsPlaylistId: { not: null } } });
  for (const ch of onlyChannel ? [] : artistChannels) {
    if (resolved.some((r) => r.youtubeChannelId === ch.youtubeChannelId)) continue;
    resolved.push({ channelId: ch.id, name: ch.name, youtubeChannelId: ch.youtubeChannelId!, uploads: ch.uploadsPlaylistId!, kind: "ARTIST", since: ch.lastCrawledAt });
  }
  return resolved;
}

/** MusicBrainz genres per artist, asked once per run (the decision may run twice: Haiku, then the final answer). */
const artistGenresMemo = new Map<string, Promise<string[] | null>>();
function artistGenres(name: string | undefined): Promise<string[] | null> {
  if (!name) return Promise.resolve(null);
  const key = nameKey(name);
  if (!artistGenresMemo.has(key)) artistGenresMemo.set(key, lookUpArtistGenres(name));
  return artistGenresMemo.get(key)!;
}

async function lookUpArtistGenres(name: string): Promise<string[] | null> {
  const key = nameKey(name);
  const cached = await db.artistLookup.findUnique({ where: { nameKey: key } });
  if (cached && Date.now() - cached.checkedAt.getTime() < 90 * 86_400_000) return cached.mbid ? cached.genres : null;
  try {
    const found = await lookupArtist(name);
    if (!dryRun) {
      await db.artistLookup.upsert({
        where: { nameKey: key },
        create: { nameKey: key, mbid: found?.mbid ?? null, genres: found?.genres ?? [] },
        update: { mbid: found?.mbid ?? null, genres: found?.genres ?? [], checkedAt: new Date() },
      });
    }
    return found ? found.genres : null;
  } catch (error) {
    stats.errors.push(`MusicBrainz: ${(error as Error).message}`);
    return null;
  }
}

try {
  const channels = await resolveChannels();
  const sourceKind = new Map<string, ChannelKindName>(channels.map((c) => [c.youtubeChannelId, c.kind]));
  const candidateIds = new Set<string>();
  const readChannels: typeof channels = [];
  const crawlStartedAt = new Date();

  for (const ch of onlyVideos.length ? [] : channels) {
    // Re-read two weeks before the last run: new uploads sometimes appear with an older date.
    const since = ch.since && !recrawl ? new Date(ch.since.getTime() - 14 * 86_400_000) : null;
    try {
      for (const id of await yt.playlistVideoIds(ch.uploads, since)) candidateIds.add(id);
      stats.channelsRead++;
      readChannels.push(ch); // marked as read at the end, only if all its candidates got an answer
    } catch (error) {
      if (error instanceof QuotaBudgetExceeded) throw error;
      if (error instanceof PlaylistNotFound) {
        // Not an error: YouTube has no public uploads list for this channel (no public videos, a closed
        // channel or a wrong stored ID). Skipped; it is tried again next run (1 unit).
        stats.skippedChannels.push(
          `${ch.name} (${ch.youtubeChannelId}): uploads playlist ${error.playlistId} not found on YouTube (no public uploads, closed channel or wrong ID); skipped. If it stays like this, add the ID to skipIds in data/channels.json.`,
        );
        continue;
      }
      stats.errors.push(`reading channel ${ch.name} (${ch.youtubeChannelId}): ${(error as Error).message}`);
    }
  }

  // Searches for each catalogue artist's other concerts: artists never searched first (so a newly added
  // artist's back catalogue comes in on the next runs), then the ones searched longest ago.
  const artists = await db.artist.findMany({
    where: { credits: { some: { role: "MAIN", concert: { status: "PUBLISHED" } } } },
    orderBy: [{ lastSearchedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    select: { id: true, name: true },
    take: onlyChannel || onlyVideos.length ? 0 : Number(process.env.DISCOVERY_SEARCHES || channelFile.discovery.searchesPerRun),
  });
  for (const artist of artists) {
    try {
      const ids = await yt.searchLongVideos(channelFile.discovery.queryTemplate.replace("{artist}", artist.name));
      ids.forEach((id) => candidateIds.add(id));
      if (!dryRun) await db.artist.update({ where: { id: artist.id }, data: { lastSearchedAt: new Date() } });
    } catch (error) {
      if (error instanceof QuotaBudgetExceeded) {
        stats.stoppedEarly = "YouTube budget reached during discovery";
        break;
      }
      stats.errors.push(`search ${artist.name}: ${(error as Error).message}`);
    }
  }

  // Long videos kept out earlier by things that can change (mostly views): a cheap second look.
  onlyVideos.forEach((id) => candidateIds.add(id));
  const longDue = onlyChannel || onlyVideos.length ? [] : await longVideosDue(db, { everyDays: longRecheckDays, all: recheckLong });
  longDue.forEach((id) => candidateIds.add(id));
  stats.longVideosRechecked = longDue.length;

  // --reconsider: also look again at older videos kept out earlier (not in this run's new uploads).
  const keptOutIds = new Set<string>();
  if (reconsider) {
    const keptOut = await db.videoDecision.findMany({
      where: { verdict: { in: ["UNCERTAIN", "NOT_ROCK"] } },
      select: { youtubeId: true },
    });
    keptOut.forEach((d) => {
      keptOutIds.add(d.youtubeId);
      candidateIds.add(d.youtubeId);
    });
  }

  // Drop what we already have or already decided recently.
  const ids = [...candidateIds];
  stats.videosSeen = ids.length;
  const listed = new Set<string>();
  for (const slice of chunks(ids)) {
    (await db.concert.findMany({ where: { youtubeId: { in: slice } }, select: { youtubeId: true } })).forEach((s) => listed.add(s.youtubeId));
  }
  // ONLY_VIDEOS: every earlier verdict is ignored (duplicate included); the owner asked for these again.
  const decided = onlyVideos.length
    ? new Set<string>()
    : await recentDecisions(db, ids, decisionTtlDays, reconsider ? ["UNCERTAIN", "NOT_ROCK"] : []);
  const fresh = ids.filter((id) => !listed.has(id) && !decided.has(id));
  stats.alreadyKnown = ids.length - fresh.length;

  const videos = await yt.videos(fresh);
  // Channel kind of every video: channels read this run, else our channels table, else UNKNOWN (search).
  const kindOfChannel = new Map<string, ChannelKindName>(sourceKind);
  const otherChannelIds = [...new Set([...videos.values()].map((v) => v.channelId))].filter((id) => !kindOfChannel.has(id));
  for (const slice of chunks(otherChannelIds)) {
    for (const ch of await db.channel.findMany({ where: { youtubeChannelId: { in: slice } }, select: { youtubeChannelId: true, kind: true, isOfficial: true } })) {
      kindOfChannel.set(ch.youtubeChannelId!, ch.isOfficial ? (ch.kind as ChannelKindName) : "UNKNOWN");
    }
  }
  const kindOf = (v: { channelId: string }): ChannelKindName => kindOfChannel.get(v.channelId) ?? "UNKNOWN";
  const candidates: YouTubeVideo[] = [];
  const remember: YouTubeVideo[] = [];
  const forget: string[] = [];
  for (const video of videos.values()) {
    // --reconsider with RECONSIDER_SCOPE: a kept-out video from a source outside the scope (by default a fan
    // upload) keeps its earlier verdict and is not asked again.
    if (keptOutIds.has(video.youtubeId)) {
      if (!keepForReconsider(reconsiderOnly, kindOf(video))) {
        stats.reconsiderSkipped++;
        continue;
      }
      stats.reconsidered++;
    }
    const failures = checkRules(video, config);
    failures.forEach((f) => count(stats.ruleFailures, f));
    if (failures.length === 0) candidates.push(video);
    if (worthRemembering(failures)) remember.push(video);
    // Never a concert (too short, made for kids, a trailer): no need to look again. Videos that pass stay
    // remembered until they have a verdict, so a classification left for the next run is not lost.
    else if (failures.length > 0) forget.push(video.youtubeId);
  }
  // Remembered videos YouTube no longer returns (deleted or private) are dropped, unless the batch
  // they were in was skipped after an error.
  if (!yt.skippedBatches) forget.push(...longDue.filter((id) => !videos.has(id)));
  // Already listed or decided: nothing more to learn from them.
  forget.push(...longDue.filter((id) => listed.has(id) || decided.has(id)));
  if (!dryRun) {
    await rememberLongVideos(db, remember);
    stats.longVideosRemembered = remember.length;
    stats.longVideosForgotten = await forgetLongVideos(db, forget);
  }
  // Festival and broadcaster archives first, then artist channels, then the rest (owner, 18 Nov 2026);
  // the most watched first within each, so the classification limit spends on the best sources.
  const rankOf = (v: { channelId: string }) => sourceRank(sourceKind.get(v.channelId) ?? "UNKNOWN");
  candidates.sort((a, b) => rankOf(a) - rankOf(b) || b.viewCount - a.viewCount);

  // Opus: second opinion, and the direct fallback for answers Haiku declines (it has server-side fallback).
  const classifier = new Classifier();
  // Haiku: the per-artist lane's classify and write-up passes (Batch API, cached instructions, stored answers).
  const haiku = new HaikuLane();
  let haikuCostUsd = 0;
  const waitFor = async <T,>(minutes: number, poll: () => Promise<T | null>): Promise<T | null> => {
    const deadline = Date.now() + minutes * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 30_000));
      const out = await poll();
      if (out) return out;
    }
    return null;
  };

  // 1. Answers from batches sent by earlier runs (dry runs and the per-artist lane included).
  const earlierHaiku = classifierMode === "opus" ? null : await haiku.collectPending(db);
  haikuCostUsd += earlierHaiku?.costUsd ?? 0;
  const earlier = await collectPendingBatches(db, classifier);
  stats.batchesCollected = earlier.batches + (earlierHaiku?.batches ?? 0);

  // 2. The most viewed candidates, up to the per-run limit.
  if (candidates.length > maxClassify) {
    stats.stoppedEarly = `classification limit of ${maxClassify} reached; the rest waits for the next run`;
  }
  const chosen = candidates.slice(0, maxClassify);
  const kinds = new Map<string, ChannelKindName>(chosen.map((v) => [v.youtubeId, kindOf(v)]));
  const chosenIds = chosen.map((v) => v.youtubeId);
  const byId = new Map(chosen.map((v) => [v.youtubeId, v]));

  // Artists already in the catalogue (with a published concert), with the genres their concerts have.
  const catalogueArtists = new Map<string, string[]>();
  for (const a of await db.artist.findMany({
    where: { credits: { some: { role: "MAIN", concert: { status: "PUBLISHED" } } } },
    select: {
      slug: true,
      credits: { where: { role: "MAIN" }, select: { concert: { select: { genres: { select: { genre: { select: { name: true } } } } } } } },
    },
  })) {
    const counts = new Map<string, number>();
    for (const c of a.credits) for (const g of c.concert.genres) counts.set(g.genre.name, (counts.get(g.genre.name) ?? 0) + 1);
    catalogueArtists.set(a.slug, [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([name]) => name));
  }

  /** The decision on one stored answer (the same rules whichever model answered). */
  const decideFor = async (video: YouTubeVideo, kind: ChannelKindName, stored: FullClassification) => {
    // A group name that is not an artist ("3 Are Legend") is credited to each member.
    const answer = { ...stored, mainArtists: expandGroups(stored.mainArtists, artistGroups) };
    // Artists the owner confirmed, and artists already in the catalogue (owner rule, 13 Nov 2026):
    // their full concerts come in; genres fall back to the owner's list or to the artist's existing concerts.
    const rule = findArtistRule(answer.mainArtists, artistRules);
    const known = rule ? null : catalogueArtists.get(slugify(answer.mainArtists[0] ?? ""));
    const classification: FullClassification = rule
      ? { ...answer, genres: genresForApprovedArtist(answer.genres, rule) as typeof answer.genres }
      : known
        ? { ...answer, genres: genresWithFallback(answer.genres, known) as typeof answer.genres }
        : answer;
    const textGenres = genresInText(video.title, video.description, video.tags);
    const needsMusicBrainz = kind === "MIXED" || kind === "UNKNOWN";
    const mbGenres = needsMusicBrainz ? await artistGenres(classification.mainArtists[0]) : null;
    const decision = decide(
      {
        channelKind: kind,
        // Official sources only (brief section 2): fan uploads go to the report.
        official: kind !== "UNKNOWN" || classification.uploaderIsOfficial,
        ownerApproved: Boolean(rule || known),
        excluded: isExcludedArtist(classification.mainArtists, excludedArtists),
        classification: toDecisionInput(classification),
        textGenres,
        artistGenres: mbGenres,
      },
      config,
    );
    return { decision, classification, textGenres, mbGenres };
  };

  // 3. Stored answers first: Opus's (classification_cache) and Haiku's (lane_answers, shared with the lane).
  const answersOf = async () => ({
    opus: await cachedClassifications(db, chosenIds, PROMPT_VERSION, decisionTtlDays),
    haiku:
      classifierMode === "opus"
        ? new Map<string, LaneClassification>()
        : ((await storedLaneAnswers(db, chosenIds, "classify", decisionTtlDays)) as Map<string, LaneClassification>),
  });
  let answers = await answersOf();
  stats.reusedAnswers = chosenIds.filter((id) => answers.opus.has(id) || answers.haiku.has(id)).length;
  const haikuRefused = new Set((earlierHaiku?.refused ?? []).filter((id) => byId.has(id)));
  const opusRefused = earlier.refused.filter((id) => byId.has(id));

  /** One Haiku pass (classify or write-up) for these videos: half-price batch, or straight away with --no-batch. */
  const askHaiku = async (pass: LanePass, items: { video: YouTubeVideo; channelKind?: string; classification?: FullClassification }[], minutes: number) => {
    const refused: string[] = [];
    if (!items.length) return refused;
    try {
      if (!useBatch) {
        for (const it of items) {
          const r = await haiku.direct(pass, it.video, it);
          haikuCostUsd += r.costUsd;
          if (r.answer) await storeLaneAnswer(db, it.video.youtubeId, pass, promptVersionOf(pass), r.answer);
          else if (r.error === "declined") refused.push(it.video.youtubeId);
          else stats.errors.push(`Haiku ${pass} ${it.video.youtubeId}: ${r.error}`);
        }
        return refused;
      }
      const batchId = await haiku.submit(db, pass, items);
      stats.batchSent += items.length;
      const back = await waitFor(minutes, () => haiku.collect(db, batchId));
      if (back) {
        haikuCostUsd += back.costUsd;
        refused.push(...back.refused);
        if (back.failed.length) stats.errors.push(`${back.failed.length} Haiku ${pass} answers failed (asked again next run)`);
      }
    } catch (error) {
      // A failure here (e.g. no Anthropic credit left) must not stop the run: stored answers are still used below.
      stats.errors.push(`Haiku ${pass}: ${(error as Error).message.slice(0, 300)}`);
    }
    return refused;
  };

  // 4. Haiku for every video with no stored answer (and not already waiting in a batch).
  if (classifierMode !== "opus") {
    const waiting = await videosInLaneBatches(db, "classify");
    const todo = chosenIds.filter((id) => !answers.opus.has(id) && !answers.haiku.has(id) && !waiting.has(id));
    stats.haikuAsked = todo.length;
    (await askHaiku("classify", todo.map((id) => ({ video: byId.get(id)!, channelKind: kinds.get(id)! })), batchWaitMinutes)).forEach((id) =>
      haikuRefused.add(id),
    );
    answers = await answersOf();
  }

  // 5. Opus: a second opinion where Haiku is unsure (haiku+opus), or every video (opus).
  const opusNow = async (id: string) => {
    try {
      await storeClassification(db, id, PROMPT_VERSION, await classifier.classify(byId.get(id)!, kinds.get(id)!));
    } catch (error) {
      stats.errors.push(`classify ${id}: ${(error as Error).message}`);
      if (!dryRun) await recordDecision(db, id, "ERROR", (error as Error).message);
    }
  };
  const opusWaiting = await videosInPendingBatches(db, PROMPT_VERSION);
  const opusTodo: string[] = [];
  for (const id of chosenIds) {
    const h = answers.haiku.get(id);
    const hasOpusAnswer = answers.opus.has(id) || opusWaiting.has(id);
    const verdict = h && !hasOpusAnswer ? (await decideFor(byId.get(id)!, kinds.get(id)!, pickAnswer(undefined, h)!.classification)).decision.verdict : null;
    if (needsOpus({ mode: classifierMode, hasOpusAnswer, haiku: h ?? null, haikuRefused: haikuRefused.has(id), verdict, channelKind: kinds.get(id)!, minConfidence: config.minConfidence })) {
      opusTodo.push(id);
    }
  }
  stats.opusAsked = opusTodo.length;
  if (opusTodo.length && useBatch) {
    try {
      const batchId = await submitBatch(db, classifier, opusTodo.map((id) => ({ video: byId.get(id)!, channelKind: kinds.get(id)! })));
      stats.batchSent += opusTodo.length;
      const outcome = await waitFor(batchWaitMinutes, () => collectBatch(db, classifier, batchId));
      if (outcome) {
        opusRefused.push(...outcome.refused);
        if (outcome.failed) stats.errors.push(`${outcome.failed} Opus batch answers failed (asked again next run)`);
      }
    } catch (error) {
      stats.errors.push(`could not send the Opus batch: ${(error as Error).message.slice(0, 300)}`);
    }
  } else if (opusTodo.length) {
    for (const id of opusTodo) await opusNow(id);
  }
  // Videos Opus declined in a batch get one direct try, with server-side fallback.
  for (const id of opusRefused) await opusNow(id);
  // Haiku only: a video it declined has no other classifier this run.
  if (classifierMode === "haiku" && !dryRun) {
    for (const id of haikuRefused) await recordDecision(db, id, "ERROR", "Haiku declined to classify this video");
  }
  answers = await answersOf();

  // 6. Decisions on the final answers (Opus's when there is one).
  type Ready = Awaited<ReturnType<typeof decideFor>> & { video: YouTubeVideo; kind: ChannelKindName; from: "opus" | "haiku" };
  const ready: Ready[] = [];
  for (const video of chosen) {
    const picked = pickAnswer(answers.opus.get(video.youtubeId), answers.haiku.get(video.youtubeId));
    if (!picked) continue; // still in a batch, or failed: next run
    const kind = kinds.get(video.youtubeId)!;
    ready.push({ ...(await decideFor(video, kind, picked.classification)), video, kind, from: picked.from });
  }
  stats.classified = ready.length;
  stats.waitingForBatch = chosenIds.length - ready.length;

  // 7. Original write-ups (owner rule: every new concert carries one), only for accepted concerts that
  // have none (Haiku answers; Opus answers carry their own): the lane's write-up pass, stored, dry runs too.
  const needText = ready.filter((r) => needsWriteUp(r.decision.verdict, r.classification));
  let texts = await storedLaneAnswers(db, needText.map((r) => r.video.youtubeId), "writeup", decisionTtlDays);
  const textWaiting = await videosInLaneBatches(db, "writeup");
  const textTodo = needText.filter((r) => !texts.has(r.video.youtubeId) && !textWaiting.has(r.video.youtubeId));
  stats.writeUpsAsked = textTodo.length;
  await askHaiku("writeup", textTodo.map((r) => ({ video: r.video, classification: r.classification })), writeUpWaitMinutes);
  texts = await storedLaneAnswers(db, needText.map((r) => r.video.youtubeId), "writeup", decisionTtlDays);

  // A channel counts as read only when every candidate from it got its answer (and, when accepted, its
  // write-up). Otherwise (no credit, batch not back, per-run limit reached) the next run reads it again from
  // the same point, so no older video is skipped for good.
  const done = new Set(ready.filter((r) => !needsWriteUp(r.decision.verdict, r.classification) || texts.has(r.video.youtubeId)).map((r) => r.video.youtubeId));
  const unanswered = new Set(candidates.filter((v) => !done.has(v.youtubeId)).map((v) => v.channelId));
  if (!dryRun) {
    for (const ch of readChannels) {
      if (ch.channelId > 0 && !unanswered.has(ch.youtubeChannelId)) {
        await db.channel.update({ where: { id: ch.channelId }, data: { lastCrawledAt: crawlStartedAt } });
      }
    }
  }
  stats.channelsLeftForNextRun = readChannels.filter((ch) => unanswered.has(ch.youtubeChannelId)).length;

  // 8. Publish (not in a dry run) and record the verdicts.
  for (const r of ready) {
    const { video, kind, decision, textGenres, mbGenres } = r;
    let classification = r.classification;
    let verdict: string = decision.verdict;
    let detail = decision.reason;
    if (needsWriteUp(decision.verdict, classification)) {
      const text = (texts.get(video.youtubeId) as { writeUp: string } | undefined)?.writeUp ?? "";
      if (!text.trim()) {
        // No original text yet: the concert waits for its write-up (next run, free once stored) rather than going up without one.
        stats.waitingForWriteUp++;
        report.push({ youtubeId: video.youtubeId, url: `https://www.youtube.com/watch?v=${video.youtubeId}`, title: video.title, channel: video.channelTitle, channelKind: kind, views: video.viewCount, minutes: Math.round(video.durationSeconds / 60), verdict: "WAITING_FOR_WRITE_UP", reason: detail, artists: classification.mainArtists, genres: classification.genres, confidence: classification.confidence, signals: decision.signals, musicbrainzGenres: mbGenres, answeredBy: r.from });
        continue;
      }
      classification = { ...classification, writeUp: text };
    }

    if (decision.verdict === "ACCEPTED" && !dryRun) {
      const thumbnail = await findBestThumbnail(video.youtubeId);
      const saved = await saveConcert(db, {
        video,
        classification,
        // Channels found through search are fan uploads unless the classifier recognises the uploader
        // as the artist, festival, venue, label or music media (e.g. an artist's own channel).
        channel: { youtubeChannelId: video.channelId, name: video.channelTitle, isOfficial: kind !== "UNKNOWN" || classification.uploaderIsOfficial },
        thumbnail,
      });
      if (saved.status === "duplicate") {
        verdict = "DUPLICATE";
        detail = `same concert as ${saved.ofYoutubeId}`;
      } else {
        stats.created.push(saved.slug);
        if (saved.status === "replaced") detail += `; replaced fan upload ${saved.replacedYoutubeId}`;
        try {
          const found = await lookUpSetlist(yt, video, { extractor: setlistExtractor, claudeMax: setlistClaudeMax, bands: classification.mainArtists });
          await db.concert.update({ where: { id: saved.concertId }, data: setlistFields(found, new Date()) });
          if (found.tracks) stats.setlists++;
        } catch (error) {
          // Never lose a new concert over its setlist: the refresh job looks again (setlist_checked_at stays empty).
          if (error instanceof QuotaBudgetExceeded) stats.setlistsPostponed++;
          else stats.errors.push(`setlist for ${saved.slug}: ${(error as Error).message}`);
        }
      }
    }
    count(stats.verdicts, verdict);

    if (!dryRun) {
      await recordDecision(db, video.youtubeId, verdict as Parameters<typeof recordDecision>[2], detail);
      if (verdict === "UNCERTAIN") {
        await db.reviewItem.create({
          data: {
            youtubeId: video.youtubeId,
            reason: detail,
            confidence: classification.confidence,
            payload: {
              title: video.title,
              channel: video.channelTitle,
              channelId: video.channelId,
              channelKind: kind,
              views: video.viewCount,
              durationSeconds: video.durationSeconds,
              publishedAt: video.publishedAt.toISOString(),
              classification,
              textGenres,
              musicbrainzGenres: mbGenres,
              signals: decision.signals,
            },
          },
        });
      }
    }
    report.push({
      youtubeId: video.youtubeId,
      url: `https://www.youtube.com/watch?v=${video.youtubeId}`,
      title: video.title,
      channel: video.channelTitle,
      channelKind: kind,
      views: video.viewCount,
      minutes: Math.round(video.durationSeconds / 60),
      verdict,
      reason: detail,
      artists: classification.mainArtists,
      genres: classification.genres,
      confidence: classification.confidence,
      signals: decision.signals,
      musicbrainzGenres: mbGenres,
      answeredBy: r.from,
    });
  }
  stats.claudeCostUsd = Math.round((classifier.estimatedCostUsd() + haikuCostUsd) * 100) / 100;
} catch (error) {
  if (error instanceof QuotaBudgetExceeded) stats.stoppedEarly = error.message;
  else {
    stats.errors.push((error as Error).stack ?? String(error));
    process.exitCode = 1;
  }
} finally {
  stats.youtubeUnits = yt.unitsUsed;
  if (yt.skippedBatches) stats.errors.push(`${yt.skippedBatches} batches of 50 videos skipped after YouTube errors (retried next run)`);
  if (!dryRun) {
    const expired = await expireOldData(db, decisionTtlDays);
    await db.jobRun.update({
      where: { id: run!.id },
      data: { finishedAt: new Date(), ok: process.exitCode !== 1, summary: { ...stats, expired } },
    });
  }
  await db.$disconnect();
}

// Output: console, GitHub job summary, and (for the accuracy check) a report file.
console.log(JSON.stringify(stats, null, 2));
console.log("\nVERDICT | VIEWS | CHANNEL (KIND) | TITLE | ARTISTS | GENRES | CONFIDENCE | SIGNALS | REASON");
for (const r of report) {
  console.log(
    [r.verdict, r.views, `${r.channel} (${r.channelKind})`, r.title, (r.artists as string[]).join(" + "), (r.genres as string[]).join(", "), r.confidence, (r.signals as string[]).join(", "), r.reason].join(" | "),
  );
}
await mkdir("reports", { recursive: true });
await writeFile(`reports/collect-${new Date().toISOString().slice(0, 10)}${dryRun ? "-dry-run" : ""}.json`, JSON.stringify({ stats, videos: report }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    `## Collector ${dryRun ? "(dry run: nothing published)" : ""}`,
    `- Videos seen: ${stats.videosSeen} · already known: ${stats.alreadyKnown} · classified: ${stats.classified}`,
    `- Verdicts: ${Object.entries(stats.verdicts).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`,
    `- New concerts: ${stats.created.length} (with a setlist: ${stats.setlists}${stats.setlistsPostponed ? `; ${stats.setlistsPostponed} left for the refresh job` : ""})`,
    `- Classifier: ${stats.classifier} · asked Haiku: ${stats.haikuAsked} · Opus (second opinion): ${stats.opusAsked} · write-ups: ${stats.writeUpsAsked}${stats.waitingForWriteUp ? ` (${stats.waitingForWriteUp} concerts wait for theirs)` : ""}`,
    reconsider ? `- Reconsidered (${reconsiderOnly}): ${stats.reconsidered} · left out by scope: ${stats.reconsiderSkipped}` : "",
    `- YouTube units: ${stats.youtubeUnits} · Claude cost: ~$${stats.claudeCostUsd}`,
    ...stats.skippedChannels.map((line) => `- Skipped channel: ${line}`),
    stats.stoppedEarly ? `- Stopped early: ${stats.stoppedEarly}` : "",
    stats.errors.length ? `- Errors: ${stats.errors.length} (see log)` : "",
    "",
    "| Verdict | Views | Title | Artists | Genres | Signals |",
    "|---|---|---|---|---|---|",
    ...report.map((r) => `| ${r.verdict} | ${(r.views as number).toLocaleString("en-US")} | [${String(r.title).replace(/\|/g, "/")}](${r.url}) | ${(r.artists as string[]).join(", ")} | ${(r.genres as string[]).join(", ")} | ${(r.signals as string[]).join(", ")} |`),
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.filter((l) => l !== "").join("\n") + "\n");
}
