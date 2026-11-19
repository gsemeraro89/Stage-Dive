// Songs played live: title normalisation, the song addresses, aggregation of a band's setlists into
// song pages, typical position and song length (src/lib/song-title.ts, src/lib/songs.ts).
import { describe, expect, it } from "vitest";
import { shortSongSlug, songSlug, songTitleBase } from "../src/lib/song-title";
import {
  bandSongs,
  canonicalSlugs,
  setlistCount,
  slotOf,
  songLength,
  songLinker,
  songTally,
  typicalPosition,
  type SongConcert,
  type SongTrack,
} from "../src/lib/songs";
import { songKey } from "../src/lib/text";

describe("song titles", () => {
  it("takes off notes about the performance", () => {
    const cases: [string, string][] = [
      ["Creep (Live)", "Creep"],
      ["Creep (live at Pinkpop 1996)", "Creep"],
      ["Paranoid Android - Remastered", "Paranoid Android"],
      ["Paranoid Android - 2011 Remaster", "Paranoid Android"],
      ["Everlong (Acoustic)", "Everlong"],
      ["Encore: Enter Sandman", "Enter Sandman"],
      ["Encore 2 - Seek & Destroy", "Seek & Destroy"],
      ["Am I Evil? (Diamond Head cover)", "Am I Evil?"],
      ["Last Caress (Misfits Cover)", "Last Caress"],
      ["One (with Dave Mustaine)", "One"],
      ["Whiplash [tease]", "Whiplash"],
      ["Creep*", "Creep"],
      ["“One”", "One"],
      ["Seek & Destroy - Live", "Seek & Destroy"],
      ["Creep (Live) (Remastered)", "Creep"],
      ["  Karma   Police ", "Karma Police"],
    ];
    for (const [title, base] of cases) expect(songTitleBase(title), title).toBe(base);
  });
  it("keeps a subtitle that is part of the name", () => {
    expect(songTitleBase("Street Spirit (Fade Out)")).toBe("Street Spirit (Fade Out)");
    expect(songTitleBase("Anesthesia (Pulling Teeth)")).toBe("Anesthesia (Pulling Teeth)");
    expect(songTitleBase("2 + 2 = 5")).toBe("2 + 2 = 5");
    expect(songTitleBase("Live Forever")).toBe("Live Forever"); // "live" in the name itself
  });
  it("never returns an empty title for a non-empty one", () => {
    expect(songTitleBase("(Live)")).toBe("(Live)");
  });
  it("gives one address per song, whatever the spelling", () => {
    expect(songSlug("Creep")).toBe("creep");
    expect(songSlug("CREEP (Live)")).toBe("creep");
    expect(songSlug("Seek & Destroy")).toBe(songSlug("Seek and Destroy"));
    expect(songSlug("Seek & Destroy")).toBe("seek-and-destroy");
    expect(songSlug("Don't Look Back in Anger")).toBe("dont-look-back-in-anger");
    expect(songSlug("Motörhead")).toBe("motorhead");
    expect(songSlug("Street Spirit (Fade Out)")).toBe("street-spirit-fade-out");
    expect(songSlug("???")).toBe("");
    expect(shortSongSlug("Street Spirit (Fade Out)")).toBe("street-spirit");
    expect(shortSongSlug("Creep")).toBeNull();
    // The answers and concert notes use the same key.
    expect(songKey("One (Live)")).toBe(songKey("one"));
  });
});

describe("song addresses for one band", () => {
  it("files a subtitled spelling with its short form when the band has both", () => {
    const map = canonicalSlugs(["Street Spirit (Fade Out)", "Street Spirit", "Creep (Live)"]);
    expect(map.get("street-spirit-fade-out")).toBe("street-spirit");
    expect(map.get("street-spirit")).toBe("street-spirit");
    expect(map.get("creep")).toBe("creep");
    // Without the short form, the full name is the address.
    expect(canonicalSlugs(["Street Spirit (Fade Out)"]).get("street-spirit-fade-out")).toBe("street-spirit-fade-out");
  });
  it("links setlist lines to their song page", () => {
    const link = songLinker("radiohead", ["Street Spirit", "Street Spirit (Fade Out)", "Creep"]);
    expect(link("Street Spirit (Fade Out)")).toBe("/songs/radiohead/street-spirit");
    expect(link("Creep (Live)")).toBe("/songs/radiohead/creep");
    expect(link("Airbag")).toBe("/songs/radiohead/airbag"); // a song only in this setlist still has a page
    expect(link("???")).toBeNull();
  });
  it("tallies songs once per setlist, most played first", () => {
    const tally = songTally([
      ["Creep", "Karma Police", "Creep (Reprise)"],
      ["Karma Police", "creep (live)"],
      ["Airbag", "Karma Police"],
    ]);
    expect(tally).toEqual([
      { slug: "karma-police", title: "Karma Police", count: 3 },
      { slug: "creep", title: "Creep", count: 2 },
      { slug: "airbag", title: "Airbag", count: 1 },
    ]);
  });
});

