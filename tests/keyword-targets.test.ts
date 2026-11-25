// Keyword targets (src/lib/keyword-targets.ts): every page type's title carries the phrase people
// search ("full metal concert", "<band> full concerts", "full concert live"), and the live domain
// https://fullconcert.live works everywhere the site writes its own address.
import { afterEach, describe, expect, it } from "vitest";
import { genreLead } from "../src/lib/answers";
import { GENRES } from "../src/lib/catalogue";
import { indexNowBodies } from "../src/lib/indexnow";
import {
  DOMAIN_BRAND_NAMES,
  GENRE_SEARCH,
  HEAD_TARGETS,
  genreSearchName,
  hasTarget,
  normalizeForMatch,
  shortDecade,
  targets,
} from "../src/lib/keyword-targets";
import { robotsRules } from "../src/lib/robots";
import {
  abs,
  bandSearchTitle,
  decadeSearchTitle,
  genreSearchTitle,
  HOME_DESCRIPTION,
  HOME_TITLE,
  SITE_ALTERNATE_NAMES,
  songSearchTitle,
  tourSearchTitle,
  venueSearchTitle,
  venueYearName,
  venueYearSearchTitle,
} from "../src/lib/seo";
import { organization, website } from "../src/lib/structured-data";
import { BANNED } from "./fixtures/concert-view";

