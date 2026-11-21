// Live albums from MusicBrainz (src/lib/live-albums.ts): reading a recorded answer (the sandbox cannot
// reach MusicBrainz; the fixture follows the ws/2 release-group browse format), paging, the official-only
// filter and its fallback, the job's choices and storage, tying an album to one of our concerts, and the
// band page's Markdown copy.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LINKS_USER_AGENT } from "../src/lib/collector/musicbrainz";
import {
  fetchLiveAlbums,
  LIVE_RECHECK_DAYS,
  liveAlbumsDue,
  liveAlbumsFrom,
  liveAlbumViews,
  matchConcert,
  refreshLiveAlbums,
  releaseGroupUrl,
} from "../src/lib/live-albums";
import { bandMarkdown } from "../src/lib/llms";
import { BANNED, concertView, youtubeOnlyWithViews } from "./fixtures/concert-view";

process.env.SITE_URL = "https://stagedive.example";

const page = JSON.parse(readFileSync(new URL("./fixtures/musicbrainz-release-groups.json", import.meta.url), "utf8"));

function recorded(answers: { body: unknown; status?: number }[]) {
  const calls: { url: string; ua: string | null }[] = [];
  let i = 0;
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), ua: new Headers(init?.headers).get("User-Agent") });
    const a = answers[Math.min(i++, answers.length - 1)];
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("reading MusicBrainz", () => {
  it("keeps albums with the Live secondary type only, with their first year", () => {
    expect(liveAlbumsFrom(page)).toEqual([
      { mbid: "0f4c5d3a-1e2b-4c8a-9f61-2a7e0b5d1c02", title: "Live Shit: Binge & Purge", year: 1993 },
      { mbid: "0f4c5d3a-1e2b-4c8a-9f61-2a7e0b5d1c03", title: "S&M", year: 1999 },
      { mbid: "0f4c5d3a-1e2b-4c8a-9f61-2a7e0b5d1c04", title: "Some Live Compilation", year: null },
    ]);
    expect(liveAlbumsFrom({})).toEqual([]);
  });
  it("asks for official album groups, naming itself, and sorts oldest first", async () => {
    const { fn, calls } = recorded([{ body: page }]);
    const albums = await fetchLiveAlbums("65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab", fn);
    expect(albums.map((a) => a.title)).toEqual(["Live Shit: Binge & Purge", "S&M", "Some Live Compilation"]);
    expect(calls).toEqual([
      {
        url: "https://musicbrainz.org/ws/2/release-group?artist=65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab&type=album&fmt=json&limit=100&offset=0&release-group-status=website-default",
        ua: LINKS_USER_AGENT,
      },
    ]);
  });
  it("reads the next page while there is one, and asks again without the official filter if it is refused", async () => {
    const first = { ...page, "release-group-count": 150 };
    const second = { "release-group-count": 150, "release-group-offset": 100, "release-groups": [{ id: "z", title: "Later Live", "primary-type": "Album", "secondary-types": ["Live"], "first-release-date": "2020" }] };
    const { fn, calls } = recorded([{ body: { error: "bad" }, status: 400 }, { body: first }, { body: second }]);
    const albums = await fetchLiveAlbums("m", fn);
    expect(albums.map((a) => a.mbid)).toContain("z");
    expect(calls.map((c) => c.url.replace("https://musicbrainz.org/ws/2/release-group?artist=m&type=album&fmt=json&limit=100", ""))).toEqual([
      "&offset=0&release-group-status=website-default",
      "&offset=0",
      "&offset=100",
    ]);
  }, 15_000);
  it("gives nothing for an unknown artist and fails on other errors", async () => {
    expect(await fetchLiveAlbums("m", recorded([{ body: {}, status: 404 }]).fn)).toEqual([]);
    await expect(fetchLiveAlbums("m", recorded([{ body: {}, status: 500 }]).fn)).rejects.toThrow("MusicBrainz release groups failed: 500");
  }, 15_000);
});

describe("tying an album to one of our concerts", () => {
  const pinkpop93 = { slug: "metallica-pinkpop-1993", venue: { name: "Pinkpop" }, performedYear: 1993 };
  const pinkpop08 = { slug: "metallica-pinkpop-2008", venue: { name: "Pinkpop" }, performedYear: 2008 };
  const arena = { slug: "arena", venue: { name: "Arena" }, performedYear: 1993 };
  it("needs the place in the title and the same year", () => {
    expect(matchConcert({ title: "Live at Pinkpop 1993", year: 2012 }, [pinkpop93, pinkpop08])).toBe(pinkpop93);
    expect(matchConcert({ title: "Live at Pinkpop", year: 2008 }, [pinkpop93, pinkpop08])).toBe(pinkpop08);
    expect(matchConcert({ title: "Live at Pinkpop", year: 2012 }, [pinkpop93, pinkpop08])).toBeNull();
    expect(matchConcert({ title: "Live at Pinkpop 1995", year: 1995 }, [pinkpop93])).toBeNull();
    expect(matchConcert({ title: "Live Shit: Binge & Purge", year: 1993 }, [pinkpop93])).toBeNull();
  });
  it("never guesses: whole words only, short names ignored, and no tie when two concerts fit", () => {
    expect(matchConcert({ title: "Live in Arenas 1993", year: 1993 }, [arena])).toBeNull();
    expect(matchConcert({ title: "Live at the O2 1993", year: 1993 }, [{ slug: "o2", venue: { name: "O2" }, performedYear: 1993 }])).toBeNull();
    expect(matchConcert({ title: "Live at Pinkpop 1993", year: 1993 }, [pinkpop93, { ...pinkpop93, slug: "other" }])).toBeNull();
  });
  it("links each album to MusicBrainz", () => {
    const views = liveAlbumViews([{ mbid: "x", title: "Live at Pinkpop 1993", year: 2012 }], [pinkpop93]);
    expect(views).toEqual([{ mbid: "x", title: "Live at Pinkpop 1993", year: 2012, url: "https://musicbrainz.org/release-group/x", concert: { slug: "metallica-pinkpop-1993" } }]);
    expect(releaseGroupUrl("x")).toBe("https://musicbrainz.org/release-group/x");
  });
});

