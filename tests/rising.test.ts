// "Searched this week" (src/lib/rising.ts): only pages that exist and are strong, eight at most, clean words.
import { describe, expect, it } from "vitest";
import { isFresh, labelIsClean, MAX_RISING, parseRisingPath, pickRising, RISING, RISING_MAX_DAYS, type RisingTarget } from "../src/lib/rising";
import { BANNED, youtubeOnlyWithViews } from "./fixtures/concert-view";

const today = new Date("2026-11-26T12:00:00Z");
const t = (path: string, label = `Label for ${path}`, since = "2026-11-26"): RisingTarget => ({ path, label, since });

describe("rising links", () => {
  it("drops pages that are missing or not strong (noindex), keeping the written order", () => {
    const targets = [t("/artists/radiohead"), t("/artists/yonderboi"), t("/venues/ypsigrock"), t("/concerts/gone-for-good"), t("/venues/pinkpop")];
    const strong = new Set(["/venues/pinkpop", "/artists/radiohead"]);
    expect(pickRising(targets, strong, today).map((l) => l.path)).toEqual(["/artists/radiohead", "/venues/pinkpop"]);
  });

  it("shows eight links at most, each page once", () => {
    const targets = Array.from({ length: 12 }, (_, i) => t(`/artists/band-${i}`));
    targets.splice(1, 0, t("/artists/band-0", "Again"));
    const strong = new Set(targets.map((x) => x.path));
    const links = pickRising(targets, strong, today);
    expect(MAX_RISING).toBe(8);
    expect(links).toHaveLength(8);
    expect(new Set(links.map((l) => l.path)).size).toBe(8);
    expect(links[1].path).toBe("/artists/band-1");
  });

  it("drops a label that breaks the copy rules, and an empty one", () => {
    for (const bad of ["Free Radiohead concerts", "Radiohead archive", "Radiohead uploads", "Full-length Radiohead", "Radiohead on YouTube", "  "]) {
      expect(labelIsClean(bad)).toBe(false);
      expect(pickRising([t("/artists/radiohead", bad)], new Set(["/artists/radiohead"]), today)).toEqual([]);
    }
    expect(labelIsClean("Radiohead setlists")).toBe(true);
  });

  it("drops an entry four weeks after it was added, or with a date that cannot be read", () => {
    expect(RISING_MAX_DAYS).toBe(28);
    expect(isFresh("2026-11-26", today)).toBe(true);
    expect(isFresh("2026-10-30", today)).toBe(true);
    expect(isFresh("2026-10-29", today)).toBe(false);
    expect(isFresh("someday", today)).toBe(false);
    expect(pickRising([t("/artists/radiohead", "Radiohead setlists", "2026-10-01")], new Set(["/artists/radiohead"]), today)).toEqual([]);
  });

  it("reads only single pages of the kinds it can check", () => {
    expect(parseRisingPath("/artists/radiohead")).toEqual({ kind: "artist", slug: "radiohead" });
    expect(parseRisingPath("/concerts/limp-bizkit-pinkpop-2001")).toEqual({ kind: "concert", slug: "limp-bizkit-pinkpop-2001" });
    expect(parseRisingPath("/venues/pinkpop")).toEqual({ kind: "venue", slug: "pinkpop" });
    expect(parseRisingPath("/genres/metal")?.kind).toBe("genre");
    expect(parseRisingPath("/tours/ok-computer")?.kind).toBe("tour");
    for (const p of ["/artists", "/venues/pinkpop/1995", "/songs/radiohead", "https://fullconcert.live/artists/radiohead", "/artists/Radiohead", "/news/x"]) expect(parseRisingPath(p)).toBeNull();
  });

  it("keeps the hand-kept list clean: checkable pages, the copy rules, a date, eight entries at most", () => {
    expect(RISING.length).toBeGreaterThan(0);
    expect(RISING.length).toBeLessThanOrEqual(MAX_RISING);
    expect(new Set(RISING.map((r) => r.path)).size).toBe(RISING.length);
    for (const r of RISING) {
      expect(parseRisingPath(r.path), r.path).not.toBeNull();
      expect(r.label).not.toMatch(BANNED);
      expect(youtubeOnlyWithViews(r.label)).toBe(true);
      expect(labelIsClean(r.label)).toBe(true);
      expect(r.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
