// IndexNow (owner, 19 Nov 2026): tell Bing, Yandex, Seznam, Naver and the other IndexNow engines at
// once which pages are new or changed, instead of waiting for them to crawl. ChatGPT search and
// Microsoft Copilot answer from Bing's index, so this is how new concerts reach them quickly.
// The key is public by design (it is served at /indexnow-key.txt to prove we own the site); it is
// STAGEDIVE's own, not OpenDecks'. Tested in tests/indexnow.test.ts.
export const INDEXNOW_KEY = "1c2635d61c89971d20fbea2600b09891";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** IndexNow accepts at most 10,000 URLs per request. */
export const INDEXNOW_MAX = 10_000;

/** The request bodies for a list of absolute URLs on one site. Pure, for tests. */
export function indexNowBodies(siteUrl: string, urls: string[]) {
  const host = new URL(siteUrl).host;
  const own = [...new Set(urls)].filter((u) => new URL(u).host === host);
  const bodies = [];
  for (let i = 0; i < own.length; i += INDEXNOW_MAX) {
    bodies.push({ host, key: INDEXNOW_KEY, keyLocation: `${siteUrl.replace(/\/$/, "")}/indexnow-key.txt`, urlList: own.slice(i, i + INDEXNOW_MAX) });
  }
  return bodies;
}

/** True when the live site's robots.txt is open (so nothing is announced before launch). */
export function robotsIsOpen(robotsTxt: string): boolean {
  const star = robotsTxt.split(/\n(?=user-agent:)/i).find((block) => /user-agent:\s*\*/i.test(block)) ?? "";
  return !/^\s*disallow:\s*\/\s*$/im.test(star);
}

/** The pages to announce: changed since `since` (or all), and hub pages without a date only when important. */
export function pagesToAnnounce<T extends { lastModified?: Date; priority: number }>(entries: T[], since: Date | null): T[] {
  if (!since) return entries;
  return entries.filter((e) => (e.lastModified ? e.lastModified >= since : e.priority >= 0.8));
}
