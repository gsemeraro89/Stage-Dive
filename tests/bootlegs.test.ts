// Bootlegs on the site (owner, 20 Nov 2026): label and credit wording, official first, the /concerts filter, the
// strong-page rule, titles, answers and Markdown copies that say "bootleg" honestly, rankings official only, the ads
// switch, and the copy rules (never "free", "archive", "upload", "full-length"; "YouTube" only next to views).
import { describe, expect, it } from "vitest";
import { adsAllowed, adsOnBootlegs } from "../src/lib/ads";
import { concertAnswers, bandAnswers } from "../src/lib/answers";
import {
  BOOTLEG_EXPLAINED,
  BOOTLEG_LABEL,
  bootlegCredit,
  displayChannelName,
  bootlegNote,
  FAN_SECTION_TITLE,
  FOOTER_LINE,
  ISSUE_STRIP_SOURCES,
  startHere,
  officialFirst,
  sourceCredit,
  splitBootlegs,
} from "../src/lib/bootlegs";
import { buildWhere, filtersToQuery, hasActiveFilters, parseFilters } from "../src/lib/filters";
import { bandMarkdown, concertMarkdown, llmsTxt, SITE_SUMMARY } from "../src/lib/llms";
import { concertIsStrong, concertSearchTitle } from "../src/lib/seo";
import { buildSitemap, type SitemapConcert } from "../src/lib/sitemap";
import { concertJsonLd } from "../src/lib/structured-data";
import { BANNED, concertView, setlist, youtubeOnlyWithViews } from "./fixtures/concert-view";

process.env.SITE_URL = "https://stagedive.example";

const nirvana = concertView({
  id: 9,
  slug: "nirvana-teatro-castello-1991-bootleg",
  title: "Nirvana - Teatro Castello, Rome 1991 (Pro-Shot)",
  credits: "Nirvana",
  artists: [{ slug: "nirvana", name: "Nirvana", role: "MAIN", creditNote: null, hasPage: true }],
  venue: { slug: "teatro-castello", name: "Teatro Castello" },
  city: "Rome",
  country: "Italy",
  performedYear: 1991,
  performedOn: new Date("1991-11-19T00:00:00Z"),
  tour: null,
  channel: { name: "Better Than Nothing Videos", isOfficial: false },
  bootleg: { from: "Better Than Nothing Videos" },
  hasSetlist: true,
});
const official = concertView();

describe("label and credit wording", () => {
  it("a bootleg is labelled Bootleg and credited 'From <channel>'", () => {
    expect(BOOTLEG_LABEL).toBe("Bootleg");
    expect(bootlegCredit("Better Than Nothing Videos")).toBe("From Better Than Nothing Videos");
    expect(sourceCredit(nirvana)).toBe("From Better Than Nothing Videos");
  });
  it("shows a fan channel's name without emoji or decorative symbols", () => {
    expect(displayChannelName("⚡Marco's HIGH VOLTAGE  Music Channel⚡")).toBe("Marco's HIGH VOLTAGE Music Channel");
    expect(displayChannelName("🎞️2160P🎞️ by Magnetic Images")).toBe("2160P by Magnetic Images");
    expect(displayChannelName("skyly ☁️ virtual vault")).toBe("skyly virtual vault");
    expect(displayChannelName("🇧🇷 Rock BR 🎸")).toBe("Rock BR");
    expect(displayChannelName("★ - Name -")).toBe("Name");
    // Fancy Unicode letters back to plain ones; spaces tidied.
    expect(displayChannelName("𝓒𝓪𝓷𝓸𝓯𝓫𝓾𝓽𝓽𝓮𝓻𝓯𝓵𝓲𝓮𝓼")).toBe("Canofbutterflies");
    expect(displayChannelName("Megadeth _ Live ᴴᴰ")).toBe("Megadeth _ Live HD");
    expect(displayChannelName("  Foo Fighters DB  ")).toBe("Foo Fighters DB");
    // Letters in any script, accents and ordinary punctuation stay.
    for (const n of ["Lucas Magalhães", "Paweł Błaszak", "музичні збочення", "[PIAS]", "@CONCERT TOURS", "AC/DC - Remasters", "R.E.M. Video Vault"])
      expect(displayChannelName(n)).toBe(n);
    // Nothing left: the name as it is.
    expect(displayChannelName("🎸🎸")).toBe("🎸🎸");
    expect(bootlegCredit("⚡Marco's HIGH VOLTAGE  Music Channel⚡")).toBe("From Marco's HIGH VOLTAGE Music Channel");
    expect(sourceCredit({ channel: { name: "🔥 Some Channel 🔥", isOfficial: false }, bootleg: null })).toBe("From Some Channel");
  });
  it("an official concert keeps 'Official concert from <channel>'", () => {
    expect(sourceCredit(official)).toBe("Official concert from Metallica");
    expect(sourceCredit({ channel: { name: "Some Channel", isOfficial: false }, bootleg: null })).toBe("From Some Channel");
  });
  it("every bootleg text keeps the copy rules", () => {
    for (const t of [BOOTLEG_EXPLAINED, bootlegNote(1), bootlegNote(3), FAN_SECTION_TITLE, sourceCredit(nirvana)]) {
      expect(t).not.toMatch(BANNED);
      expect(youtubeOnlyWithViews(t)).toBe(true);
    }
  });
});

