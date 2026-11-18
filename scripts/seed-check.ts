// Checks the owner's seed candidates (data/seed-concerts.csv) with the YouTube Data API and writes
// data/seed-concerts.json (the concerts that pass) and data/seed-check-report.md (every row, with why).
// Cost: 1 quota unit per 50 videos. Needs YOUTUBE_API_KEY. Run with: npm run seed-check
// Rows whose uploader cannot be confirmed as official are left out and listed for the owner to decide;
// add their YouTube IDs to SEED_APPROVED_UPLOADERS (comma-separated) to take them in as official.
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { YouTubeClient } from "../src/lib/collector/youtube";
import { checkRow, parseCsv, type CsvRow, type RowOutcome } from "../src/lib/seed/check";
import type { SeedFile } from "../src/lib/seed/normalize";

const key = process.env.YOUTUBE_API_KEY;
if (!key) {
  console.error("YOUTUBE_API_KEY is not set. Put it in .env (see .env.example).");
  process.exit(1);
}
const approved = new Set((process.env.SEED_APPROVED_UPLOADERS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const today = new Date().toISOString().slice(0, 10);

const rows = parseCsv(await readFile("data/seed-concerts.csv", "utf8")) as unknown as CsvRow[];
const channelFile = JSON.parse(await readFile("data/channels.json", "utf8")) as { channels: { name: string }[] };
const listed = channelFile.channels.map((c) => c.name);

const yt = new YouTubeClient(key, 50);
yt.failFast = true; // an API error must never read as "video gone"
const videos = await yt.videos(rows.map((r) => r.youtube_id));

const results: { row: CsvRow; outcome: RowOutcome }[] = rows.map((row) => {
  const outcome = checkRow(row, videos.get(row.youtube_id) ?? null, listed, today);
  if (outcome.kind === "ask" && approved.has(row.youtube_id)) {
    return { row, outcome: { kind: "pass", concert: { ...outcome.concert, official: true }, officialWhy: "uploader approved by the owner" } };
  }
  return { row, outcome };
});

const passed = results.filter((r) => r.outcome.kind === "pass");
const seed: SeedFile = {
  concerts: passed.map((r) => (r.outcome as Extract<RowOutcome, { kind: "pass" }>).concert),
};
await writeFile("data/seed-concerts.json", `${JSON.stringify(seed, null, 2)}\n`);

const minutes = (id: string) => {
  const v = videos.get(id);
  return v ? `${Math.floor(v.durationSeconds / 3600)}:${String(Math.floor((v.durationSeconds % 3600) / 60)).padStart(2, "0")}` : "–";
};
const cell = (s: string) => s.replace(/\|/g, "/");
const line = ({ row, outcome }: (typeof results)[number]) => {
  const v = videos.get(row.youtube_id);
  const verdict =
    outcome.kind === "pass" ? `PASS (${outcome.officialWhy})` : outcome.kind === "ask" ? `ASK OWNER: ${outcome.reason}` : `DROP: ${outcome.reasons.join("; ")}`;
  return `| ${row.id} | ${cell(row.band)} | ${cell(row.event_or_venue)} ${row.date} | [${row.youtube_id}](https://www.youtube.com/watch?v=${row.youtube_id}) | ${cell(v?.channelTitle ?? "–")} | ${minutes(row.youtube_id)} | ${cell(verdict)} |`;
};
const count = (k: RowOutcome["kind"]) => results.filter((r) => r.outcome.kind === k).length;
const report = [
  `# Seed check — ${today}`,
  "",
  `${rows.length} candidates from data/seed-concerts.csv, checked with the YouTube Data API (${yt.unitsUsed} quota units).`,
  `Rules: public, embeddable, at least 40 minutes, not blocked in ES / IT / GB / US / DE, uploader confirmed official.`,
  "",
  `- Pass: ${count("pass")} (written to data/seed-concerts.json)`,
  `- Owner to decide (uploader not confirmed): ${count("ask")}`,
  `- Dropped: ${count("drop")}`,
  "",
  "| # | Band | Where / when | Video | Uploader (YouTube) | Length | Result |",
  "|---|---|---|---|---|---|---|",
  ...results.map(line),
  "",
].join("\n");
await writeFile("data/seed-check-report.md", report);
console.log(report);