describe("positions and lengths", () => {
  it("names the slot of a song in its set", () => {
    expect(slotOf(1, 10)).toBe("opener");
    expect(slotOf(10, 10)).toBe("closer");
    expect(slotOf(2, 10)).toBe("early");
    expect(slotOf(5, 10)).toBe("middle");
    expect(slotOf(8, 10)).toBe("late");
    expect(slotOf(1, 1)).toBe("middle");
  });
  it("calls a song the opener only when it opened more than half of at least two sets", () => {
    const v = (position: number, of: number) => ({ position, of, slot: slotOf(position, of) });
    expect(typicalPosition([v(1, 10)])).toBeNull(); // one version says nothing
    expect(typicalPosition([v(1, 10), v(1, 8)])).toEqual({ slot: "opener", count: 2, of: 2 });
    expect(typicalPosition([v(1, 10), v(1, 8), v(5, 9)])).toEqual({ slot: "opener", count: 2, of: 3 });
    expect(typicalPosition([v(10, 10), v(8, 8), v(7, 8)])).toEqual({ slot: "closer", count: 2, of: 3 });
    // Opened one of two: not "the opener", but early in the set.
    expect(typicalPosition([v(1, 10), v(2, 10)])).toEqual({ slot: "early", count: 2, of: 2 });
    expect(typicalPosition([v(5, 10), v(6, 10), v(2, 10)])).toEqual({ slot: "middle", count: 2, of: 3 });
    expect(typicalPosition([v(9, 10), v(8, 10), v(10, 10), v(5, 10)])?.slot).toBe("late");
  });
  it("measures a song up to the next line's start, only when plausible", () => {
    const t = (time: number | null, title = "x"): SongTrack => ({ time, title, artist: null, unidentified: false });
    const tracks = [t(0), t(260), t(null), t(900), t(915), t(4000)];
    expect(songLength(tracks, 0)).toBe(260);
    expect(songLength(tracks, 1)).toBeNull(); // the next line has no time
    expect(songLength(tracks, 3)).toBeNull(); // 15 seconds: a setlist mistake
    expect(songLength(tracks, 4)).toBeNull(); // over 30 minutes
    expect(songLength(tracks, 5)).toBeNull(); // the last song: its end is not known
  });
});

const track = (time: number | null, title: string, artist: string | null = null): SongTrack => ({ time, title, artist, unidentified: /^ID$/i.test(title) });
let nextId = 1;
function concert(over: Partial<SongConcert> & { tracks: SongTrack[] }): SongConcert {
  const id = nextId++;
  return {
    id,
    slug: `radiohead-${id}`,
    title: `Radiohead live ${id}`,
    youtubeId: `yt${id}`,
    thumbnailUrl: null,
    performedYear: null,
    performedOn: null,
    durationSeconds: 7200,
    viewCount: 1000,
    updatedAt: new Date("2026-11-01T00:00:00Z"),
    venue: null,
    city: null,
    country: null,
    venueKind: null,
    tour: null,
    ...over,
  };
}

