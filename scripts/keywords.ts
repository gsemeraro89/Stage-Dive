// Keyword research (src/lib/keywords.ts): asks Google's and Bing's search suggestions about our
// bands, festivals, venues, years, genres, decades, tours and songs, plus the head terms around
// "full concert", ranks what people type and maps each phrase to the page that should rank for it,
// or to a gap. Read-only for the database. Writes reports/keywords-<date>.json and .md, and prints
// the most important rows LAST in the log (the job's artifact is not readable by the agents).
// Since 21 Nov 2026 it also ranks the bands people search for that are not on the site (src/lib/missing-bands.ts):
// the top 300 end the log (MISSING_BAND<TAB>score<TAB>phrases<TAB>name) and the list is stored in the table
// keyword_missing_bands, for the admin_ops missing-bands-check (scripts/missing-bands.ts). Its only database write.
// Run with: npm run keywords -- [--full-bands 150] [--bands N] [--venues 120] [--songs 300]
//   [--years 6] [--no-long-tail] [--minutes 150] [--delay 350] [--plan]
// --plan only builds the seeds and prints how many requests and minutes the run would take.
// On GitHub: collect.yml, input admin_ops = "keyword-research" (options, e.g.
// "keyword-research:full-bands=80,songs=100,minutes=60,long-tail=no"; the default time budget there is 120 minutes).
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getDb } from "../src/lib/db";
import { VISIBLE } from "../src/lib/filters";
import {
  askEngines,
  buildSeeds,
  countBy,
  DEFAULT_LIMITS,
  ENGINES,
  estimateMinutes,
  logTail,
  rankKeywords,
  reportMarkdown,
  type KeywordSummary,
  type KwCatalogue,
  type SeedLimits,
} from "../src/lib/keywords";
import { bandKey, missingBands, missingBandsTail, type MissingBand } from "../src/lib/missing-bands";
import { bestCatalogue, decadeIndex, filterOptions, listTours, songCatalogue, venueYearIndex } from "../src/lib/queries";
import { bestIsStrong } from "../src/lib/best";

let argv = process.argv.slice(2);
const num = (name: string): number | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined && !Number.isNaN(Number(argv[i + 1])) ? Number(argv[i + 1]) : undefined;
};
const flag = (name: string) => argv.includes(`--${name}`);

/** Everything the seeds and the page matching need, from the visible concerts only. */
export async function loadCatalogue(): Promise<KwCatalogue> {
  const db = getDb();
  const [concerts, venueYears, options, decades, tours, songs, bests] = await Promise.all([
    db.concert.findMany({
      where: VISIBLE,
      select: {
        slug: true,
        performedYear: true,
        setlistSource: true,
        venue: { select: { slug: true, name: true } },
        venueKind: { select: { slug: true } },
        credits: { where: { role: "MAIN" }, select: { artist: { select: { slug: true, name: true, aka: true } } } },
      },
    }),
    venueYearIndex(),
    filterOptions(),
    decadeIndex(),
    listTours(),
    songCatalogue(),
    bestCatalogue(),
  ]);
  const bands = new Map<string, KwCatalogue["bands"][number]>();
  const venues = new Map<string, KwCatalogue["venues"][number]>();
  const songBands = new Set(songs.map((s) => s.slug));
  for (const c of concerts) {
    const festival = c.venueKind?.slug === "festival";
    if (c.venue) {
      const v = venues.get(c.venue.slug) ?? { name: c.venue.name, slug: c.venue.slug, concerts: 0, festival: false };
      v.concerts++;
      v.festival ||= festival;
      venues.set(v.slug, v);
    }
    for (const { artist } of c.credits) {
      const b = bands.get(artist.slug) ?? { name: artist.name, slug: artist.slug, aka: artist.aka, concerts: 0, years: [], festivals: [], venues: [], hasSongs: songBands.has(artist.slug) };
      b.concerts++;
      if (c.performedYear) b.years.push(c.performedYear);
      if (c.venue) (festival ? b.festivals : b.venues).push(c.venue.name);
      bands.set(b.slug, b);
    }
  }
  return {
    bands: [...bands.values()],
    venues: [...venues.values()],
    venueYears: venueYears,
    genres: options.genres.map((g) => ({ name: g.name, slug: g.slug, count: g.count })),
    decades: decades.map((d) => ({ label: d.label, count: d.count })),
    tours: tours.map((t) => ({ name: t.name, slug: t.slug, band: t.artist?.name ?? null, bandSlug: t.artist?.slug ?? null, count: t.count })),
    songs: songs.flatMap((b) => b.songs.map((s) => ({ title: s.title, slug: s.slug, band: b.name, bandSlug: b.slug, versions: s.versions }))),
    concerts: concerts.map((c) => ({
      slug: c.slug,
      bands: c.credits.map((a) => a.artist.slug),
      venueSlug: c.venue?.slug ?? null,
      year: c.performedYear,
      hasSetlist: c.setlistSource !== null,
    })),
    bests: bests.map((b) => ({ slug: b.slug, kind: b.kind, key: b.key, strong: bestIsStrong(b) })),
  };
}

