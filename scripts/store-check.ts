// One-off, read-only check (owner request 13 Nov 2026): how many tracks from our tracklists can be
// bought on Beatport, and on iTunes for comparison, before opening affiliate accounts.
// Polite: a random sample, one request every 3 seconds, robots.txt respected. No YouTube quota, no Claude.
// Run with: npm run store-check [-- --sample 120]
import "dotenv/config";
import { appendFile } from "node:fs/promises";
import { createPrismaClient } from "../src/lib/db";
import { readTracklist } from "../src/lib/tracklist/view";
import { artistKey, baseTitle, trackKey, versionName } from "../src/lib/tracks/normalize";
import { slugify } from "../src/lib/slug";

const args = process.argv.slice(2);
const sampleArg = args.indexOf("--sample");
const SAMPLE = Number(sampleArg >= 0 ? args[sampleArg + 1] : 120);
const UA = "OpenDecks-store-check/0.1 (one-off catalogue coverage check)";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Track { artist: string; title: string }
interface Hit { artists: string[]; title: string; mix: string }

// 1. Distinct nameable tracks from the stored tracklists.
const db = createPrismaClient();
const sets = await db.set.findMany({ where: { status: "PUBLISHED", tracklistSource: { not: null } }, select: { tracklist: true, tracklistSource: true } });
await db.$disconnect();
const byVersion = new Map<string, Track>();
for (const s of sets)
  for (const t of readTracklist(s.tracklist, s.tracklistSource)?.tracks ?? []) {
    if (t.unidentified || !t.artist) continue;
    const key = trackKey(t.artist, t.title);
    if (key && !byVersion.has(key.versionKey)) byVersion.set(key.versionKey, { artist: t.artist, title: t.title });
  }
// Deterministic shuffle so a re-run checks the same sample.
const all = [...byVersion.entries()].sort((a, b) => hash(a[0]) - hash(b[0])).map(([, t]) => t);
const sample = all.slice(0, SAMPLE);
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// 2. Matching: same base title and at least one artist in common; "exact" also needs the same version.
const artistSet = (a: string) => new Set(a.split(/\s*(?:,|&|\bx\b|\band\b|\bvs\.?|\bb2b\b|\bfeat\.?|\bft\.?|\bwith\b)\s*/i).map(artistKey).filter(Boolean));
function match(t: Track, hits: Hit[]): "exact" | "song" | null {
  const base = slugify(baseTitle(t.title));
  const version = slugify(versionName(t.title));
  const mine = artistSet(t.artist);
  let best: "exact" | "song" | null = null;
  for (const h of hits) {
    if (slugify(baseTitle(h.title)) !== base) continue;
    const theirs = new Set(h.artists.flatMap((a) => [...artistSet(a)]));
    if (![...mine].some((a) => theirs.has(a))) continue;
    const hv = slugify(versionName(`${h.title}${h.mix ? ` (${h.mix})` : ""}`));
    const sameVersion = hv === version || (!version && /^(original|extended)(-mix)?$/.test(hv));
    if (sameVersion) return "exact";
    best = "song";
  }
  return best;
}

// 3a. Beatport: public search page; results are in the page's __NEXT_DATA__ JSON.
async function beatportAllowed(): Promise<boolean> {
  const res = await fetch("https://www.beatport.com/robots.txt", { headers: { "User-Agent": UA } });
  if (!res.ok) return true;
  let applies = false;
  for (const line of (await res.text()).split("\n")) {
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    if (/^user-agent$/i.test(k.trim())) applies = v === "*";
    else if (applies && /^disallow$/i.test(k.trim()) && v && "/search/tracks".startsWith(v)) return false;
  }
  return true;
}
function collectTracks(node: unknown, out: Hit[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((n) => collectTracks(n, out));
  const o = node as Record<string, unknown>;
  const title = (o.track_name ?? o.name) as unknown;
  const artists = o.artists as unknown;
  if (typeof title === "string" && Array.isArray(artists) && artists.length) {
    out.push({
      title,
      mix: typeof o.mix_name === "string" ? o.mix_name : "",
      artists: artists.map((a) => (a as Record<string, unknown>)?.artist_name ?? (a as Record<string, unknown>)?.name).filter((x): x is string => typeof x === "string"),
    });
  }
  for (const v of Object.values(o)) collectTracks(v, out);
}
async function beatport(t: Track): Promise<Hit[]> {
  const res = await fetch(`https://www.beatport.com/search/tracks?q=${encodeURIComponent(`${t.artist} ${baseTitle(t.title)}`)}`, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) throw new Error(`Beatport ${res.status}`);
  const m = (await res.text()).match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Beatport page without data");
  const hits: Hit[] = [];
  collectTracks(JSON.parse(m[1]), hits);
  return hits;
}
// 3b. iTunes Search API (official, free, no key).
async function itunes(t: Track): Promise<Hit[]> {
  const res = await fetch(`https://itunes.apple.com/search?entity=song&limit=15&term=${encodeURIComponent(`${t.artist} ${baseTitle(t.title)}`)}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  const data = (await res.json()) as { results?: { trackName?: string; artistName?: string }[] };
  return (data.results ?? []).map((r) => ({ title: r.trackName ?? "", mix: "", artists: [r.artistName ?? ""] }));
}

const allowed = await beatportAllowed();
const counts = { beatport: { exact: 0, song: 0, none: 0, error: 0 }, itunes: { exact: 0, song: 0, none: 0, error: 0 } };
const missing: string[] = [];
for (const t of sample) {
  const label = `${t.artist} – ${t.title}`;
  let bp: "exact" | "song" | null | "error" = null;
  if (allowed) {
    try {
      bp = match(t, await beatport(t));
    } catch (e) {
      bp = "error";
      console.error(label, (e as Error).message);
    }
  }
  let it: "exact" | "song" | null | "error";
  try {
    it = match(t, await itunes(t));
  } catch {
    it = "error";
  }
  const add = (c: typeof counts.beatport, r: typeof bp) => (r === "error" ? c.error++ : r ? c[r]++ : c.none++);
  if (allowed) add(counts.beatport, bp);
  add(counts.itunes, it);
  if (allowed && !bp && !it) missing.push(label);
  console.log(`${String(bp).padEnd(5)} ${String(it).padEnd(5)} ${label}`);
  await wait(3000);
}

const pct = (n: number) => `${Math.round((100 * n) / sample.length)}%`;
const row = (name: string, c: typeof counts.beatport) =>
  `| ${name} | ${c.exact} (${pct(c.exact)}) | ${c.song} (${pct(c.song)}) | ${pct(c.exact + c.song)} | ${c.none} | ${c.error} |`;
const md = `## Can our tracklist tracks be bought?

${byVersion.size} distinct tracks in ${sets.length} tracklists; random sample of **${sample.length}**.
${allowed ? "" : "\n**Beatport not checked: its robots.txt disallows the search pages.**\n"}
| Store | Same version | Song found, other version | Total | Not found | Errors |
|---|---|---|---|---|---|
${allowed ? row("Beatport", counts.beatport) + "\n" : ""}${row("iTunes", counts.itunes)}

### Not found anywhere (first 25)
${missing.slice(0, 25).map((m) => `- ${m}`).join("\n") || "- none"}
`;
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
