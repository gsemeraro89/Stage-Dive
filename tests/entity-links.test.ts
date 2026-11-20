// Entity links (MusicBrainz -> Wikidata -> English Wikipedia) for the band pages: parsing recorded
// answers, the job's choices and storage, sameAs and the visible "Elsewhere" line, and that nothing is
// linked when an ID is missing.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { artistEntityLinks, entityLinksFromRelations, LINKS_USER_AGENT } from "../src/lib/collector/musicbrainz";
import { chooseLinks, refreshEntityLinks, RECHECK_DAYS } from "../src/lib/entity-links";
import { bandMarkdown } from "../src/lib/llms";
import { bandJsonLd, bandSameAs, elsewhereLinks } from "../src/lib/structured-data";
import { cleanQid, enwikiUrlFromEntity, wikipediaUrlFor } from "../src/lib/wikidata";
import { concertView } from "./fixtures/concert-view";

process.env.SITE_URL = "https://stagedive.example";

const mbAnswer = JSON.parse(readFileSync(new URL("./fixtures/musicbrainz-url-rels.json", import.meta.url), "utf8"));
const wdAnswer = JSON.parse(readFileSync(new URL("./fixtures/wikidata-entity.json", import.meta.url), "utf8"));

/** A fetch that answers from a recorded file and remembers what it was asked. */
function recorded(body: unknown, status = 200) {
  const calls: { url: string; ua: string | null }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), ua: new Headers(init?.headers).get("User-Agent") });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("reading MusicBrainz and Wikidata", () => {
  it("takes the current Wikidata item and the English Wikipedia article from MusicBrainz links", () => {
    expect(entityLinksFromRelations(mbAnswer.relations)).toEqual({ wikidataId: "Q15920", wikipediaUrl: "https://en.wikipedia.org/wiki/Metallica" });
    expect(entityLinksFromRelations([])).toEqual({ wikidataId: null, wikipediaUrl: null });
    expect(entityLinksFromRelations(undefined)).toEqual({ wikidataId: null, wikipediaUrl: null });
  });
  it("asks MusicBrainz once, naming itself without a personal email", async () => {
    const { fn, calls } = recorded(mbAnswer);
    expect(await artistEntityLinks("65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab", fn)).toEqual({ wikidataId: "Q15920", wikipediaUrl: "https://en.wikipedia.org/wiki/Metallica" });
    expect(calls).toEqual([{ url: "https://musicbrainz.org/ws/2/artist/65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab?inc=url-rels&fmt=json", ua: LINKS_USER_AGENT }]);
    expect(LINKS_USER_AGENT).toBe("STAGEDIVE/1.0 ( contact-later )");
  });
  it("reads the enwiki sitelink, also for a merged item", async () => {
    expect(enwikiUrlFromEntity(wdAnswer, "Q15920")).toBe("https://en.wikipedia.org/wiki/Metallica");
    expect(enwikiUrlFromEntity(wdAnswer, "Q1")).toBe("https://en.wikipedia.org/wiki/Metallica");
    expect(enwikiUrlFromEntity({ entities: { Q2: { sitelinks: { dewiki: { title: "X" } } } } }, "Q2")).toBeNull();
    expect(enwikiUrlFromEntity({ entities: { Q3: { sitelinks: { enwiki: { title: "Guns N' Roses" } } } } }, "Q3")).toBe("https://en.wikipedia.org/wiki/Guns_N'_Roses");
    const { fn, calls } = recorded(wdAnswer);
    expect(await wikipediaUrlFor("Q15920", fn)).toBe("https://en.wikipedia.org/wiki/Metallica");
    expect(calls[0]).toEqual({ url: "https://www.wikidata.org/wiki/Special:EntityData/Q15920.json", ua: LINKS_USER_AGENT });
    expect(await wikipediaUrlFor("Q0", recorded({}, 404).fn)).toBeNull();
    await expect(wikipediaUrlFor("Q0", recorded({}, 500).fn)).rejects.toThrow("Wikidata answered 500");
  });
  it("keeps only real Wikidata IDs", () => {
    expect(cleanQid("Q15920")).toBe("Q15920");
    expect(cleanQid("https://www.wikidata.org/wiki/Q1")).toBeNull();
    expect(cleanQid(null)).toBeNull();
  });
});

describe("choosing what to store", () => {
  it("prefers Wikipedia from Wikidata, then MusicBrainz's English link, then the photo job's item", () => {
    expect(chooseLinks({ mbid: "m", links: { wikidataId: "Q1", wikipediaUrl: "https://en.wikipedia.org/wiki/A" }, fallbackQid: null, enwiki: "https://en.wikipedia.org/wiki/B" })).toEqual({
      mbid: "m",
      wikidataId: "Q1",
      wikipediaUrl: "https://en.wikipedia.org/wiki/B",
    });
    expect(chooseLinks({ mbid: "m", links: { wikidataId: null, wikipediaUrl: "https://en.wikipedia.org/wiki/A" }, fallbackQid: "Q9", enwiki: null })).toEqual({
      mbid: "m",
      wikidataId: "Q9",
      wikipediaUrl: "https://en.wikipedia.org/wiki/A",
    });
    expect(chooseLinks({ mbid: null, links: null, fallbackQid: null, enwiki: null })).toEqual({ mbid: null, wikidataId: null, wikipediaUrl: null });
  });
});