describe("official concerts first", () => {
  it("keeps each part in its own order, official first", () => {
    const list = [{ id: 1, bootleg: { from: "x" } }, { id: 2, bootleg: null }, { id: 3, bootleg: { from: "y" } }, { id: 4, bootleg: null }];
    expect(officialFirst(list).map((c) => c.id)).toEqual([2, 4, 1, 3]);
    const { official: o, bootlegs: b } = splitBootlegs(list);
    expect(o.map((c) => c.id)).toEqual([2, 4]);
    expect(b.map((c) => c.id)).toEqual([1, 3]);
  });
});

describe("the /concerts source filter", () => {
  it("reads ?source=official and ?source=bootleg, ignores anything else", () => {
    expect(parseFilters({ source: "bootleg" }).source).toBe("bootleg");
    expect(parseFilters({ source: "official" }).source).toBe("official");
    expect(parseFilters({ source: "fans" }).source).toBeNull();
  });
  it("filters the database query and goes back into links", () => {
    expect(buildWhere(parseFilters({ source: "bootleg" })).AND).toContainEqual({ sourceKind: "FAN_PRO_SHOT" });
    expect(buildWhere(parseFilters({ source: "official" })).AND).toContainEqual({ sourceKind: "OFFICIAL" });
    expect(filtersToQuery(parseFilters({ source: "bootleg", sort: "longest" }))).toBe("?source=bootleg&sort=longest");
  });
  it("a filtered view is an active filter (noindex,follow on the page)", () => {
    expect(hasActiveFilters(parseFilters({ source: "bootleg" }))).toBe(true);
  });
});