describe("a band's songs", () => {
  const pinkpop = concert({
    performedYear: 1996,
    venue: { slug: "pinkpop", name: "Pinkpop" },
    venueKind: { slug: "festival", name: "Festival" },
    tracks: [track(0, "Planet Telex"), track(270, "Creep"), track(530, "Just"), track(800, "Street Spirit (Fade Out)")],
  });
  const glasto = concert({
    performedYear: 1997,
    performedOn: new Date("1997-06-28T00:00:00Z"),
    venue: { slug: "glastonbury", name: "Glastonbury" },
    venueKind: { slug: "festival", name: "Festival" },
    tour: { slug: "ok-computer", name: "OK Computer Tour" },
    tracks: [track(0, "Lucky"), track(280, "Creep (Live)"), track(540, "ID"), track(800, "Am I Evil?", "Diamond Head"), track(1100, "Street Spirit")],
  });
  const paris = concert({
    performedYear: 2003,
    venue: { slug: "le-zenith", name: "Le Zenith" },
    updatedAt: new Date("2026-11-10T00:00:00Z"),
    tracks: [track(null, "There There"), track(null, "Creep"), track(null, "Just")],
  });
  const undated = concert({ tracks: [track(0, "CREEP"), track(240, "Lucky")] });
  const songs = bandSongs({ names: ["Radiohead"] }, [pinkpop, glasto, paris, undated]);
  const creep = songs.find((s) => s.slug === "creep")!;

  it("makes one song per address, most versions first", () => {
    expect(songs[0].slug).toBe("creep");
    expect(creep.versions).toHaveLength(4);
    expect(songs.map((s) => s.slug)).toContain("street-spirit"); // both spellings filed together
    expect(songs.find((s) => s.slug === "street-spirit")!.versions).toHaveLength(2);
    expect(songs.find((s) => s.slug === "street-spirit")!.title).toBe("Street Spirit (Fade Out)"); // the fuller spelling on a tie
    expect(songs.map((s) => s.slug)).not.toContain("id"); // unidentified lines are left out
    expect(setlistCount([pinkpop, glasto, paris, undated])).toBe(4);
  });
  it("lists versions newest first, undated last, each linking to the concert at the song", () => {
    expect(creep.versions.map((v) => v.concert.id)).toEqual([paris.id, glasto.id, pinkpop.id, undated.id]);
    expect(creep.versions[1].href).toBe(`/concerts/${glasto.slug}?t=280`);
    expect(creep.versions[0].href).toBe(`/concerts/${paris.slug}`); // no time: the concert page
    expect(creep.oldest!.concert.id).toBe(pinkpop.id);
    expect(creep.newest!.concert.id).toBe(paris.id);
  });
  it("works out positions, the usual place in the set and the length", () => {
    const glastoVersion = creep.versions.find((v) => v.concert.id === glasto.id)!;
    expect(glastoVersion.position).toBe(2);
    expect(glastoVersion.of).toBe(4); // the "ID" line does not count
    expect(creep.position?.slot).toBe("early");
    // 270 at Pinkpop, 260 at Glastonbury (to the unidentified line), 240 in the undated one.
    expect(creep.averageLengthSeconds).toBe(Math.round((260 + 260 + 240) / 3));
    expect(creep.timedVersions).toBe(3);
  });
  it("counts places, festivals, decades and tours", () => {
    expect(creep.places).toEqual([
      { slug: "le-zenith", name: "Le Zenith", count: 1, festival: false },
      { slug: "glastonbury", name: "Glastonbury", count: 1, festival: true },
      { slug: "pinkpop", name: "Pinkpop", count: 1, festival: true },
    ]);
    expect(creep.decades).toEqual([
      { label: "1990s", count: 2 },
      { label: "2000s", count: 1 },
    ]);
    expect(creep.tours).toEqual([{ slug: "ok-computer", name: "OK Computer Tour", count: 1 }]);
    expect(creep.updatedAt).toEqual(new Date("2026-11-10T00:00:00Z"));
  });
  it("keeps a cover under the band that played it, with the setlist's credit", () => {
    const evil = songs.find((s) => s.slug === "am-i-evil")!;
    expect(evil.creditedTo).toBe("Diamond Head");
    expect(creep.creditedTo).toBeNull();
    // The band's own name as the credit is not a credit to someone else.
    const own = bandSongs({ names: ["Radiohead", "On A Friday"] }, [concert({ tracks: [track(0, "Creep", "radiohead"), track(200, "Just", "On a Friday")] })]);
    expect(own.map((s) => s.creditedTo)).toEqual([null, null]);
  });
  it("counts a song once per concert", () => {
    const twice = bandSongs({ names: ["Radiohead"] }, [concert({ tracks: [track(0, "Creep"), track(300, "Lucky"), track(600, "Creep (Reprise)")] })]);
    expect(twice.find((s) => s.slug === "creep")!.versions).toHaveLength(1);
  });
});
