// How many track pages would we get? Read-only: counts the tracks in the stored tracklists,
// how many are played in 2+ sets (the pages Google would index, BRIEF 4.8), the most played,
// and examples of one track written in different ways. Uses no YouTube quota and no Claude.
// Run with: npm run track-stats
import "dotenv/config";
import { appendFile } from "node:fs/promises";
import { createPrismaClient } from "../src/lib/db";
import { readTracklist } from "../src/lib/tracklist/view";
import { trackKey } from "../src/lib/tracks/normalize";

const db = createPrismaClient();
const sets = await db.set.findMany({
  where: { status: "PUBLISHED", tracklistSource: { not: null } },
  select: { slug: true, tracklist: true, tracklistSource: true },
});
await db.$disconnect();

interface Version {
  songKey: string;
  label: string;
  sets: Set<string>;
  spellings: Set<string>;
}
const versions = new Map<string, Version>();
let lines = 0;
let idLines = 0;
let noArtist = 0;

for (const set of sets) {
  const view = readTracklist(set.tracklist, set.tracklistSource);
  for (const t of view?.tracks ?? []) {
    lines++;
    if (t.unidentified || (t.artist && /^ID$/i.test(t.artist))) {
      idLines++;
      continue;
    }
    const key = trackKey(t.artist, t.title);
    if (!key) {
      noArtist++;
      continue;
    }
    const spelling = `${t.artist} – ${t.title}`;
    const v = versions.get(key.versionKey) ?? { songKey: key.songKey, label: spelling, sets: new Set(), spellings: new Set() };
    v.sets.add(set.slug);
    v.spellings.add(spelling);
    versions.set(key.versionKey, v);
  }
}

const all = [...versions.values()];
const songs = new Map<string, Version[]>();
for (const v of all) songs.set(v.songKey, [...(songs.get(v.songKey) ?? []), v]);
const inAtLeast = (n: number) => all.filter((v) => v.sets.size >= n).length;
const top = [...all].sort((a, b) => b.sets.size - a.sets.size).slice(0, 20);
const merged = all.filter((v) => v.spellings.size > 1).slice(0, 10);
const multiVersion = [...songs.values()].filter((vs) => vs.length > 1);

const md = `## Track pages: how many we would get

From **${sets.length} sets with a tracklist** (${lines} lines: ${idLines} "ID", ${noArtist} without an artist, e.g. "Intro").

| | Count |
|---|---|
| Distinct tracks (one page per version) | **${all.length}** |
| Played in 2 or more sets (indexed by Google) | **${inAtLeast(2)}** |
| Played in 3 or more sets | ${inAtLeast(3)} |
| Played in only 1 set (page exists, not indexed) | ${all.length - inAtLeast(2)} |
| Songs with more than one version (original + remixes) | ${multiVersion.length} |

### Most played
${top.map((v, i) => `${i + 1}. ${v.label} — ${v.sets.size} sets`).join("\n")}

### Same track written differently (merged into one page)
${merged.map((v) => `- ${[...v.spellings].map((s) => `"${s}"`).join(" = ")}`).join("\n") || "- none found"}

### Songs with several versions (linked to each other)
${multiVersion.slice(0, 10).map((vs) => `- ${vs.map((v) => `"${v.label}" (${v.sets.size})`).join(" · ")}`).join("\n") || "- none found"}
`;
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
