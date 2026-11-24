// AI and search crawler counter (owner, 24 Nov 2026): who the bot is, which type of page it read, and
// the in-memory counts written in batches at most every 5 minutes (Neon is billed by compute time).
import { describe, expect, it } from "vitest";
import {
  addHit,
  AI_BOTS,
  crawlerOf,
  FLUSH_INTERVAL_MS,
  flushDue,
  msUntilFlush,
  newHitCounter,
  pageKindOf,
  takeBatch,
} from "../src/lib/crawlers";

describe("crawlerOf", () => {
  it.each([
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)", "GPTBot"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "ChatGPT-User"],
    ["Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)", "OAI-SearchBot"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "ClaudeBot"],
    ["Mozilla/5.0 (compatible; Claude-User/1.0)", "Claude-User"],
    ["Mozilla/5.0 (compatible; Claude-SearchBot/1.0)", "Claude-SearchBot"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", "PerplexityBot"],
    ["Mozilla/5.0 (compatible; Perplexity-User/1.0)", "Perplexity-User"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Googlebot"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0 Safari/537.36", "Bingbot"],
    ["Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot/0.1)", "Applebot"],
    ["Mozilla/5.0 (compatible; Applebot-Extended/0.1)", "Applebot-Extended"],
    ["meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "Meta-ExternalAgent"],
    ["Mozilla/5.0 (compatible; Amazonbot/0.1)", "Amazonbot"],
    ["Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)", "YandexBot"],
    ["CCBot/2.0 (https://commoncrawl.org/faq/)", "CCBot"],
    ["Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)", "Bytespider"],
  ])("%s → %s", (ua, bot) => expect(crawlerOf(ua)).toBe(bot));

  it("ignores people's browsers", () => {
    expect(crawlerOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBeNull();
    expect(crawlerOf(null)).toBeNull();
    expect(crawlerOf("")).toBeNull();
  });

  it("tells AI assistants from search engines", () => {
    expect(AI_BOTS.has("GPTBot")).toBe(true);
    expect(AI_BOTS.has("ClaudeBot")).toBe(true);
    expect(AI_BOTS.has("Googlebot")).toBe(false);
    expect(AI_BOTS.has("Bingbot")).toBe(false);
  });
});

describe("pageKindOf", () => {
  it.each([
    ["/concerts/radiohead-glastonbury-1997", "concert"],
    ["/concerts/radiohead-glastonbury-1997.md", "md"],
    ["/md/concerts/radiohead-glastonbury-1997", "md"],
    ["/artists/metallica", "artist"],
    ["/artists/metallica/sorted/length", "artist"],
    ["/artists/metallica.md", "md"],
    ["/venues/pinkpop", "venue"],
    ["/venues/pinkpop/1995", "venue"],
    ["/venues/pinkpop/1995.md", "md"],
    ["/news", "news"],
    ["/news/foo-fighters-tour", "news"],
    ["/news/feed.xml", "news"],
    ["/songs/metallica", "song"],
    ["/songs/metallica/one", "song"],
    ["/", "list"],
    ["/concerts", "list"],
    ["/best/most-watched", "list"],
    ["/decades/1990s", "list"],
    ["/genres/metal", "list"],
    ["/tours/black-album-tour", "list"],
    ["/hd", "list"],
    ["/llms.txt", "llms"],
    ["/llms-full.txt", "llms"],
    ["/sitemap.xml", "sitemap"],
    ["/news-sitemap.xml", "sitemap"],
    ["/robots.txt", "robots"],
    ["/privacy", "other"],
    ["/admin", "other"],
    ["/indexnow-key.txt", "other"],
  ])("%s → %s", (path, kind) => expect(pageKindOf(path)).toBe(kind));
});

describe("counting in memory, written in batches", () => {
  const t0 = Date.parse("2026-11-24T10:00:00Z");
  const at = (ms: number) => new Date(t0 + ms);

  it("adds hits per (day, bot), with the page types and the newest path", () => {
    const c = newHitCounter(t0);
    addHit(c, "GPTBot", "/concerts/a", at(1000));
    addHit(c, "GPTBot", "/concerts/b.md", at(2000));
    addHit(c, "GPTBot", "/llms.txt", at(3000));
    addHit(c, "ClaudeBot", "/artists/x", at(4000));
    expect(c.pending.size).toBe(2);
    const gpt = c.pending.get("2026-11-24|GPTBot")!;
    expect(gpt.hits).toBe(3);
    expect(gpt.kinds).toEqual({ concert: 1, md: 1, llms: 1 });
    expect(gpt.lastPath).toBe("/llms.txt");
    expect(gpt.lastAt).toEqual(at(3000));
  });

  it("starts a new row at midnight (UTC)", () => {
    const c = newHitCounter(t0);
    addHit(c, "GPTBot", "/", new Date("2026-11-24T23:59:59Z"));
    addHit(c, "GPTBot", "/", new Date("2026-11-25T00:00:01Z"));
    expect([...c.pending.values()].map((r) => r.day)).toEqual(["2026-11-24", "2026-11-25"]);
  });

  it("writes at most once every 5 minutes, and only with something to write", () => {
    const c = newHitCounter(t0);
    expect(flushDue(c, t0 + FLUSH_INTERVAL_MS)).toBe(false); // nothing counted
    addHit(c, "GPTBot", "/", at(1000));
    expect(flushDue(c, t0 + 1000)).toBe(false);
    expect(msUntilFlush(c, t0 + 1000)).toBe(FLUSH_INTERVAL_MS - 1000);
    expect(flushDue(c, t0 + FLUSH_INTERVAL_MS)).toBe(true);
    const rows = takeBatch(c, t0 + FLUSH_INTERVAL_MS);
    expect(rows).toHaveLength(1);
    expect(c.pending.size).toBe(0);
    addHit(c, "GPTBot", "/", at(FLUSH_INTERVAL_MS + 1000));
    expect(flushDue(c, t0 + FLUSH_INTERVAL_MS + 60_000)).toBe(false);
    expect(flushDue(c, t0 + 2 * FLUSH_INTERVAL_MS)).toBe(true);
  });

  it("caps the rows held in memory", () => {
    const c = newHitCounter(t0);
    expect(addHit(c, "A", "/", at(0), 2)).toBe(true);
    expect(addHit(c, "B", "/", at(0), 2)).toBe(true);
    expect(addHit(c, "C", "/", at(0), 2)).toBe(false);
    expect(addHit(c, "A", "/", at(0), 2)).toBe(true); // an existing row still counts
    expect(c.pending.size).toBe(2);
    expect(c.dropped).toBe(1);
  });

  it("cuts very long paths", () => {
    const c = newHitCounter(t0);
    addHit(c, "GPTBot", "/concerts/" + "x".repeat(1000), at(0));
    expect(c.pending.get("2026-11-24|GPTBot")!.lastPath.length).toBe(300);
  });
});
