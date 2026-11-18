// Measures how many published concerts have a readable setlist, and where it comes from
// (description, the channel's own comment, a viewer comment). Read-only: nothing is saved to the
// database. Run with: npm run setlists [-- --claude] [-- --limit 200]
//   --claude   also ask Claude about texts that look like a setlist but the rules could not read
// YouTube quota: 1 unit per 50 concerts (descriptions) + 1 unit per concert without a setlist there (comments).
import "dotenv/config";
import { appendFile, writeFile } from "node:fs/promises";
import { createPrismaClient } from "../src/lib/db";
import { QuotaBudgetExceeded, YouTubeClient } from "../src/lib/collector/youtube";
import { fromComments, fromDescription, type SetlistSource } from "../src/lib/setlist/choose";
import { SetlistExtractor } from "../src/lib/setlist/extract";
import { isUnidentified, type Track } from "../src/lib/setlist/parse";

const args = process.argv.slice(2);
const useClaude = args.includes("--claude");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;
const sampleCount = Number(process.env.SETLIST_SAMPLES ?? 3);
const claudeMax = Number(process.env.SETLIST_CLAUDE_MAX ?? 50);

type Outcome = SetlistSource | "CLAUDE" | "UNCLEAR" | "NONE" | "GONE" | "NOT_CHECKED";
interface Row {
  slug: string;
  channel: string;
  outcome: Outcome;
  tracks: number;
  timed: boolean;
  ids: number;
  commentsOff: boolean;
  sample?: Track[];
}

const db = createPrismaClient();
const yt = new YouTubeClient(process.env.YOUTUBE_API_KEY ?? "", Number(process.env.YOUTUBE_UNIT_BUDGET ?? 3000));
const extractor = useClaude ? new SetlistExtractor() : null;
const rows: Row[] = [];
const errors: string[] = [];

