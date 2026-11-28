// Song pages and a band's songs page for search engines and AI assistants: strong-page rules, titles,
// sitemap entries, structured data, answers, Markdown copies, llms-full.txt and the copy rules.
import { afterEach, describe, expect, it } from "vitest";
import { bandSongsAnswers, concertAnswers, songAnswers } from "../src/lib/answers";
import { concertNotes, noteText } from "../src/lib/concert-notes";
import { bandMarkdown, bandSongsMarkdown, concertMarkdown, llmsFullTxt, llmsTxt, songMarkdown } from "../src/lib/llms";
import { bandSongsSearchTitle, INDEX_ROBOTS, robotsFor, songIndexIsStrong, songIsStrong, songSearchTitle } from "../src/lib/seo";
import { buildSitemap } from "../src/lib/sitemap";
import { bandSongs, songLinker, type SongConcert, type SongTrack } from "../src/lib/songs";
import { bandSongsJsonLd, concertEventJsonLd, songJsonLd } from "../src/lib/structured-data";
import { BANNED, concertView, setlist, youtubeOnlyWithViews } from "./fixtures/concert-view";

process.env.SITE_URL = "https://stagedive.example";
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

const track = (time: number | null, title: string, artist: string | null = null): SongTrack => ({ time, title, artist, unidentified: false });
const gig = (id: number, over: Partial<SongConcert>, tracks: SongTrack[]): SongConcert => ({
  id,
  slug: `radiohead-${id}`,
  title: `Radiohead live ${id}`,
  youtubeId: `yt${id}`,
  thumbnailUrl: null,
  performedYear: null,
  performedOn: null,
  durationSeconds: 6000,
  viewCount: 1000,
  updatedAt: new Date("2026-11-01T00:00:00Z"),
  venue: null,
  city: null,
  country: null,
  venueKind: null,
  tour: null,
  tracks,
  ...over,
});
const concerts = [
  gig(1, { performedYear: 1996, venue: { slug: "pinkpop", name: "Pinkpop" }, venueKind: { slug: "festival", name: "Festival" } }, [
    track(0, "Planet Telex"),
    track(270, "Creep"),
    track(530, "Just"),
  ]),
  gig(2, { performedYear: 1997, venue: { slug: "glastonbury", name: "Glastonbury" }, updatedAt: new Date("2026-11-12T00:00:00Z") }, [
    track(0, "Lucky"),
    track(280, "Creep (Live)"),
    track(540, "Karma Police"),
  ]),
];
const band = { slug: "radiohead", name: "Radiohead" };
const songs = bandSongs({ names: ["Radiohead"] }, concerts);
const creep = songs.find((s) => s.slug === "creep")!;
const lucky = songs.find((s) => s.slug === "lucky")!;

describe("strong pages", () => {
  it("indexes a song page from two live versions", () => {
    expect(songIsStrong(1)).toBe(false);
    expect(songIsStrong(2)).toBe(true);
  });
  it("indexes a band's songs page from five songs and two setlists", () => {
    expect(songIndexIsStrong({ songs: 4, setlists: 3 })).toBe(false);
    expect(songIndexIsStrong({ songs: 5, setlists: 1 })).toBe(false);
    expect(songIndexIsStrong({ songs: 5, setlists: 2 })).toBe(true);
  });
  it("never indexes anything off the live site", () => {
    delete process.env.SITE_INDEXABLE;
    expect(robotsFor(songIsStrong(4))).toEqual({ index: false, follow: false });
    process.env.SITE_INDEXABLE = "true";
    expect(robotsFor(songIsStrong(4))).toEqual(INDEX_ROBOTS);
    expect(robotsFor(songIsStrong(1))).toEqual({ index: false, follow: true });
  });
});

describe("titles", () => {
  it("are written the way people search", () => {
    expect(songSearchTitle("Creep", "Radiohead", 4)).toBe("Creep Live · Radiohead · Every Live Version");
    expect(songSearchTitle("Lucky", "Radiohead", 1)).toBe("Lucky Live · Radiohead · Live Version");
    expect(bandSongsSearchTitle("Radiohead")).toBe("Radiohead · Songs Played Live");
  });
});