describe("the entity links job", () => {
  type Band = { id: number; name: string; mbid: string | null; wikidataId: string | null; wikipediaUrl: string | null; linksCheckedAt?: Date };
  function fakeDb(bands: Band[], lookups: Record<string, string | null> = {}, photoChecks: Record<number, string | null> = {}) {
    const updates: { id: number; data: Record<string, unknown> }[] = [];
    const db = {
      artist: {
        findMany: async (args: { take?: number }) => bands.slice(0, args.take ?? bands.length),
        update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
          updates.push({ id: where.id, data });
          return {};
        },
      },
      artistLookup: { findUnique: async ({ where }: { where: { nameKey: string } }) => (where.nameKey in lookups ? { mbid: lookups[where.nameKey] } : null) },
      bandPhotoCheck: { findUnique: async ({ where }: { where: { artistId: number } }) => (where.artistId in photoChecks ? { wikidataId: photoChecks[where.artistId] } : null) },
    };
    return { db: db as unknown as Parameters<typeof refreshEntityLinks>[0], updates };
  }
  const now = new Date("2026-11-20T00:00:00Z");

  it("stores the IDs found, uses the collector's MusicBrainz ID first and searches only when there is none", async () => {
    const { db, updates } = fakeDb(
      [
        { id: 1, name: "Metallica", mbid: null, wikidataId: null, wikipediaUrl: null },
        { id: 2, name: "Pixies", mbid: null, wikidataId: null, wikipediaUrl: null },
        { id: 3, name: "Nobody Knows", mbid: null, wikidataId: null, wikipediaUrl: null },
      ],
      { metallica: "mb-metallica" },
    );
    const searched: string[] = [];
    const stats = await refreshEntityLinks(
      db,
      {
        mbid: async (name) => {
          searched.push(name);
          return name === "Pixies" ? "mb-pixies" : null;
        },
        links: async (mbid) => (mbid === "mb-metallica" ? entityLinksFromRelations(mbAnswer.relations) : { wikidataId: null, wikipediaUrl: null }),
        wikipedia: async (qid) => enwikiUrlFromEntity(wdAnswer, qid),
      },
      { now },
    );
    expect(searched).toEqual(["Pixies", "Nobody Knows"]);
    expect(updates).toEqual([
      { id: 1, data: { mbid: "mb-metallica", wikidataId: "Q15920", wikipediaUrl: "https://en.wikipedia.org/wiki/Metallica", linksCheckedAt: now } },
      { id: 2, data: { mbid: "mb-pixies", wikidataId: null, wikipediaUrl: null, linksCheckedAt: now } },
      { id: 3, data: { mbid: null, wikidataId: null, wikipediaUrl: null, linksCheckedAt: now } },
    ]);
    expect(stats.linked).toEqual(["Metallica: MusicBrainz, Wikidata, Wikipedia", "Pixies: MusicBrainz"]);
    expect(stats.notFound).toEqual(["Nobody Knows"]);
  });
  it("falls back to the photo job's Wikidata item, and leaves a band unchecked after an error", async () => {
    const { db, updates } = fakeDb(
      [
        { id: 1, name: "Muse", mbid: "mb-muse", wikidataId: null, wikipediaUrl: null },
        { id: 2, name: "Blur", mbid: "mb-blur", wikidataId: null, wikipediaUrl: null },
      ],
      {},
      { 1: "Q123" },
    );
    const stats = await refreshEntityLinks(
      db,
      {
        mbid: async () => null,
        links: async (mbid) => {
          if (mbid === "mb-blur") throw new Error("MusicBrainz links failed: 503");
          return { wikidataId: null, wikipediaUrl: null };
        },
        wikipedia: async () => "https://en.wikipedia.org/wiki/Muse_(band)",
      },
      { now },
    );
    expect(updates).toEqual([{ id: 1, data: { mbid: "mb-muse", wikidataId: "Q123", wikipediaUrl: "https://en.wikipedia.org/wiki/Muse_(band)", linksCheckedAt: now } }]);
    expect(stats.errors).toEqual(["Blur: MusicBrainz links failed: 503"]);
    expect(RECHECK_DAYS).toBe(90);
  });
});

describe("on the band page", () => {
  const all = { mbid: "65f4f0c5", wikidataId: "Q15920", wikipediaUrl: "https://en.wikipedia.org/wiki/Metallica" };
  it("puts every known ID in sameAs and nothing when they are missing", () => {
    expect(bandSameAs(all)).toEqual(["https://musicbrainz.org/artist/65f4f0c5", "https://www.wikidata.org/wiki/Q15920", "https://en.wikipedia.org/wiki/Metallica"]);
    expect(bandSameAs({})).toEqual([]);
    const ld = bandJsonLd({ slug: "metallica", name: "Metallica" }, [concertView()], { sameAs: bandSameAs({}) });
    expect("sameAs" in ld).toBe(false);
  });
  it("shows the same links in the Elsewhere line, plus a setlist.fm search that is not sameAs", () => {
    const links = elsewhereLinks("Guns N' Roses", all);
    expect(links.map((l) => l.id)).toEqual(["wikipedia", "wikidata", "musicbrainz", "setlistfm"]);
    expect(links[3]).toEqual({ id: "setlistfm", label: "setlist.fm", href: "https://www.setlist.fm/search?query=Guns%20N'%20Roses", sameAs: false });
    // Everything visible and vouched for is in sameAs, and the other way round.
    expect(links.filter((l) => l.sameAs).map((l) => l.href).sort()).toEqual(bandSameAs(all).sort());
    expect(elsewhereLinks("Pixies", {}).map((l) => l.id)).toEqual(["setlistfm"]);
  });
  it("lists the links in the band's Markdown copy", () => {
    const md = bandMarkdown({ name: "Metallica", slug: "metallica", bio: null, origin: null, bornYear: null, label: null, aka: null, sameAs: bandSameAs(all) }, [concertView()]);
    expect(md).toContain("## Elsewhere\n\n- https://musicbrainz.org/artist/65f4f0c5\n- https://www.wikidata.org/wiki/Q15920\n- https://en.wikipedia.org/wiki/Metallica");
  });
});