describe("SEO: indexed when strong, titled honestly", () => {
  it("a pro-shot bootleg with a setlist is a strong page, like any concert", () => {
    expect(concertIsStrong(nirvana)).toBe(true);
    expect(concertIsStrong({ ...nirvana, hasSetlist: false, writeUp: null })).toBe(false);
  });
  it("its title says Bootleg", () => {
    expect(concertSearchTitle(nirvana)).toBe("Nirvana at Teatro Castello 1991 · Full Concert (Bootleg) + Setlist");
    expect(concertSearchTitle(official)).toBe("Metallica at L.C. Walker Arena 1991 · Full Concert + Setlist");
  });
  it("the lead and the answers say bootleg and where it comes from, never 'official'", () => {
    const a = concertAnswers(nirvana, setlist);
    expect(a.lead).toContain("bootleg, professionally filmed, from Better Than Nothing Videos");
    expect(a.lead).not.toMatch(/official concert/i);
    expect(a.questions.find((q) => q.question === "Is this an official recording?")?.answer).toBe(`No. ${BOOTLEG_EXPLAINED}`);
    expect(concertAnswers(official, setlist).questions.some((q) => q.question === "Is this an official recording?")).toBe(false);
  });
  it("structured data stays truthful: the VideoObject describes it with the bootleg lead", () => {
    const ld = concertJsonLd(nirvana, setlist);
    expect(ld["@type"]).toBe("VideoObject");
    expect(String(ld.description)).toContain("bootleg");
  });
  it("the Markdown copy says what a bootleg is and credits the channel", () => {
    const md = concertMarkdown(nirvana, setlist);
    expect(md).toContain("- **Source:** Bootleg, From Better Than Nothing Videos.");
    expect(md).toContain(BOOTLEG_EXPLAINED);
    expect(md).not.toContain("(official)");
    expect(md).not.toMatch(BANNED);
  });
  it("the band's Markdown lists bootlegs after the official concerts, under 'From the fans'", () => {
    const md = bandMarkdown({ name: "Metallica", slug: "metallica", bio: null, origin: null, bornYear: null, label: null, aka: null }, [
      { ...nirvana, credits: "Metallica", artists: official.artists },
      official,
    ]);
    const officialAt = md.indexOf("L.C. Walker Arena");
    const fansAt = md.indexOf(`## ${FAN_SECTION_TITLE} (bootlegs)`);
    expect(officialAt).toBeGreaterThan(0);
    expect(fansAt).toBeGreaterThan(officialAt);
    expect(md.slice(fansAt)).toContain("bootleg)](");
  });
  it("llms.txt explains bootlegs honestly", () => {
    const txt = llmsTxt({ bands: [], venues: [], genres: [], decades: [], tours: [] });
    expect(txt).toContain("a few are bootlegs");
    expect(txt).toContain("not official releases");
    expect(txt).not.toMatch(BANNED);
  });
  it("band answers count the bootlegs and name an official concert as the most watched", () => {
    const a = bandAnswers({ name: "Metallica", origin: null }, [
      { ...nirvana, credits: "Metallica", artists: official.artists, viewCount: 9_000_000 },
      official,
    ]);
    expect(a.lead).toContain("1 of them is a bootleg");
    expect(a.questions.find((q) => q.question.includes("most watched"))?.answer).toContain("L.C. Walker Arena");
  });
});

describe("a band with only bootlegs (e.g. Nirvana)", () => {
  const onlyBootlegs = [nirvana, { ...nirvana, id: 10, slug: "nirvana-paradiso-1991-bootleg", venue: { slug: "paradiso", name: "Paradiso" }, viewCount: 5 }];
  it("the lead and the fans note never promise official concerts that are not there", () => {
    const a = bandAnswers({ name: "Nirvana", origin: null }, onlyBootlegs);
    expect(a.lead).toContain("All of them are bootlegs");
    expect(a.lead).not.toContain("official concerts");
    expect(bootlegNote(2, false)).not.toContain("official concerts come first");
    expect(bootlegNote(1, false)).toBe(BOOTLEG_EXPLAINED);
    expect(bootlegNote(2, true)).toContain("The official concerts come first.");
  });
  it("the Markdown copy drops 'come first' too", () => {
    const md = bandMarkdown({ name: "Nirvana", slug: "nirvana", bio: null, origin: null, bornYear: null, label: null, aka: null }, onlyBootlegs);
    expect(md).toContain("## From the fans (bootlegs)");
    expect(md).not.toContain("come first");
    expect(md).not.toContain("listed after the official concerts");
  });
  it("a single bootleg is described in the singular", () => {
    const a = bandAnswers({ name: "Nirvana", origin: null }, [nirvana]);
    expect(a.lead).toContain("It is a bootleg: a professionally filmed show shared by a fan channel.");
  });
});

