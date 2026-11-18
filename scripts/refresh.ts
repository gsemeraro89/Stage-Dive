// YouTube rule 4 (CLAUDE.md): stored YouTube data must be refreshed or deleted at least every 30 days.
// This job asks YouTube again about every concert last refreshed 25+ days ago (all of them with --all),
// updates title, views and length, and deletes concerts that became private, deleted or non-embeddable.
// It also records each concert's channel ID and marks official artist channels for the collector.
// Run with: npm run refresh [-- --all]
import "dotenv/config";
import { appendFile } from "node:fs/promises";
import { createPrismaClient } from "../src/lib/db";
import { isDueForRefresh, refreshAction } from "../src/lib/collector/rules";
import { expireOldData } from "../src/lib/collector/store";
import { QuotaBudgetExceeded, YouTubeClient } from "../src/lib/collector/youtube";
import { TracklistExtractor } from "../src/lib/tracklist/extract";
import { lookUpTracklist, tracklistFields } from "../src/lib/tracklist/lookup";
import { slugify } from "../src/lib/slug";

const all = process.argv.includes("--all");
const db = createPrismaClient();
const yt = new YouTubeClient(process.env.YOUTUBE_API_KEY ?? "", Number(process.env.YOUTUBE_UNIT_BUDGET ?? 8000));
yt.failFast = true; // a missing answer must never be read as "the video was deleted"
const run = await db.jobRun.create({ data: { job: "refresh" } });
const now = new Date();
const stats = {
  checked: 0,
  updated: 0,
  deleted: [] as string[],
  artistChannels: 0,
  /** Concerts with a tracklist after this run, and concerts whose tracklist was dropped because it disappeared. */
  withTracklist: 0,
  tracklistsRemoved: 0,
  tracklistsNotChecked: 0,
  errors: [] as string[],
  youtubeUnits: 0,
};
// Tracklists are YouTube data too: re-read with the rest (description, comments, Claude for odd formatting).
const tracklistExtractor = process.env.ANTHROPIC_API_KEY ? new TracklistExtractor() : null;
const tracklistClaudeMax = Number(process.env.TRACKLIST_CLAUDE_MAX ?? 50);
let tracklistQuotaLeft = true;

try {
  const concerts = await db.concert.findMany({
    include: { channel: true, credits: { where: { role: "MAIN" }, include: { artist: true } } },
  });
  // Due for the 30-day refresh, or never checked for a tracklist (e.g. the collector ran out of quota).
  const due = concerts.filter((s) => all || isDueForRefresh(s.ytRefreshedAt, now) || !s.tracklistCheckedAt);
  const facts = await yt.videos(due.map((s) => s.youtubeId));

  for (const concert of due) {
    stats.checked++;
    const video = facts.get(concert.youtubeId) ?? null;
    const { action, reason } = refreshAction(video);
    if (action === "delete") {
      await db.concert.delete({ where: { id: concert.id } });
      stats.deleted.push(`${concert.slug} (${reason})`);
      continue;
    }
    await db.concert.update({
      where: { id: concert.id },
      data: {
        title: video!.title,
        viewCount: video!.viewCount,
        durationSeconds: video!.durationSeconds,
        embeddable: video!.embeddable,
        privacyStatus: video!.privacyStatus,
        madeForKids: video!.madeForKids,
        ytCheckedAt: now,
        ytRefreshedAt: now,
      },
    });
    stats.updated++;

    // Tracklist: re-read now. If the quota runs out, the old one stays and is looked at next run.
    if (tracklistQuotaLeft) {
      try {
        const found = await lookUpTracklist(yt, video!, { extractor: tracklistExtractor, claudeMax: tracklistClaudeMax });
        await db.concert.update({ where: { id: concert.id }, data: tracklistFields(found, now) });
        if (found.tracks) stats.withTracklist++;
        else if (concert.tracklist) stats.tracklistsRemoved++;
      } catch (error) {
        if (!(error instanceof QuotaBudgetExceeded)) throw error;
        tracklistQuotaLeft = false;
      }
    }
    if (!tracklistQuotaLeft) stats.tracklistsNotChecked++;

    // Fill in the channel's YouTube ID (seed concerts were imported without it).
    if (!concert.channel.youtubeChannelId && video!.channelId) {
      const other = await db.channel.findUnique({ where: { youtubeChannelId: video!.channelId } });
      if (other) await db.concert.update({ where: { id: concert.id }, data: { channelId: other.id } });
      else await db.channel.update({ where: { id: concert.channel.id }, data: { youtubeChannelId: video!.channelId } });
    }
    // A channel named like the concert's main artist is that artist's official channel: crawl it too.
    const channel = await db.channel.findUnique({ where: { youtubeChannelId: video!.channelId } });
    const isArtistChannel = concert.credits.some((c) => slugify(c.artist.name) === slugify(video!.channelTitle));
    if (channel && isArtistChannel && channel.isOfficial && channel.kind !== "ARTIST") {
      const yc = await yt.channel({ id: video!.channelId });
      if (yc) {
        await db.channel.update({ where: { id: channel.id }, data: { kind: "ARTIST", crawl: true, uploadsPlaylistId: yc.uploadsPlaylistId } });
        stats.artistChannels++;
      }
    }
  }
  await expireOldData(db, Number(process.env.DECISION_TTL_DAYS ?? 30));
} catch (error) {
  stats.errors.push((error as Error).stack ?? String(error));
  process.exitCode = 1;
} finally {
  stats.youtubeUnits = yt.unitsUsed;
  await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: process.exitCode !== 1, summary: stats } });
  await db.$disconnect();
}

console.log(JSON.stringify(stats, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Refresh\n- Checked: ${stats.checked} · updated: ${stats.updated} · deleted: ${stats.deleted.length}\n${stats.deleted.map((d) => `  - ${d}`).join("\n")}\n- Artist channels added: ${stats.artistChannels}\n- Tracklists: ${stats.withTracklist} concerts have one · removed (gone from YouTube): ${stats.tracklistsRemoved} · not checked (quota): ${stats.tracklistsNotChecked}\n- YouTube units: ${stats.youtubeUnits}\n`,
  );
}