/** Run the research with these command-line style arguments (also used by scripts/admin-ops.ts). */
export async function keywordResearch(args: string[]): Promise<void> {
  argv = args;
  const started = Date.now();
  const limits: SeedLimits = {
    fullBands: num("full-bands") ?? DEFAULT_LIMITS.fullBands,
    bands: num("bands") ?? DEFAULT_LIMITS.bands,
    venues: num("venues") ?? DEFAULT_LIMITS.venues,
    songs: num("songs") ?? DEFAULT_LIMITS.songs,
    yearsPerFestival: num("years") ?? DEFAULT_LIMITS.yearsPerFestival,
    longTail: !flag("no-long-tail"),
  };
  const minutes = num("minutes") ?? 150;
  const delayMs = num("delay") ?? 350;
  const cat = await loadCatalogue();
  const seeds = buildSeeds(cat, limits);
  const plan = {
    catalogue: { bands: cat.bands.length, venues: cat.venues.length, festivalYears: cat.venueYears.length, genres: cat.genres.length, decades: cat.decades.length, tours: cat.tours.length, songs: cat.songs.length, concerts: cat.concerts.length },
    limits,
    seeds: seeds.length,
    seedsByKind: countBy(seeds, (s) => s.kind),
    requests: seeds.length * Object.keys(ENGINES).length,
    estimatedMinutes: estimateMinutes(seeds.length, delayMs),
    timeBudgetMinutes: minutes,
  };
  console.log(JSON.stringify({ plan }, null, 2));
  if (flag("plan")) return;

  const { results, asked, stoppedEarly } = await askEngines(seeds, {
    delayMs,
    deadline: started + minutes * 60_000,
    onProgress: (n) => console.log(`${n}/${seeds.length} seeds asked (${Math.round((Date.now() - started) / 60_000)} min)`),
  });
  const { rows, noise } = rankKeywords(results, cat);
  const summary: KeywordSummary = {
    generatedAt: new Date().toISOString(),
    seeds: seeds.length,
    seedsAsked: asked,
    requests: results.length,
    emptyAnswers: results.filter((r) => r.suggestions.length === 0).length,
    phrases: rows.length,
    noise: noise.length,
    stoppedEarly,
  };
  const date = summary.generatedAt.slice(0, 10);
  await mkdir("reports", { recursive: true });
  await writeFile(`reports/keywords-${date}.json`, JSON.stringify({ summary, plan, rows, noise }, null, 2));
  await writeFile(`reports/keywords-${date}.md`, reportMarkdown(rows, summary));
  // An engine that answered nothing at all was blocked: say so plainly before the rows.
  for (const engine of Object.keys(ENGINES)) {
    const mine = results.filter((r) => r.engine === engine);
    if (mine.length && mine.every((r) => r.suggestions.length === 0)) console.log(`WARNING: ${engine} returned no suggestions at all (blocked or changed).`);
  }
  // Bands people search for that we do not have: stored for missing-bands-check (a failed write does not lose the run).
  const skip = new Set(cat.bands.flatMap((b) => [b.name, b.aka ?? ""]).filter(Boolean).map(bandKey));
  const missing = missingBands(rows, { top: 300, skip });
  try {
    await storeMissingBands(missing, new Date(summary.generatedAt));
  } catch (error) {
    console.log(`WARNING: missing bands not stored: ${(error as Error).message.slice(0, 200)}`);
  }
  // The most important rows last, so the end of the log is the result; the missing bands at the very end.
  for (const line of logTail(rows, summary, 300)) console.log(line);
  for (const line of missingBandsTail(missing)) console.log(line);
}

/** Replace the stored list: new rank and score, what an earlier check found about a band is kept. */
export async function storeMissingBands(list: MissingBand[], listedAt: Date): Promise<void> {
  const db = getDb();
  await db.keywordMissingBand.deleteMany({ where: { key: { notIn: list.map((b) => b.key) } } });
  for (const b of list) {
    const data = { name: b.name, score: b.score, phrases: b.phrases, rank: b.rank, examples: b.examples, listedAt };
    await db.keywordMissingBand.upsert({ where: { key: b.key }, create: { key: b.key, ...data, mbGenres: [], ourGenres: [] }, update: data });
  }
}

/** "bands=80,songs=100,minutes=60,long-tail=no" (the admin_ops form) -> command-line arguments. */
export function keywordArgs(options: string): string[] {
  return options
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .flatMap((kv) => {
      const [k, v] = kv.split("=").map((x) => x.trim());
      if (k === "long-tail" && /^(no|false|0)$/i.test(v ?? "")) return ["--no-long-tail"];
      if (k === "plan") return ["--plan"];
      return v === undefined ? [] : [`--${k}`, v];
    });
}

// Run directly (npm run keywords), not when imported by admin-ops.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  keywordResearch(process.argv.slice(2))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => getDb().$disconnect());
}