describe("answers", () => {
  it("leads a song page with facts only", () => {
    expect(songAnswers(band, creep, 2).lead).toBe(
      "“Creep” by Radiohead: 2 live versions on STAGEDIVE, played between 1996 and 1997, at Glastonbury and Pinkpop. It usually comes in the middle of the set. It runs 4 minutes on average. Each version plays on its concert page, starting at the song where the setlist gives its time.",
    );
    // One version: no pattern, no "on average".
    const one = songAnswers(band, lucky, 2);
    expect(one.lead).toBe(
      "“Lucky” by Radiohead: 1 live version on STAGEDIVE, played in 1997, at Glastonbury. It runs 5 minutes. Each version plays on its concert page, starting at the song where the setlist gives its time.",
    );
    expect(one.questions.map((q) => q.question)).not.toContain("Where in the set does Radiohead play “Lucky”?");
  });
  it("answers how often, when, where in the set and how long", () => {
    const q = Object.fromEntries(songAnswers(band, creep, 2).questions.map((x) => [x.question, x.answer]));
    expect(q["How often does Radiohead play “Creep” live?"]).toBe("It is in 2 of the 2 Radiohead setlists on STAGEDIVE.");
    expect(q["When did Radiohead play “Creep” live?"]).toBe("The oldest version here is from Pinkpop 1996, the newest from Glastonbury 1997.");
    expect(q["How long is “Creep” live?"]).toBe("4 minutes on average, from 2 versions with times (4:20).");
  });
  it("leads a band's songs page with its most played songs", () => {
    const a = bandSongsAnswers(band, songs.map((s) => ({ title: s.title, count: s.versions.length })), 2);
    expect(a.lead).toBe("5 songs Radiohead played live in the 2 setlists on STAGEDIVE. Most played: “Creep” (2). Each song has its own page with every live version.");
  });
});

describe("structured data", () => {
  const [composition, list] = songJsonLd(band, creep) as Record<string, any>[];
  it("describes the song and every live version by the band, linked to the concert videos", () => {
    expect(composition).toMatchObject({ "@type": "MusicComposition", name: "Creep", url: "https://stagedive.example/songs/radiohead/creep" });
    expect(composition.composer).toBeUndefined(); // a setlist does not say who wrote it
    expect(list["@type"]).toBe("ItemList");
    expect(list.numberOfItems).toBe(2);
    const first = list.itemListElement[0].item;
    expect(first).toMatchObject({
      "@type": "MusicRecording",
      name: "Creep (live, Glastonbury 1997)",
      url: "https://stagedive.example/concerts/radiohead-2?t=280",
      byArtist: { "@type": "MusicGroup", name: "Radiohead", url: "https://stagedive.example/artists/radiohead" },
      recordingOf: { "@id": "https://stagedive.example/songs/radiohead/creep#song" },
      duration: "PT4M20S",
      dateCreated: "1997",
      isPartOf: { "@id": "https://stagedive.example/concerts/radiohead-2#video" },
    });
    // A reference to the concert page's video, not a second (incomplete) VideoObject.
    expect(first.isPartOf).not.toHaveProperty("@type");
  });
  it("lists a band's song pages", () => {
    const l = bandSongsJsonLd(band, songs) as Record<string, any>;
    expect(l.itemListElement[0]).toMatchObject({ position: 1, url: "https://stagedive.example/songs/radiohead/creep", name: "Creep" });
  });
  it("links the songs a concert performed to their pages", () => {
    const link = songLinker("metallica", [["Enter Sandman", "Creeping Death"]]);
    const event = concertEventJsonLd(concertView(), setlist, link) as Record<string, any>;
    expect(event.workPerformed[0]).toEqual({ "@type": "MusicComposition", name: "Enter Sandman", url: "https://stagedive.example/songs/metallica/enter-sandman" });
  });
});

describe("sitemap", () => {
  const entries = buildSitemap([], [], [
    {
      slug: "radiohead",
      setlists: 3,
      songs: [
        { slug: "creep", versions: 3, updatedAt: new Date("2026-11-12T00:00:00Z") },
        { slug: "karma-police", versions: 2, updatedAt: new Date("2026-11-02T00:00:00Z") },
        { slug: "lucky", versions: 1, updatedAt: new Date("2026-11-03T00:00:00Z") },
        { slug: "airbag", versions: 1, updatedAt: new Date("2026-11-03T00:00:00Z") },
        { slug: "just", versions: 1, updatedAt: new Date("2026-11-03T00:00:00Z") },
      ],
    },
    { slug: "pixies", setlists: 1, songs: [{ slug: "debaser", versions: 1, updatedAt: new Date("2026-11-01T00:00:00Z") }] },
  ]);
  const paths = entries.map((e) => e.path);
  it("lists song pages from two versions and a band's songs page by the same rules as the pages", () => {
    expect(paths).toContain("/songs/radiohead/creep");
    expect(paths).toContain("/songs/radiohead/karma-police");
    expect(paths).not.toContain("/songs/radiohead/lucky");
    expect(paths).toContain("/songs/radiohead");
    expect(paths).not.toContain("/songs/pixies");
    expect(paths.filter((p) => p.startsWith("/songs/pixies"))).toEqual([]);
    expect(entries.find((e) => e.path === "/songs/radiohead")!.lastModified).toEqual(new Date("2026-11-12T00:00:00Z"));
  });
});

