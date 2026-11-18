// One-off fixes asked by the owner, run from collect.yml (input admin_ops). Operations, separated by ";":
//   merge:<from-slug>><into-slug>   two pages for the same artist become one
//   tidy-review                     close review items whose video is already a concert
//   split:<group-slug>><slug>,<slug> a group page becomes credits for each member
//   hide-concert:<concert-slug>             take a concert off the site (kept in the database)
//   reject-review:<id>,<id>         the owner said no to these videos in the review queue
import "dotenv/config";
import { closeStaleReviewItems, hideConcert, mergeArtists, rejectReviewVideos, splitArtist } from "../src/lib/admin/merge";
import { getDb } from "../src/lib/db";
import { recompute } from "../src/lib/similarity/job";

async function main() {
  const ops = (process.argv[2] ?? "").split(";").map((s) => s.trim()).filter(Boolean);
  if (!ops.length) throw new Error("no operations given");
  const db = getDb();
  const out: unknown[] = [];
  for (const op of ops) {
    const merge = op.match(/^merge:([a-z0-9-]+)>([a-z0-9-]+)$/);
    if (merge) out.push({ merge: await mergeArtists(db, merge[1], merge[2]) });
    else if (op.startsWith("reject-review:")) out.push({ reviewItemsRejected: await rejectReviewVideos(db, op.slice(14).split(",").map((x) => x.trim()).filter(Boolean)) });
    else if (op.startsWith("split:")) {
      const [group, members] = op.slice(6).split(">");
      out.push({ split: group, ...(await splitArtist(db, group, members.split(",").map((x) => x.trim()))) });
    } else if (op.startsWith("hide-concert:")) out.push({ hidden: await hideConcert(db, op.slice(9).trim()) });
    else if (op === "tidy-review") out.push({ reviewItemsClosed: await closeStaleReviewItems(db) });
    else throw new Error(`unknown operation: ${op}`);
  }
  // A merge changes who is similar to whom: recompute now rather than at the next collector run.
  if (ops.some((op) => op.startsWith("merge:") || op.startsWith("split:"))) out.push({ similarityPairs: (await recompute(db)).length });
  console.log(JSON.stringify(out, null, 2));
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
