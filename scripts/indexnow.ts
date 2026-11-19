// Announce new and changed pages to IndexNow engines (src/lib/indexnow.ts). Run by collect.yml and
// refresh.yml after each run: npm run indexnow -- [--hours 30] [--all]
// It does nothing until the live site (LIVE_SITE_URL) is open to search engines: its robots.txt is
// read first, so the test service, which stays closed, never announces anything.
import "dotenv/config";
import { getDb } from "../src/lib/db";
import { INDEXNOW_ENDPOINT, indexNowBodies, pagesToAnnounce, robotsIsOpen } from "../src/lib/indexnow";
import { sitemapEntries } from "../src/lib/sitemap";

const site = (process.env.LIVE_SITE_URL ?? "").replace(/\/$/, "");
const all = process.argv.includes("--all");
const hoursArg = process.argv.indexOf("--hours");
const hours = hoursArg > 0 ? Number(process.argv[hoursArg + 1]) : 30;

async function main() {
  if (!site) {
    console.log(JSON.stringify({ indexnow: "skipped", reason: "LIVE_SITE_URL is not set (no live site yet)" }));
    return;
  }
  const robots = await fetch(`${site}/robots.txt`).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  if (!robots || !robotsIsOpen(robots)) {
    console.log(JSON.stringify({ indexnow: "skipped", reason: `${site} is not open to search engines yet` }));
    return;
  }
  process.env.SITE_URL = site;
  const since = all ? null : new Date(Date.now() - hours * 3_600_000);
  const urls = pagesToAnnounce(await sitemapEntries(), since).map((e) => `${site}${e.path}`);
  const results = [];
  for (const body of indexNowBodies(site, urls)) {
    const res = await fetch(INDEXNOW_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
    results.push({ urls: body.urlList.length, status: res.status });
  }
  console.log(JSON.stringify({ indexnow: "sent", since: since?.toISOString() ?? "all", results }));
  await getDb().$disconnect();
}

main().catch((e) => {
  // Announcing is a bonus: a failure never fails the collector run.
  console.error(e);
});
