// Where each band is known elsewhere: MusicBrainz ID, Wikidata item and English Wikipedia article
// (src/lib/entity-links.ts), for the band pages' sameAs and "Elsewhere" line. Open data only: no
// YouTube quota, no Claude. Run with: npm run entity-links [-- --limit 200] [-- --force]
import "dotenv/config";
import { appendFile } from "node:fs/promises";
import { artistEntityLinks, LINKS_USER_AGENT, lookupArtist } from "../src/lib/collector/musicbrainz";
import { createPrismaClient } from "../src/lib/db";
import { refreshEntityLinks } from "../src/lib/entity-links";
import { wikipediaUrlFor } from "../src/lib/wikidata";

const args = process.argv.slice(2);
const limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : 200;
const force = args.includes("--force");

/** fetch that names itself as the entity links job (owner: "STAGEDIVE/1.0 ( contact-later )"). */
const namedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), "User-Agent": LINKS_USER_AGENT } });

const db = createPrismaClient();
const run = await db.jobRun.create({ data: { job: "entity-links" } });
let stats;
try {
  stats = await refreshEntityLinks(
    db,
    {
      mbid: async (name) => (await lookupArtist(name, namedFetch))?.mbid ?? null,
      links: (mbid) => artistEntityLinks(mbid, namedFetch),
      wikipedia: (qid) => wikipediaUrlFor(qid, namedFetch),
    },
    { limit, force },
  );
  await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: stats.errors.length === 0, summary: { ...stats } } });
} finally {
  await db.$disconnect();
}

console.log(JSON.stringify(stats, null, 2));
if (process.env.GITHUB_STEP_SUMMARY && stats) {
  const list = (title: string, items: string[]) => (items.length ? `\n**${title}**\n${items.map((x) => `- ${x}`).join("\n")}\n` : "");
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Entity links (MusicBrainz, Wikidata, Wikipedia)\n- Checked: ${stats.checked} · newly linked: ${stats.linked.length} · changed: ${stats.changed.length} · not found: ${stats.notFound.length}\n` +
      list("Newly linked", stats.linked) +
      list("Changed", stats.changed) +
      list("Not found on MusicBrainz", stats.notFound) +
      list("Errors", stats.errors),
  );
}