describe("Markdown copies and llms files", () => {
  const md = songMarkdown(band, creep, 2, [{ slug: "lucky", title: "Lucky", versions: 1 }]);
  it("gives a song page's lead, facts, every version with its deep link, more songs and questions", () => {
    expect(md.startsWith("# Creep by Radiohead: every live version\n\n“Creep” by Radiohead: 2 live versions")).toBe(true);
    expect(md).toContain("- **Band:** [Radiohead](https://stagedive.example/artists/radiohead)");
    expect(md).toContain("- **Played at:** [Glastonbury](https://stagedive.example/venues/glastonbury), [Pinkpop](https://stagedive.example/venues/pinkpop)");
    expect(md).toContain("1. [Glastonbury 1997](https://stagedive.example/concerts/radiohead-2?t=280): song 2 of 3, starts at 4:40, 4:20 long");
    expect(md).toContain("- [Lucky](https://stagedive.example/songs/radiohead/lucky): 1 live version");
    expect(md).toContain("### How often does Radiohead play “Creep” live?");
    expect(md).toContain("Source: STAGEDIVE, https://stagedive.example/songs/radiohead/creep");
  });
  it("gives a band's songs page", () => {
    const list = bandSongsMarkdown(band, songs, 2);
    expect(list).toContain("# Radiohead: songs played live");
    expect(list).toContain("- [Creep](https://stagedive.example/songs/radiohead/creep): 2 live versions, 1996 to 1997");
  });
  it("links each setlist song of a concert copy to its song page", () => {
    const c = concertMarkdown(concertView(), setlist, [], { "Enter Sandman": "/songs/metallica/enter-sandman" });
    expect(c).toContain("1. [0:00](https://stagedive.example/concerts/metallica-l-c-walker-arena-1991?t=0) [Enter Sandman](https://stagedive.example/songs/metallica/enter-sandman)");
  });
  it("puts live statistics and songs on the band's copy", () => {
    const b = bandMarkdown(
      { name: "Metallica", slug: "metallica", bio: null, origin: null, bornYear: null, label: null, aka: null },
      [concertView(), concertView({ id: 2, slug: "metallica-2", durationSeconds: 6000 })],
      [["Enter Sandman", "Creeping Death"], ["Enter Sandman", "Seek & Destroy"]],
    );
    expect(b).toContain("## Live statistics");
    expect(b).toContain("- **Usually opens with:** Enter Sandman (2 of 2)");
    expect(b).toContain("## Songs played live");
    expect(b).toContain("- [Enter Sandman](https://stagedive.example/songs/metallica/enter-sandman): 2 setlists");
    expect(b).toContain("### What song does Metallica usually open with?");
  });
  it("lists songs played live in llms.txt and llms-full.txt", () => {
    const data = { bands: [], venues: [], genres: [], decades: [], tours: [] };
    expect(llmsTxt(data)).toContain("/songs/<band>/<song>");
    const full = llmsFullTxt({
      ...data,
      songs: [{ slug: "radiohead", name: "Radiohead", setlists: 2, songs: songs.map((s) => ({ slug: s.slug, title: s.title, versions: s.versions.length })) }],
      mostWatched: [],
      latest: [],
    });
    expect(full).toContain("## Songs played live (1 band)");
    expect(full).toContain("- [Radiohead: songs played live](https://stagedive.example/songs/radiohead): 5 songs, 2 setlists");
    expect(full).toContain("- [Creep by Radiohead](https://stagedive.example/songs/radiohead/creep): 2 live versions");
    expect(full).not.toContain("[Lucky by Radiohead]"); // one version: not among the most played
  });
  it("follows the copy rules", () => {
    const texts = [
      md,
      bandSongsMarkdown(band, songs, 2),
      songAnswers(band, creep, 2).lead,
      JSON.stringify(songJsonLd(band, creep)),
      songSearchTitle("Creep", "Radiohead", 2),
    ];
    for (const t of texts) {
      expect(t).not.toMatch(BANNED);
      expect(youtubeOnlyWithViews(t)).toBe(true);
    }
  });
  it("never opens or counts a concert with a line that is not a song", () => {
    const withJunk = {
      source: "DESCRIPTION",
      tracks: [
        { time: 0, artist: null, title: "Lars Intro", unidentified: false, artistSlug: null },
        ...setlist.tracks.map((t) => ({ ...t, time: (t.time ?? 0) + 60 })),
        { time: 2000, artist: null, title: "Kirk Solo", unidentified: false, artistSlug: null },
      ],
    };
    const lead = concertAnswers(concertView(), withJunk).lead;
    expect(lead).toContain("5 songs, opening with “Enter Sandman”");
    const notes = concertNotes({ concert: concertView(), band: { slug: "metallica", name: "Metallica" }, siblings: [], setlist: withJunk, decade: null });
    expect(noteText(notes.find((n) => n.id === "setlist")!)).toBe("5 songs: opens with “Enter Sandman”, closes with “Seek & Destroy”.");
  });
});
