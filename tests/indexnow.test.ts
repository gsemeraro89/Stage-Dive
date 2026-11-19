// IndexNow: request bodies, the robots.txt gate, which pages are announced.
import { describe, expect, it } from "vitest";
import { INDEXNOW_KEY, INDEXNOW_MAX, indexNowBodies, pagesToAnnounce, robotsIsOpen } from "../src/lib/indexnow";

describe("IndexNow", () => {
  it("has STAGEDIVE's own key (32 hex characters, not OpenDecks')", () => {
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
    expect(INDEXNOW_KEY).not.toBe("106832bbebba61006175c83562e48837");
  });
  it("sends only this site's URLs, once each, with the key location", () => {
    const [body] = indexNowBodies("https://stagedive.example/", [
      "https://stagedive.example/concerts/a",
      "https://stagedive.example/concerts/a",
      "https://elsewhere.example/x",
    ]);
    expect(body).toEqual({
      host: "stagedive.example",
      key: INDEXNOW_KEY,
      keyLocation: "https://stagedive.example/indexnow-key.txt",
      urlList: ["https://stagedive.example/concerts/a"],
    });
  });
  it("splits long lists into requests of at most 10,000 URLs", () => {
    const urls = Array.from({ length: INDEXNOW_MAX + 5 }, (_, i) => `https://s.example/concerts/${i}`);
    expect(indexNowBodies("https://s.example", urls).map((b) => b.urlList.length)).toEqual([INDEXNOW_MAX, 5]);
  });
  it("waits until the live robots.txt is open", () => {
    expect(robotsIsOpen("User-Agent: *\nDisallow: /\n")).toBe(false);
    expect(robotsIsOpen("User-Agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nUser-Agent: GPTBot\nAllow: /\n")).toBe(true);
  });
  it("announces pages changed since the last run, and undated pages only when important", () => {
    const since = new Date("2026-11-19T00:00:00Z");
    const entries = [
      { path: "/", priority: 1 },
      { path: "/tours", priority: 0.6 },
      { path: "/concerts/new", priority: 0.7, lastModified: new Date("2026-11-19T03:00:00Z") },
      { path: "/concerts/old", priority: 0.7, lastModified: new Date("2026-10-01T00:00:00Z") },
    ];
    expect(pagesToAnnounce(entries, since).map((e) => e.path)).toEqual(["/", "/concerts/new"]);
    expect(pagesToAnnounce(entries, null)).toHaveLength(4);
  });
});