describe("the live albums job", () => {
  const now = new Date("2026-11-21T00:00:00Z");
  const old = new Date(now.getTime() - (LIVE_RECHECK_DAYS + 1) * 86_400_000);
  it("asks bands never asked, asked long ago, or whose MusicBrainz ID changed", () => {
    expect(liveAlbumsDue({ mbid: null, liveAlbumsMbid: null, liveAlbumsCheckedAt: null }, now)).toBe(false);
    expect(liveAlbumsDue({ mbid: "a", liveAlbumsMbid: null, liveAlbumsCheckedAt: null }, now)).toBe(true);
    expect(liveAlbumsDue({ mbid: "a", liveAlbumsMbid: "a", liveAlbumsCheckedAt: now }, now)).toBe(false);
    expect(liveAlbumsDue({ mbid: "a", liveAlbumsMbid: "a", liveAlbumsCheckedAt: now }, now, true)).toBe(true);
    expect(liveAlbumsDue({ mbid: "b", liveAlbumsMbid: "a", liveAlbumsCheckedAt: now }, now)).toBe(true);
    expect(liveAlbumsDue({ mbid: "a", liveAlbumsMbid: "a", liveAlbumsCheckedAt: old }, now)).toBe(true);
  });
  it("replaces each band's albums as a whole and leaves a band unchecked after an error", async () => {
    const ops: unknown[] = [];
    const bands = [
      { id: 1, name: "Metallica", mbid: "mb-metallica", liveAlbumsMbid: null, liveAlbumsCheckedAt: null },
      { id: 2, name: "Blur", mbid: "mb-blur", liveAlbumsMbid: null, liveAlbumsCheckedAt: null },
      { id: 3, name: "Done", mbid: "mb-done", liveAlbumsMbid: "mb-done", liveAlbumsCheckedAt: now },
      { id: 4, name: "Quiet", mbid: "mb-quiet", liveAlbumsMbid: null, liveAlbumsCheckedAt: null },
    ];
    const db = {
      artist: {
        findMany: async () => bands,
        update: (args: unknown) => ({ op: "update", args }),
      },
      artistLiveAlbum: {
        deleteMany: (args: unknown) => ({ op: "deleteMany", args }),
        createMany: (args: unknown) => ({ op: "createMany", args }),
      },
      $transaction: async (list: unknown[]) => {
        ops.push(list);
        return list;
      },
    } as unknown as Parameters<typeof refreshLiveAlbums>[0];
    const asked: string[] = [];
    const stats = await refreshLiveAlbums(
      db,
      {
        liveAlbums: async (mbid) => {
          asked.push(mbid);
          if (mbid === "mb-blur") throw new Error("MusicBrainz release groups failed: 503");
          return mbid === "mb-metallica" ? liveAlbumsFrom(page) : [];
        },
      },
      { now },
    );
    expect(asked).toEqual(["mb-metallica", "mb-blur", "mb-quiet"]);
    expect(stats).toEqual({ checked: 3, withAlbums: ["Metallica: 3"], none: 1, errors: ["Blur: MusicBrainz release groups failed: 503"] });
    expect(ops[0]).toEqual([
      { op: "deleteMany", args: { where: { artistId: 1 } } },
      {
        op: "createMany",
        args: {
          data: liveAlbumsFrom(page).map((a) => ({ artistId: 1, mbid: a.mbid, title: a.title, year: a.year })),
          skipDuplicates: true,
        },
      },
      { op: "update", args: { where: { id: 1 }, data: { liveAlbumsCheckedAt: now, liveAlbumsMbid: "mb-metallica" } } },
    ]);
    expect(ops).toHaveLength(2);
  });
});

describe("in the band's Markdown copy", () => {
  it("lists the live albums with their links and the matching concert, and answers the question", () => {
    const concerts = [concertView({ slug: "metallica-pinkpop-1993", venue: { slug: "pinkpop", name: "Pinkpop" }, performedYear: 1993, performedOn: null })];
    const albums = liveAlbumViews([{ mbid: "x", title: "Live at Pinkpop 1993", year: 2012 }, { mbid: "y", title: "S&M", year: 1999 }], concerts);
    const md = bandMarkdown({ name: "Metallica", slug: "metallica", bio: null, origin: null, bornYear: null, label: null, aka: null }, concerts, [], albums);
    expect(md).toContain(
      "## Live albums (from MusicBrainz)\n\n- [S&M](https://musicbrainz.org/release-group/y), 1999\n- [Live at Pinkpop 1993](https://musicbrainz.org/release-group/x), 2012: the full concert is at https://stagedive.example/concerts/metallica-pinkpop-1993",
    );
    expect(md).toContain("### What live albums has Metallica released?");
    expect(md).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(md)).toBe(true);
  });
});
