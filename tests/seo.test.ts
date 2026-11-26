// Search engines: which pages may be indexed, search titles and descriptions, share images.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  abs,
  bandIsStrong,
  bandSearchTitle,
  clip,
  concertIsStrong,
  concertSearchTitle,
  decadeSearchTitle,
  genreSearchTitle,
  hubIsStrong,
  INDEX_ROBOTS,
  NOT_FOUND_METADATA,
  robotsFor,
  shareImages,
  siteIsIndexable,
  titleCase,
  tourSearchTitle,
  venueSearchTitle,
} from "../src/lib/seo";
import { BANNED } from "./fixtures/concert-view";

const env = { indexable: process.env.SITE_INDEXABLE, url: process.env.SITE_URL };
afterEach(() => {
  process.env.SITE_INDEXABLE = env.indexable;
  process.env.SITE_URL = env.url;
  if (env.indexable === undefined) delete process.env.SITE_INDEXABLE;
  if (env.url === undefined) delete process.env.SITE_URL;
});

describe("indexing", () => {
  it("never indexes the test service or a local copy", () => {
    delete process.env.SITE_INDEXABLE;
    expect(siteIsIndexable()).toBe(false);
    expect(robotsFor(true)).toEqual({ index: false, follow: false });
    process.env.SITE_INDEXABLE = "1";
    expect(siteIsIndexable()).toBe(false);
  });
  it("on the live site, indexes strong pages and keeps thin ones followed but out of the index", () => {
    process.env.SITE_INDEXABLE = "true";
    expect(robotsFor(true)).toEqual(INDEX_ROBOTS);
    expect(robotsFor(false)).toEqual({ index: false, follow: true });
  });
  it("writes the large previews on every indexable page, not only where the layout's default survives", () => {
    process.env.SITE_INDEXABLE = "true";
    expect(robotsFor(true)).toMatchObject({ index: true, follow: true, "max-image-preview": "large", "max-video-preview": -1, "max-snippet": -1 });
  });
  it("leaves a not-found page with Next.js's own noindex only (no inherited 'index, follow')", () => {
    process.env.SITE_INDEXABLE = "true";
    expect(NOT_FOUND_METADATA.robots).toBeNull();
    // The 404 page uses it (src/app/not-found.tsx).
    expect(readFileSync("src/app/not-found.tsx", "utf8")).toMatch(/export const metadata: Metadata = NOT_FOUND_METADATA/);
  });
  it("counts a concert as strong with a setlist, a hand-pick or a write-up of 400+ characters", () => {
    expect(concertIsStrong({ hasSetlist: true, curated: false, writeUp: null })).toBe(true);
    expect(concertIsStrong({ hasSetlist: false, curated: true, writeUp: null })).toBe(true);
    expect(concertIsStrong({ hasSetlist: false, curated: false, writeUp: "x".repeat(400) })).toBe(true);
    expect(concertIsStrong({ hasSetlist: false, curated: false, writeUp: "x".repeat(399) })).toBe(false);
    expect(concertIsStrong({ hasSetlist: false, curated: false, writeUp: `  ${"x".repeat(398)}  ` })).toBe(false);
  });
  it("needs two concerts for a hub page, and two concerts or one with a bio for a band", () => {
    expect(hubIsStrong(1)).toBe(false);
    expect(hubIsStrong(2)).toBe(true);
    expect(bandIsStrong({ concerts: 1, bio: null })).toBe(false);
    expect(bandIsStrong({ concerts: 1, bio: "A band from Leeds." })).toBe(true);
    expect(bandIsStrong({ concerts: 2, bio: null })).toBe(true);
    expect(bandIsStrong({ concerts: 0, bio: "A bio" })).toBe(false);
  });
});

describe("search titles", () => {
  const base = { title: "Live at Pinkpop", credits: "Radiohead", venue: { name: "Glastonbury" }, city: "Pilton", performedYear: 1997, hasSetlist: true };
  it("names band, place and the year it was played", () => {
    expect(concertSearchTitle(base)).toBe("Radiohead at Glastonbury 1997 · Full Concert + Setlist");
    expect(concertSearchTitle({ ...base, hasSetlist: false })).toBe("Radiohead at Glastonbury 1997 · Full Concert");
  });
  it("does not repeat a year the place already has, and falls back sensibly", () => {
    expect(concertSearchTitle({ ...base, venue: { name: "Rock Werchter 2001" } })).toBe("Radiohead at Rock Werchter 2001 · Full Concert + Setlist");
    expect(concertSearchTitle({ ...base, venue: null })).toBe("Radiohead at Pilton 1997 · Full Concert + Setlist");
    expect(concertSearchTitle({ ...base, venue: null, city: null })).toBe("Radiohead Live 1997 · Full Concert + Setlist");
    expect(concertSearchTitle({ ...base, venue: null, city: null, performedYear: null })).toBe("Live at Pinkpop · Full Concert + Setlist");
  });
  it("writes list titles the way people search", () => {
    expect(bandSearchTitle("Metallica", true)).toBe("Metallica · Full Concerts and Setlists");
    expect(bandSearchTitle("Metallica", false)).toBe("Metallica · Full Concerts");
    expect(venueSearchTitle("Pinkpop", true)).toBe("Pinkpop · Full Concerts and Setlists");
    expect(genreSearchTitle("new wave / synth", false)).toBe("Full New Wave Concerts · Live Shows");
    expect(genreSearchTitle("metal", true)).toBe("Full Metal Concerts · Live Shows and Setlists");
    expect(decadeSearchTitle("1990s", true)).toBe("Full 1990s Rock Concerts · Live 90s Rock Shows and Setlists");
    expect(decadeSearchTitle("2000s", false)).toBe("Full 2000s Rock Concerts · Live 2000s Rock Shows");
    expect(tourSearchTitle("Wherever We May Roam", "Metallica")).toBe("Metallica · Wherever We May Roam Tour · Full Concerts");
    expect(tourSearchTitle("The Joshua Tree Tour", null)).toBe("The Joshua Tree Tour · Full Concerts");
    expect(titleCase("emo / post-hardcore")).toBe("Emo / Post-Hardcore");
  });
  it("never uses the banned words", () => {
    const all = [concertSearchTitle(base), bandSearchTitle("X", true), decadeSearchTitle("1970s", true), tourSearchTitle("A", "B")].join(" ");
    expect(all).not.toMatch(BANNED);
  });
});

describe("descriptions and sharing", () => {
  it("cuts a description at a word, under the limit", () => {
    const long = "word ".repeat(60);
    const out = clip(long, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
    expect(clip("  short   text ")).toBe("short text");
  });
  it("uses the page's own picture, else the site's mark, as absolute URLs", () => {
    process.env.SITE_URL = "https://stagedive.example";
    expect(shareImages("https://i.ytimg.com/vi/x/hqdefault.jpg")).toEqual([{ url: "https://i.ytimg.com/vi/x/hqdefault.jpg" }]);
    expect(shareImages("/photos/bands/metallica?v=1")).toEqual([{ url: "https://stagedive.example/photos/bands/metallica?v=1" }]);
    expect(shareImages(null)).toEqual([{ url: "https://stagedive.example/share-card.png" }]);
    expect(abs("concerts/x")).toBe("https://stagedive.example/concerts/x");
  });
});
