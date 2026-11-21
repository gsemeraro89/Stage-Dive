// Bands people search for that are not on the site (owner, 21 Nov 2026), from the table keyword_missing_bands that
// each keyword-research run fills (src/lib/missing-bands.ts). Run from collect.yml, input admin_ops:
//   missing-bands-check[:top=N]     DRY RUN. The N best-ranked bands (default 40, at most 300): MusicBrainz identity
//                                   and genres; only bands whose genres are in our families (rock, trip hop, big beat,
//                                   art pop; not pop, hip hop, country, jazz...) go on; then the per-artist lane for
//                                   them only (scripts/artist-lane.ts --rules-file --dry-run): official channel, one
//                                   YouTube search each (100 units, within the run's unit budget; searches are stored and
//                                   never repeated, so a second run goes on with the next bands), Claude Haiku on the
//                                   long official videos, write-ups for accepted concerts (so publishing pays nothing
//                                   twice). The end of the log: per band what would be published (MISSING_BAND_RESULT)
//                                   and each concert (MISSING_BAND_CONCERT). data/artist-rules.json is not changed.
//   missing-bands-publish[:top=N]   the same for real, after the owner's OK: publishes the concerts of the bands of the
//   missing-bands-publish:names=A|B  last check whose genres are ours (top=N: the first N of the ranking; names=: only
//                                   these, as written in the check's log), then profiles, entity links, pictures,
//                                   similar artists and IndexNow (the steps a collector run does after publishing).
// Option for both: no-batch (Claude straight away at full price instead of the half-price batch).
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { PrismaClient } from "../src/generated/prisma/client";
import { resolveArtistIdentity } from "../src/lib/collector/musicbrainz";
import { findArtistRule, isExcludedArtist, type ArtistExclusion, type ArtistRule } from "../src/lib/collector/rules";
import { genreFamily, missingBandsArgs } from "../src/lib/missing-bands";

const RULES_FILE = "reports/missing-bands-rules.json";

/** Owner's lists: a band already there is not "missing" (the normal lane follows it), an excluded one never goes on. */
async function ownerLists() {
  const file = JSON.parse(await readFile("data/artist-rules.json", "utf8")) as { include: ArtistRule[]; exclude?: ArtistExclusion[] };
  return { include: file.include, exclude: file.exclude ?? [] };
}

/** MusicBrainz identity and genre family for the first `top` bands (or the named ones); stored in the table. */
async function checkBands(db: PrismaClient, opts: { top: number; names: string[] }) {
  const lists = await ownerLists();
  const rows = await db.keywordMissingBand.findMany({ orderBy: { rank: "asc" }, ...(opts.names.length ? {} : { take: opts.top }) });
  const wanted = opts.names.length ? rows.filter((r) => opts.names.some((n) => n.toLowerCase() === r.name.toLowerCase())) : rows;
  for (const r of wanted) {
    let data: { verdict: string; mbid: string | null; mbGenres: string[]; ourGenres: string[] };
    if (findArtistRule([r.name], lists.include)) data = { verdict: "LISTED", mbid: null, mbGenres: [], ourGenres: [] };
    else if (isExcludedArtist([r.name], lists.exclude)) data = { verdict: "EXCLUDED", mbid: null, mbGenres: [], ourGenres: [] };
    else {
      try {
        const id = await resolveArtistIdentity(r.name);
        const family = genreFamily(id.genres);
        data = id.mbid
          ? { verdict: family.family, mbid: id.mbid, mbGenres: id.genres.slice(0, 15), ourGenres: family.ours }
          : { verdict: "NO_IDENTITY", mbid: null, mbGenres: [], ourGenres: [] };
      } catch (error) {
        console.log(`MusicBrainz ${r.name}: ${(error as Error).message.slice(0, 120)}`);
        continue;
      }
    }
    await db.keywordMissingBand.update({ where: { key: r.key }, data: { ...data, checkedAt: new Date() } });
  }
  return db.keywordMissingBand.findMany({ where: { key: { in: wanted.map((r) => r.key) } }, orderBy: { rank: "asc" } });
}

/** The lane's rules file for the bands whose genres are ours: approved for that run only. */
async function writeRules(bands: { name: string; mbid: string | null; ourGenres: string[] }[]) {
  const include: ArtistRule[] = bands.map((b) => ({ name: b.name, genres: b.ourGenres, allConcerts: true, ...(b.mbid ? { mbid: b.mbid } : {}) }));
  await mkdir("reports", { recursive: true });
  await writeFile(RULES_FILE, JSON.stringify({ include }, null, 2));
  return include;
}

function run(cmd: string, args: string[]): number {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  return r.status ?? 1;
}

export async function missingBandsOp(db: PrismaClient, op: string): Promise<void> {
  const publish = op.startsWith("missing-bands-publish");
  const opts = missingBandsArgs(op);
  let bands;
  if (publish) {
    // Publishing follows the last check: only bands MusicBrainz put in our families then (no new lookups).
    const rows = await db.keywordMissingBand.findMany({ where: { verdict: "OURS" }, orderBy: { rank: "asc" } });
    bands = opts.names.length ? rows.filter((r) => opts.names.some((n) => n.toLowerCase() === r.name.toLowerCase())) : rows.filter((r) => r.rank <= opts.top);
    const unknown = opts.names.filter((n) => !rows.some((r) => r.name.toLowerCase() === n.toLowerCase()));
    if (unknown.length) console.log(`Not published (not checked, or genres not ours): ${unknown.join(", ")}`);
  } else {
    const checked = await checkBands(db, opts);
    console.log(`==== MISSING BANDS CHECK: MusicBrainz (rank, verdict, our genres, MusicBrainz genres, name) ====`);
    for (const r of checked) console.log(`MISSING_BAND_CHECK\t${r.rank}\t${r.verdict}\t${r.ourGenres.join(", ")}\t${r.mbGenres.slice(0, 6).join(", ")}\t${r.name}`);
    bands = checked.filter((r) => r.verdict === "OURS");
  }
  if (!bands.length) {
    console.log("No band to look for: run keyword-research first, then missing-bands-check.");
    return;
  }
  const rules = await writeRules(bands);
  console.log(`Per-artist lane for ${rules.length} bands (${publish ? "publishing" : "dry run"}): ${rules.map((r) => r.name).join(", ")}`);
  if (publish) console.log(`To keep following them in every lane run, add to data/artist-rules.json "include":\n${JSON.stringify(rules)}`);
  const laneArgs = ["tsx", "scripts/artist-lane.ts", "--rules-file", RULES_FILE, ...(publish ? [] : ["--dry-run"]), ...(opts.noBatch ? ["--no-batch"] : [])];
  const status = run("npx", laneArgs);
  if (status !== 0) throw new Error(`artist lane ended with status ${status}`);
  if (publish) {
    // What a collector run does after publishing (collect.yml skips these steps for admin_ops).
    for (const script of [["profiles"], ["entity-links"], ["artist-images"], ["similarity", "--", "--no-fetch"], ["indexnow"]]) {
      const s = run("npm", ["run", ...script]);
      if (s !== 0) console.log(`WARNING: npm run ${script[0]} ended with status ${s}`);
    }
  }
}