const env = { indexable: process.env.SITE_INDEXABLE, url: process.env.SITE_URL };
afterEach(() => {
  for (const [k, v] of [["SITE_INDEXABLE", env.indexable], ["SITE_URL", env.url]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const gig = (genre: string, year: number) => ({
  slug: `g-${year}`,
  title: "x",
  credits: "Band",
  artists: [{ name: "Band", role: "MAIN" as const, hasPage: true }],
  venue: null,
  city: null,
  venueKind: null,
  genres: [{ name: genre }],
  tour: null,
  performedYear: year,
  durationSeconds: 3600,
  viewCount: 10,
  hasSetlist: false,
});

describe("matching a target", () => {
  it("ignores case, punctuation and the plural of the head nouns", () => {
    expect(normalizeForMatch("Metallica · Full Concerts and Setlists")).toBe("metallica full concert and setlist");
    expect(hasTarget("Metallica · Full Concerts and Setlists", "metallica full concert")).toBe(true);
    expect(hasTarget("Full Post-Punk Concerts", "full post punk concert")).toBe(true);
    expect(hasTarget("Guns N' Roses · Full Concerts", "guns n roses full concerts")).toBe(true);
    expect(hasTarget("Full Metal Concerts", "full metal concert live")).toBe(false);
    expect(hasTarget("Full Metalcore Concerts", "full metal concert")).toBe(false);
  });
});

describe("home page", () => {
  it("carries every 'full concert' head term of its title targets", () => {
    for (const t of targets.home()) expect(hasTarget(HOME_TITLE, t), t).toBe(true);
    expect(HOME_TITLE).toContain("Full Concert");
    expect(hasTarget(HOME_DESCRIPTION, "full concert")).toBe(true);
    expect(hasTarget(HOME_DESCRIPTION, "full rock concert")).toBe(true);
    // Added 25 Nov (owner: cover the phrases the 20 Nov study found on no page).
    for (const phrase of ["whole show", "entire concert", "full festival show"]) expect(hasTarget(HOME_DESCRIPTION, phrase)).toBe(true);
    expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(160);
    expect(`${HOME_TITLE} ${HOME_DESCRIPTION}`).not.toMatch(BANNED);
  });
  it("lists the mandatory head terms, each on a page", () => {
    const phrases = HEAD_TARGETS.map((t) => t.phrase);
    for (const p of ["full concert", "full concerts", "full concert live", "fullconcert", "full live concert", "full show", "full set", "complete concert", "entire concert", "live full concert hd", "full concert 4k", "full concert video", "full concert videos"])
      expect(phrases).toContain(p);
    for (const t of HEAD_TARGETS) expect(t.page.startsWith("/")).toBe(true);
  });
});

describe("genre pages", () => {
  it("every genre title says 'Full <Genre> Concerts' the way people search", () => {
    for (const g of GENRES) {
      const title = genreSearchTitle(g, true);
      expect(title).toMatch(/^Full [A-Z][\w -]* Concerts · /);
      for (const t of targets.genre(g)) expect(hasTarget(title, t), `${g}: ${t}`).toBe(true);
      expect(title).not.toMatch(BANNED);
    }
  });
  it("uses the natural spellings", () => {
    expect(genreSearchTitle("metal", false)).toBe("Full Metal Concerts · Live Shows");
    expect(genreSearchTitle("punk", false)).toContain("Full Punk Concerts");
    expect(genreSearchTitle("trip hop", false)).toContain("Full Trip Hop Concerts");
    expect(genreSearchTitle("grunge", false)).toContain("Full Grunge Concerts");
    expect(genreSearchTitle("electronic rock / big beat", false)).toContain("Full Big Beat Concerts");
    expect(genreSearchTitle("stoner", false)).toContain("Full Stoner Rock Concerts");
    expect(genreSearchName("some new genre")).toBe("Some New Genre");
    expect(Object.keys(GENRE_SEARCH).sort()).toEqual([...GENRES].sort());
  });
  it("the genre lead (the description) opens with 'N full <genre> concerts'", () => {
    for (const g of GENRES) {
      const lead = genreLead(g, [gig(g, 1991), gig(g, 1995)]);
      expect(hasTarget(lead, `2 full ${genreSearchName(g).toLowerCase()} concerts`), lead).toBe(true);
    }
    expect(genreLead("new wave / synth", [gig("new wave / synth", 1985)])).toMatch(/^1 full new wave concert \(new wave \/ synth\), /);
    expect(genreLead("garage", [gig("garage", 1985)])).toMatch(/^1 full garage rock concert, /);
  });
});

describe("other page types", () => {
  it("band, venue, festival year, decade, tour and song titles carry their targets", () => {
    for (const t of targets.band("Metallica")) expect(hasTarget(bandSearchTitle("Metallica", false), t)).toBe(true);
    for (const t of targets.venue("Pinkpop")) expect(hasTarget(venueSearchTitle("Pinkpop", true), t)).toBe(true);
    for (const t of targets.venueYear(venueYearName("Pinkpop", 1995))) expect(hasTarget(venueYearSearchTitle("Pinkpop", 1995, true), t)).toBe(true);
    for (const label of ["1960s", "1990s", "2000s"])
      for (const t of targets.decade(label)) expect(hasTarget(decadeSearchTitle(label, true), t), `${label}: ${t}`).toBe(true);
    for (const t of targets.tour("Wherever We May Roam Tour")) expect(hasTarget(tourSearchTitle("Wherever We May Roam", "Metallica"), t)).toBe(true);
    for (const t of targets.song("Creep")) expect(hasTarget(songSearchTitle("Creep", "Radiohead", 3), t)).toBe(true);
    expect(shortDecade("1980s")).toBe("80s");
    expect(shortDecade("2010s")).toBe("2010s");
  });
});

describe("the live domain fullconcert.live", () => {
  it("is one of the brand's names in structured data", () => {
    expect(SITE_ALTERNATE_NAMES).toEqual(expect.arrayContaining(["STAGEDIVE", "Stage Dive", "fullconcert.live", "Full Concert Live"]));
    expect(DOMAIN_BRAND_NAMES).toEqual(["fullconcert.live", "Full Concert Live", "fullconcert", "FullConcert"]);
    expect(website().alternateName).toEqual(SITE_ALTERNATE_NAMES);
    expect(organization().alternateName).toEqual(SITE_ALTERNATE_NAMES);
  });
  it("canonicals, robots.txt, the sitemap address and IndexNow use SITE_URL", () => {
    process.env.SITE_URL = "https://fullconcert.live/";
    process.env.SITE_INDEXABLE = "true";
    expect(abs("/genres/metal")).toBe("https://fullconcert.live/genres/metal");
    expect(website().url).toBe("https://fullconcert.live/");
    const r = robotsRules();
    expect(r.sitemap).toEqual(["https://fullconcert.live/sitemap.xml", "https://fullconcert.live/news-sitemap.xml"]);
    expect(r.host).toBe("https://fullconcert.live/");
    const [body] = indexNowBodies("https://fullconcert.live", ["https://fullconcert.live/concerts/x", "https://stagedive-test.onrender.com/concerts/y"]);
    expect(body.host).toBe("fullconcert.live");
    expect(body.keyLocation).toBe("https://fullconcert.live/indexnow-key.txt");
    expect(body.urlList).toEqual(["https://fullconcert.live/concerts/x"]);
  });
});