describe("Start here never recommends a bootleg over an official concert", () => {
  const boot = { id: 1, viewCount: 9_000_000, bootleg: { from: "Fan" } };
  const off = { id: 2, viewCount: 10, bootleg: null };
  it("picks the official concert even when a bootleg has more views, and does not call it the most watched overall", () => {
    const s = startHere([boot, off])!;
    expect(s.pick.id).toBe(2);
    expect(s.after).toBe(": the most watched of the official concerts (10 views on YouTube).");
  });
  it("only bootlegs: picks one and says it is a bootleg", () => {
    expect(startHere([boot])!.after).toBe(", a bootleg, professionally filmed: the whole set.");
    const s = startHere([boot, { ...boot, id: 3, viewCount: 1 }])!;
    expect(s.pick.id).toBe(1);
    expect(s.after).toContain("a bootleg, professionally filmed");
  });
  it("only official concerts: the usual wording, no bootleg words", () => {
    expect(startHere([off])!.after).toBe(", the whole set.");
    expect(startHere([off, { ...off, id: 3, viewCount: 99 }])!.after).toBe(": the most watched of them (99 views on YouTube).");
    expect(startHere([])).toBeNull();
  });
  it("keeps the copy rules", () => {
    for (const s of [startHere([boot]), startHere([boot, off]), startHere([off, { ...off, id: 3 }])]) {
      expect(`${s!.before}${s!.after}`).not.toMatch(BANNED);
      expect(youtubeOnlyWithViews(`${s!.before}${s!.after}`)).toBe(true);
    }
  });
});

describe("site-wide words about sources", () => {
  it("footer, issue strip and llms summary say official first, then bootlegs", () => {
    expect(FOOTER_LINE).toBe("every gig here is a whole show, played in full: official concerts first, then bootlegs. We just glue them together.");
    expect(ISSUE_STRIP_SOURCES).toBe("FULL ROCK GIGS, OFFICIAL FIRST");
    expect(SITE_SUMMARY).toContain("then bootlegs shared by fan channels");
    for (const t of [FOOTER_LINE, ISSUE_STRIP_SOURCES, SITE_SUMMARY]) {
      expect(t).not.toMatch(/official (sources|concerts?) only|only official/i);
      expect(t).not.toMatch(BANNED);
    }
  });
});

describe("rankings are official concerts only (sitemap)", () => {
  const c = (over: Partial<SitemapConcert>): SitemapConcert => ({
    slug: "x",
    updatedAt: new Date("2026-11-01T00:00:00Z"),
    hasSetlist: true,
    curated: false,
    writeUp: null,
    performedYear: 1991,
    venueSlug: null,
    tourSlug: null,
    artistSlugs: ["nirvana"],
    genreSlugs: ["grunge"],
    ...over,
  });
  it("ten bootlegs make no ranking, ten official concerts do; bootlegs with a setlist are still listed", () => {
    const bootlegs = Array.from({ length: 10 }, (_, i) => c({ slug: `b${i}`, bootleg: true }));
    const paths = buildSitemap(bootlegs, []).map((e) => e.path);
    expect(paths.some((p) => p.startsWith("/best"))).toBe(false);
    expect(paths).toContain("/concerts/b0");
    const officials = Array.from({ length: 10 }, (_, i) => c({ slug: `o${i}` }));
    expect(buildSitemap(officials, []).map((e) => e.path)).toContain("/best");
  });
});

describe("the ads switch", () => {
  const withText = { hasSetlist: true, writeUp: null };
  it("is off for bootlegs until ADS_ON_BOOTLEGS=true", () => {
    expect(adsOnBootlegs({})).toBe(false);
    expect(adsAllowed({ ...withText, bootleg: { from: "x" } }, {})).toBe(false);
    expect(adsAllowed({ ...withText, bootleg: { from: "x" } }, { ADS_ON_BOOTLEGS: "false" })).toBe(false);
    expect(adsAllowed({ ...withText, bootleg: { from: "x" } }, { ADS_ON_BOOTLEGS: "true" })).toBe(true);
  });
  it("official concerts need original content (YouTube policy III.G.1.d): a setlist or our write-up", () => {
    expect(adsAllowed({ ...withText, bootleg: null }, {})).toBe(true);
    expect(adsAllowed({ hasSetlist: false, writeUp: "Our own words.", bootleg: null }, {})).toBe(true);
    expect(adsAllowed({ hasSetlist: false, writeUp: "  ", bootleg: null }, {})).toBe(false);
  });
});
