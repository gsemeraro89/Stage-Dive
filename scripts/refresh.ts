// YouTube rule 4 (CLAUDE.md): stored YouTube data must be refreshed or deleted at least every 30 days.
// This job asks YouTube again about every concert last refreshed 25+ days ago (all of them with --all),
// updates title, views and length. Concerts whose video became private, deleted, non-embeddable or
// blocked in a key country are hidden (status REMOVED, YouTube data cleared), not deleted: that is a
// normal outcome, not an error, and they come back by themselves if the video does.
// It also records each concert's channel ID and marks official artist channels for the collector.
// Run with: npm run refresh [-- --all]
import "dotenv/config";
import { appendFile } from "node:fs/promises";
import { createPrismaClient } from "../src/lib/db";
import { Prisma } from "../src/generated/prisma/client";
import { bootlegStatusAfterRefresh, isDueForRefresh, refreshAction, statusAfterRefresh } from "../src/lib/collector/rules";
import { expireOldData, syncBootlegTwins } from "../src/lib/collector/store";
import { QuotaBudgetExceeded, YouTubeClient } from "../src/lib/collector/youtube";
import { SetlistExtractor } from "../src/lib/setlist/extract";
import { lookUpSetlist, setlistFields } from "../src/lib/setlist/lookup";
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
  /** Concerts hidden in this run because their video is gone, private, not embeddable or region-blocked. */
  removed: [] as string[],
  /** Removed concerts whose video is back. */
  restored: [] as string[],
  artistChannels: 0,
  /** Concerts with a setlist after this run, and concerts whose setlist was dropped because it disappeared. */
  withSetlist: 0,
  setlistsRemoved: 0,
  setlistsNotChecked: 0,
  /** Bootlegs hidden because an official version is listed, and hidden bootlegs shown again because it went. */
  bootlegsHidden: [] as string[],
  bootlegsRestored: [] as string[],
  errors: [] as string[],
  youtubeUnits: 0,
};
// Setlists are YouTube data too: re-read with the rest (description, comments, Claude for odd formatting).
const setlistExtractor = process.env.ANTHROPIC_API_KEY ? new SetlistExtractor() : null;
const setlistClaudeMax = Number(process.env.SETLIST_CLAUDE_MAX ?? 50);
let setlistQuotaLeft = true;

try {
  const concerts = await db.concert.findMany({
    include: { channel: true, credits: { where: { role: "MAIN" }, include: { artist: true } } },
  });
  // Due for the 30-day refresh, never checked for a setlist (e.g. the collector ran out of quota), or
  // removed earlier (checked every night, so a video that comes back is shown again quickly).
  const due = concerts.filter(
    (s) => all || s.status === "REMOVED" || isDueForRefresh(s.ytRefreshedAt, now) || !s.setlistCheckedAt,
  );
  const facts = await yt.videos(due.map((s) => s.youtubeId));

  for (const concert of due) {
    stats.checked++;
    const video = facts.get(concert.youtubeId) ?? null;
    const { action, reason } = refreshAction(video);
    // Bootlegs are treated like any concert; one hidden behind its official twin becomes REMOVED if its video goes.
    const bootleg = concert.sourceKind === "FAN_PRO_SHOT";
    const hiddenByTwin = bootleg && concert.officialTwinId !== null;
    const status = bootleg ? bootlegStatusAfterRefresh(concert.status, action, hiddenByTwin) : statusAfterRefresh(concert.status, action);
    if (action === "remove") {
      // Normal, not an error: hide it and clear what YouTube gave us (rule 4). Our own text, venue,
      // date and genres stay, so it can come back as it was.
      if (concert.status !== "REMOVED") stats.removed.push(`${concert.slug} (${reason})`);
      await db.concert.update({
        where: { id: concert.id },
        data: {
          status,
          ...(status === "REMOVED" && hiddenByTwin ? { officialTwinId: null } : {}),
          title: "",
          creditName: null,
          viewCount: 0,
          durationSeconds: 0,
          thumbnailUrl: null,
          setlist: Prisma.DbNull,
          setlistSource: null,
          setlistCheckedAt: now,
          embeddable: video?.embeddable ?? false,
          privacyStatus: video?.privacyStatus ?? "deleted",
          ytCheckedAt: now,
          ytRefreshedAt: now,
        },
      });
      continue;
    }
    if (concert.status === "REMOVED" && status === "PUBLISHED") stats.restored.push(concert.slug);
    await db.concert.update({
      where: { id: concert.id },
      data: {
        status,
        title: video!.title,
        // The fan channel's name for a bootleg's credit is YouTube data too: refreshed with the rest.
        ...(bootleg ? { creditName: video!.channelTitle } : {}),
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

    // Setlist: re-read now. If the quota runs out, the old one stays and is looked at next run.
    if (setlistQuotaLeft) {
      try {
        const found = await lookUpSetlist(yt, video!, {
          extractor: setlistExtractor,
          claudeMax: setlistClaudeMax,
          bands: concert.credits.flatMap((c) => [c.artist.name, ...(c.artist.aka ? [c.artist.aka] : [])]),
        });
        await db.concert.update({ where: { id: concert.id }, data: setlistFields(found, now) });
        if (found.tracks) stats.withSetlist++;
        else if (concert.setlist) stats.setlistsRemoved++;
      } catch (error) {
        if (!(error instanceof QuotaBudgetExceeded)) throw error;
        setlistQuotaLeft = false;
      }
    }
    if (!setlistQuotaLeft) stats.setlistsNotChecked++;

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
  // Bootlegs (owner, 20 Nov 2026): an official version always wins; hidden bootlegs come back if it goes.
  const twins = await syncBootlegTwins(db);
  stats.bootlegsHidden = twins.hidden;
  stats.bootlegsRestored = twins.restored;
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
    `## Refresh\n- Checked: ${stats.checked} · updated: ${stats.updated} · hidden as removed: ${stats.removed.length} · back: ${stats.restored.length}\n${[...stats.removed.map((d) => `  - removed: ${d}`), ...stats.restored.map((d) => `  - back: ${d}`)].join("\n")}\n- Bootlegs hidden behind an official version: ${stats.bootlegsHidden.length} · shown again: ${stats.bootlegsRestored.length}\n- Artist channels added: ${stats.artistChannels}\n- Setlists: ${stats.withSetlist} concerts have one · removed (gone from YouTube): ${stats.setlistsRemoved} · not checked (quota): ${stats.setlistsNotChecked}\n- YouTube units: ${stats.youtubeUnits}\n`,
  );
}
