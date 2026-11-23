// One-off fixes asked by the owner, run from collect.yml (input admin_ops). Operations, separated by ";":
//   merge:<from-slug>><into-slug>   two pages for the same artist become one
//   tidy-review                     close review items whose video is already a concert
//   split:<group-slug>><slug>,<slug> a group page becomes credits for each member
//   hide-concert:<concert-slug>             take a concert off the site (kept in the database)
//   reject-review:<id>,<id>         the owner said no to these videos in the review queue
//   merge-venue:<from-slug>><into-slug>  two records for the same venue become one; the old address redirects
//   normalize-countries             every country written as its full English name ("NL" -> "Netherlands")
//   news[:dry]                      the news job now (src/lib/news): "news" writes and publishes within
//                                   NEWS_BUDGET_USD; "news:dry" only reads the feeds and lists what would go
//                                   to Claude (no Claude cost, nothing written)
//   news-feeds                      check every press feed of data/news-feeds.json (which ones answer)
//   news-subjects[:all]             give every news article its subject (the band or festival it is mainly about,
//                                   for its picture; src/lib/news/subject.ts): articles without one, or all of them
//   festival-photos[:force]         free festival photos for news pictures (Wikidata/Commons, photocopied, with credit;
//                                   src/lib/news/festival-photos.ts): festivals not looked at in 30 days, or all (force)
//   keyword-research[:k=v,...]      keyword research (scripts/keywords.ts; read-only, no quota, no Claude):
//                                   e.g. keyword-research:full-bands=80,songs=100,minutes=60,long-tail=no
//                                   News searches (tours, line-ups, new albums) for the top news-bands=50 bands and
//                                   news-festivals=30 festivals, reported in their own "news" block.
//                                   Runs after the other operations, so its result ends the log.
//   backfill-tours[:limit]          tours for listed concerts (src/lib/collector/tour-backfill.ts): re-reads title and
//                                   description (videos.list, 1 unit per 50), regex first, Claude Haiku (Batch API) only
//                                   when unsure; answers stored, never paid twice. Options: backfill-tours:limit=500,wait=30,no-batch
//   missing-bands-check[:top=N]     bands people search for that are not on the site (scripts/missing-bands.ts): DRY RUN of
//                                   the per-artist lane for the N best-ranked whose MusicBrainz genres are ours
//   missing-bands-publish[:top=N]   the same for real, after the owner's OK (or missing-bands-publish:names=A|B)
//                                   Both run after the one-off fixes, before keyword-research.
import "dotenv/config";
import { closeStaleReviewItems, hideConcert, mergeArtists, mergeVenues, normalizeCountries, rejectReviewVideos, splitArtist } from "../src/lib/admin/merge";
import { getDb } from "../src/lib/db";
import { checkFeeds } from "../src/lib/news/job";
import { refreshFestivalPhotos } from "../src/lib/news/festival-photos";
import { runNews } from "../src/lib/news/run";
import { backfillNewsSubjects } from "../src/lib/news/subject";
import { recompute } from "../src/lib/similarity/job";
import { keywordArgs, keywordResearch } from "./keywords";
import { missingBandsOp } from "./missing-bands";
import { HaikuLane } from "../src/lib/collector/haiku";
import { backfillTours, tourBackfillArgs } from "../src/lib/collector/tour-backfill";
import { YouTubeClient } from "../src/lib/collector/youtube";

async function main() {
  const all = (process.argv[2] ?? "").split(";").map((s) => s.trim()).filter(Boolean);
  if (!all.length) throw new Error("no operations given");
  const research = all.filter((op) => /^keyword-research(:|$)/.test(op));
  const missing = all.filter((op) => /^missing-bands-(check|publish)(:|$)/.test(op));
  const ops = all.filter((op) => !research.includes(op) && !missing.includes(op));
  const db = getDb();
  const out: unknown[] = [];
  for (const op of ops) {
    const merge = op.match(/^merge:([a-z0-9-]+)>([a-z0-9-]+)$/);
    const mergeVenue = op.match(/^merge-venue:([a-z0-9-]+)>([a-z0-9-]+)$/);
    if (mergeVenue) out.push({ mergeVenue: await mergeVenues(db, mergeVenue[1], mergeVenue[2]) });
    else if (op === "normalize-countries") out.push({ normalizeCountries: await normalizeCountries(db) });
    else if (merge) out.push({ merge: await mergeArtists(db, merge[1], merge[2]) });
    else if (op.startsWith("reject-review:")) out.push({ reviewItemsRejected: await rejectReviewVideos(db, op.slice(14).split(",").map((x) => x.trim()).filter(Boolean)) });
    else if (op.startsWith("split:")) {
      const [group, members] = op.slice(6).split(">");
      out.push({ split: group, ...(await splitArtist(db, group, members.split(",").map((x) => x.trim()))) });
    } else if (op.startsWith("hide-concert:")) out.push({ hidden: await hideConcert(db, op.slice("hide-concert:".length).trim()) });
    else if (op === "tidy-review") out.push({ reviewItemsClosed: await closeStaleReviewItems(db) });
    else if (/^backfill-tours(:|$)/.test(op)) {
      const yt = new YouTubeClient(process.env.YOUTUBE_API_KEY ?? "", Number(process.env.YOUTUBE_UNIT_BUDGET ?? 8000));
      const haiku = process.env.ANTHROPIC_API_KEY ? new HaikuLane() : null;
      const result = await backfillTours(db, yt, haiku, tourBackfillArgs(op));
      const tours = await db.tour.findMany({ where: { concerts: { some: { status: "PUBLISHED" } } }, select: { slug: true, name: true, _count: { select: { concerts: { where: { status: "PUBLISHED" } } } } }, orderBy: { name: "asc" } });
      out.push({ backfillTours: result, tours: tours.map((t) => `${t._count.concerts}\t/tours/${t.slug}\t${t.name}`) });
    }
    else if (op === "news" || op === "news:dry") out.push({ news: await runNews(db, { dryRun: op === "news:dry" }) });
    else if (op === "news-feeds") out.push({ newsFeeds: await checkFeeds() });
    else if (op === "news-subjects" || op === "news-subjects:all") out.push({ newsSubjects: await backfillNewsSubjects(db, { all: op.endsWith(":all") }) });
    else if (op === "festival-photos" || op === "festival-photos:force")
      out.push({ festivalPhotos: await refreshFestivalPhotos(db, undefined, { force: op.endsWith(":force"), limit: op.endsWith(":force") ? 500 : undefined }) });
    else throw new Error(`unknown operation: ${op}`);
  }
  // A merge changes who is similar to whom: recompute now rather than at the next collector run.
  if (ops.some((op) => op.startsWith("merge:") || op.startsWith("split:"))) out.push({ similarityPairs: (await recompute(db)).length });
  if (ops.length) console.log(JSON.stringify(out, null, 2));
  // The missing bands' lane prints its result at the end of its output.
  for (const op of missing) await missingBandsOp(db, op);
  // Keyword research last: the end of the job log is its result (the agents cannot read artifacts).
  // In the job, the time budget defaults to 120 minutes (collect.yml allows 180, and other jobs queue behind it).
  for (const op of research) {
    const args = keywordArgs(op.split(":")[1] ?? "");
    await keywordResearch(args.includes("--minutes") ? args : [...args, "--minutes", "120"]);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
