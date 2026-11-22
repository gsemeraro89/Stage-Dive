// robots.txt: closed everywhere but the live site; there, open to search engines and every AI crawler.
import { afterEach, describe, expect, it } from "vitest";
import { AI_CRAWLERS, robotsRules } from "../src/lib/robots";

const before = process.env.SITE_INDEXABLE;
afterEach(() => {
  if (before === undefined) delete process.env.SITE_INDEXABLE;
  else process.env.SITE_INDEXABLE = before;
});

describe("robots.txt", () => {
  it("closes the test service and local copies to every crawler, with no sitemap", () => {
    delete process.env.SITE_INDEXABLE;
    const r = robotsRules();
    expect(r.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(r.sitemap).toBeUndefined();
  });
  it("opens the live site to everyone, names the AI crawlers, keeps admin and API closed", () => {
    process.env.SITE_INDEXABLE = "true";
    process.env.SITE_URL = "https://stagedive.example";
    const r = robotsRules();
    const rules = r.rules as { userAgent: string | string[]; allow: string; disallow: string[] }[];
    expect(rules[0]).toEqual({ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] });
    expect(rules[1].userAgent).toEqual(AI_CRAWLERS);
    expect(r.sitemap).toEqual(["https://stagedive.example/sitemap.xml", "https://stagedive.example/news-sitemap.xml"]);
  });
  it("names the main assistants' crawlers", () => {
    for (const bot of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended", "CCBot", "bingbot"]) {
      expect(AI_CRAWLERS).toContain(bot);
    }
  });
});