try {
  const concerts = await db.concert.findMany({
    where: { status: "PUBLISHED" },
    select: {
      slug: true,
      youtubeId: true,
      durationSeconds: true,
      channel: { select: { name: true } },
      credits: { where: { role: "MAIN" }, select: { artist: { select: { name: true, aka: true } } } },
    },
    orderBy: { viewCount: "desc" },
    take: limit,
  });
  const videos = await yt.videos(concerts.map((s) => s.youtubeId));

  for (const concert of concerts) {
    const row: Row = { slug: concert.slug, channel: concert.channel.name, outcome: "NONE", tracks: 0, timed: false, ids: 0, commentsOff: false };
    rows.push(row);
    const video = videos.get(concert.youtubeId);
    if (!video) {
      row.outcome = "GONE"; // the refresh job deals with these
      continue;
    }
    const duration = video.durationSeconds || concert.durationSeconds;
    const parse = { bands: concert.credits.flatMap((c) => [c.artist.name, ...(c.artist.aka ? [c.artist.aka] : [])]) };
    let choice = fromDescription(video.description, duration, parse);
    if (!choice.chosen) {
      try {
        const comments = await yt.topComments(concert.youtubeId);
        row.commentsOff = comments.length === 0;
        const fromThread = fromComments(
          comments.map((c) => ({ text: c.text, likeCount: c.likeCount, byChannel: c.authorChannelId === video.channelId })),
          duration,
          parse,
        );
        choice = { chosen: fromThread.chosen, unclear: [...choice.unclear, ...fromThread.unclear] };
      } catch (error) {
        if (error instanceof QuotaBudgetExceeded) {
          row.outcome = "NOT_CHECKED";
          continue;
        }
        errors.push(`${concert.slug}: ${(error as Error).message}`);
      }
    }

    let tracks = choice.chosen?.tracks ?? null;
    if (choice.chosen) row.outcome = choice.chosen.source;
    else if (choice.unclear.length) {
      row.outcome = "UNCLEAR";
      if (extractor && extractor.calls < claudeMax) {
        try {
          tracks = await extractor.extract(choice.unclear[0].text, duration);
          if (tracks) row.outcome = "CLAUDE";
        } catch (error) {
          errors.push(`${concert.slug} (Claude): ${(error as Error).message}`);
        }
      }
    }
    if (tracks) {
      row.tracks = tracks.length;
      row.timed = tracks[0].time !== null;
      row.ids = tracks.filter(isUnidentified).length;
      row.sample = tracks.slice(0, 4);
    }
  }
} catch (error) {
  errors.push((error as Error).stack ?? String(error));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

// ---- Report ----
const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
const found = rows.filter((r) => r.tracks > 0);
const checked = rows.filter((r) => r.outcome !== "GONE" && r.outcome !== "NOT_CHECKED").length;
const pct = (n: number) => (checked ? `${Math.round((n / checked) * 100)}%` : "-");
const byChannel = new Map<string, { concerts: number; found: number }>();
for (const r of rows) {
  const c = byChannel.get(r.channel) ?? { concerts: 0, found: 0 };
  c.concerts++;
  if (r.tracks) c.found++;
  byChannel.set(r.channel, c);
}
const channels = [...byChannel.entries()].sort((a, b) => b[1].concerts - a[1].concerts);
const fmt = (t: Track) =>
  `${t.time === null ? "" : `${Math.floor(t.time / 60)}:${String(t.time % 60).padStart(2, "0")} `}${t.artist ? `${t.artist} - ` : ""}${t.title}`;
const samples = (o: Outcome) =>
  found
    .filter((r) => r.outcome === o)
    .slice(0, sampleCount)
    .map((r) => `  - **${r.slug}** (${r.tracks} tracks): ${r.sample!.map(fmt).join(" · ")}`)
    .join("\n");

const summary = {
  concertsChecked: checked,
  withSetlist: found.length,
  fromDescription: count("DESCRIPTION"),
  fromChannelComment: count("CHANNEL_COMMENT"),
  fromViewerComment: count("COMMENT"),
  fromClaude: count("CLAUDE"),
  unclearNotRead: count("UNCLEAR"),
  none: count("NONE"),
  commentsSwitchedOff: rows.filter((r) => r.commentsOff).length,
  goneFromYouTube: count("GONE"),
  notCheckedQuota: count("NOT_CHECKED"),
  timed: found.filter((r) => r.timed).length,
  withIdTracks: found.filter((r) => r.ids > 0).length,
  youtubeUnits: yt.unitsUsed,
  claudeCalls: extractor?.calls ?? 0,
  claudeTokens: extractor ? { input: extractor.inputTokens, output: extractor.outputTokens } : null,
  errors,
};
console.log(JSON.stringify(summary, null, 2));
await writeFile("setlist-report.json", JSON.stringify({ summary, channels: Object.fromEntries(channels), rows }, null, 2));

{
  const md = `## Setlists: how many concerts have one

**${found.length} of ${checked} concerts (${pct(found.length)})** have a setlist we can show.

| Where it came from | Concerts | Share |
|---|---|---|
| Video description | ${summary.fromDescription} | ${pct(summary.fromDescription)} |
| Comment by the channel itself | ${summary.fromChannelComment} | ${pct(summary.fromChannelComment)} |
| Viewer comment | ${summary.fromViewerComment} | ${pct(summary.fromViewerComment)} |
| Read by Claude (odd formatting) | ${summary.fromClaude} | ${pct(summary.fromClaude)} |
| Looks like a setlist, could not be read | ${summary.unclearNotRead} | ${pct(summary.unclearNotRead)} |
| Nothing found | ${summary.none} | ${pct(summary.none)} |

- With times (clickable later): ${summary.timed} · with at least one "ID" track: ${summary.withIdTracks}
- Comments switched off: ${summary.commentsSwitchedOff} · gone from YouTube: ${summary.goneFromYouTube} · not checked (quota): ${summary.notCheckedQuota}
- YouTube units used: ${summary.youtubeUnits}${extractor ? ` · Claude calls: ${summary.claudeCalls}` : ""}
${errors.length ? `- Errors: ${errors.length} (see the log)` : ""}

### By channel (concerts with a setlist / concerts)
${channels.map(([name, c]) => `- ${name}: ${c.found} / ${c.concerts}`).join("\n")}

### Examples to check by eye
- From descriptions:
${samples("DESCRIPTION") || "  - none"}
- From the channel's comment:
${samples("CHANNEL_COMMENT") || "  - none"}
- From viewer comments:
${samples("COMMENT") || "  - none"}
${extractor ? `- Read by Claude:\n${samples("CLAUDE") || "  - none"}` : ""}
`;
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
}
