// Songs played live: title normalisation, the song addresses, aggregation of a band's setlists into
// song pages, typical position and song length (src/lib/song-title.ts, src/lib/songs.ts).
import { describe, expect, it } from "vitest";
import { isNotASong, shortSongSlug, songParts, songSlug, songTitleBase, splitMedley } from "../src/lib/song-title";
import {
  bandSongs,
  canonicalSlugs,
  setlistCount,
  setlistSongs,
  slotOf,
  songCount,
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

// Lines from real setlists (production copy, 19 Nov 2026).
describe("lines that are not songs", () => {
  const notSongs = [
    // solos
    "Kirk Solo I", "Kirk Solo II", "Bass Solo", "Drum Solo", "Drum solo", "Vogg Guitar Solo", "guitar solo Vogg", "Tre Cool Drum Solo",
    "Chris Kontos Drum Solo", "Kirk Hammett Guitar Solo", "solo Flea", "Mario Drum Solo",
    "Guitar Solo (1:22:45 C. Gounod — Funeral March of a Marionette, the 'Alfred Hitchcock Presents' theme)",
    "Little Bass Solo (¨Remember Tomorrow¨ Jam)", "[Tai Chi Solo & Keyboard Instrumental]",
    // intros and outros on their own
    "Lars Intro", "Kirk Intro", "Robert Intro", "Drum Intro", "The Weapon Intro", "Hold On intro", "Intro", "✨ Intro", "🎶 Intro",
    "Intro (Hello/Imaginary/Tourniquet/Whisper)", "Intro - The Good The Bad and The Ugly Theme Song", "Intro Jam",
    // jams and doodles
    "Metallijam", "Encore Jam", "Final Jam", "Kaoss Pad Jam", "*Water Jam*", "Guitar Doodle #2", "Kirk Doodle Pt 1", "Bass Doodle",
    "Rob & Kirk’s Doodle", "Lars Diddle", "(a little jamming)", "My Friend of Misery jam", "\"Ronnie\" jam",
    "\"Cure\" and \"Highway To Hell\" jams", "¨The Memory Remains¨ Jam", "Jason and Kirk's doodle (?)",
    "Bass/Guitar Doodle (¨My Friend Of Mysery and Sanitarium¨ Jam)",
    // speeches and banter
    "speech_1 Rob (over intro darkness within)", "speech_2 Rob", "[Dave talks to crowd]", "THANK YOU", "/ [53:50] Mike's Crazy Antics 🤪",
    "Break; Greg talks about smelling bratwurst", "BREAK before ‘burn my eyes’", "*Intermission*",
    // notes and shouts
    "🐎Chino's battery died (Digital Bath was on the setlist but not played)", "08b. Crashout (Not a Song)", "Davidian (1:59:51) [No sound until",
    "\"LET ME PLAY DRUMS ON BLACKOUT, Is there any chance?\" (Spoiler: it was not)", "Corrosion of Conformity Cover (Song?)",
    "Larsypoo's movie thing (includes tapes of Roam, Orion, To Live Is to Die, Battery, Blackened)", "SAD BUT TRUUUEEEEAAAAHHH",
    "Rest in peace Chester Bennington :(", "(a long intro into...)",
    // broken fragments
    "I Am Hell (Sonata In C#", "with \"Ride The Lightning\" intro at the end)", ") Creep", "/ Creep",
    // a medley's name on its own
    "Justice Medley", "Metal Medley", "Cover Medley", "Medley",
  ];
  it.each(notSongs)("%s", (line) => {
    expect(songParts(line)).toEqual([]);
  });
  it("keeps real songs, including ones with a tricky word", () => {
    for (const t of ["Introduce Yourself", "Breakout", "Break Stuff", "Jamie's Cryin'", "Whiskey In The Jar", "Talk Show Host", "Some Candy Talking", "Song to Say Goodbye", "Everybody Wants Some!!", "21 Guns", "1984", "7", "23.95", "2112: The Temples Of Syrinx"]) {
      expect(isNotASong(t), t).toBe(false);
      expect(songParts(t), t).toEqual([t]);
    }
  });
});

describe("title cleaning (real lines)", () => {
  const cases: [string, string][] = [
    ["1 - 99 Revolutions", "99 Revolutions"],
    ["19 - Basket Case", "Basket Case"],
    ["7 -Holiday", "Holiday"],
    ["08b. In the Fade", "In the Fade"],
    ["08a. In the Fade", "In the Fade"],
    ["🐎Korea", "Korea"],
    ["🧢 Break Stuff", "Break Stuff"],
    ["🖤 Haunted", "Haunted"],
    ["🎶 No One Knows", "No One Knows"],
    ["✨ Take Me Out", "Take Me Out"],
    ["* Dead Embryonic Cells", "Dead Embryonic Cells"],
    ["A Ton of Love - *12:43*", "A Ton of Love"],
    ["Smokers Outside the Hospital Doors - *1:13:08*", "Smokers Outside the Hospital Doors"],
    ["Damage, Inc. (2:21:07 double kick!)", "Damage, Inc."],
    ["Raining Blood - Snippet", "Raining Blood"],
    ["10 - Good Riddance (Time of Your Life) (Slightly shortened version while Tré fixed his kick drum pedal)", "Good Riddance (Time of Your Life)"],
    ["16 - Longview (with fan brought on stage to sing part of the song)", "Longview"],
    ["One (missing footage until final harmony section/guitar battle)", "One"],
    ["Your New Aesthetic (Alt/unfinished lyrics. May have been called Skeleton at this time).", "Your New Aesthetic"],
    ["Stockholm Syndrome (Execution Commentary + Psycho riff outro)", "Stockholm Syndrome"],
    ["How to Disappear Completely (con dedicatoria)", "How to Disappear Completely"],
    ["Midlife Crisis (With \"Strawberry Letter 23\" By Brothers Johnson breakdown)", "Midlife Crisis"],
    ["🧢 Re-Arranged (until the bridge, straight into..)", "Re-Arranged"],
    ["Voodoo Queen (Unreleased)", "Voodoo Queen"],
    ["bite the bullet (tour debut)", "bite the bullet"],
    ["The Shortest Straw (highlight)", "The Shortest Straw"],
    ["Enter Sandman (With stage \"accident\")", "Enter Sandman"],
    ["Seek And Destroy (Jason's Song)", "Seek And Destroy"],
    ["0 - The Good, the Bad and the Ugly (Ennio Morricone song)", "The Good, the Bad and the Ugly"],
    ["Aesthetics Of Hate [w/ Vogg Solo Outro]", "Aesthetics Of Hate"],
    ["I Am Hell (Sonata in C#) (Outro)", "I Am Hell (Sonata in C#)"],
    ["The Wars End w/ 'There Is Power in a Union' snippet (Billy Bragg Cover)", "The Wars End"],
    ["Purple Haze (*)", "Purple Haze"],
    ["BIRDS - Live Debut", "BIRDS"],
  ];
  it.each(cases)("%s", (line, title) => {
    expect(songParts(line)).toEqual([title]);
  });
  it("keeps real subtitles", () => {
    for (const t of ["Good Riddance (Time of Your Life)", "Street Spirit (Fade Out)", "Welcome Home (Sanitarium)", "Anesthesia (Pulling Teeth)", "Change (In the House of Flies)", "Running Up That Hill (A Deal With God)", "Voodoo Child (Slight Return)", "Exit Music (For a Film)", "Fuck The Kids (Part 1)"]) {
      expect(songTitleBase(t), t).toBe(t);
    }
  });
  it("gives the same address with or without emoji and numbering", () => {
    expect(songSlug("🐎Korea")).toBe(songSlug("Korea"));
    expect(songSlug("19 - Basket Case")).toBe("basket-case");
    expect(songSlug("BECØME THE FIRESTØRM")).toBe("become-the-firestorm");
  });
});

describe("medleys", () => {
  const cases: [string, string[]][] = [
    ["22 - Shout / Always Look on the Bright Side of Life / Hey Jude", ["Shout", "Always Look on the Bright Side of Life", "Hey Jude"]],
    ["Metallica Medley - Welcome Home (Sanitarium)/One/Creeping Death", ["Welcome Home (Sanitarium)", "One", "Creeping Death"]],
    ["Slayer Medley - South of Heaven/Raining Blood", ["South of Heaven", "Raining Blood"]],
    ["Kill/Ride Medley (Ride The Lightning, No Remorse, Four Horsemen, Phantom Lord, Fight Fire With Fire)", ["Ride The Lightning", "No Remorse", "Four Horsemen", "Phantom Lord", "Fight Fire With Fire"]],
    ["Are We The Waiting/St. Jimmy", ["Are We The Waiting", "St. Jimmy"]],
    ["Seek & Destroy/Fight Fire With Fire", ["Seek & Destroy", "Fight Fire With Fire"]],
    ["Runnin' With The Devil Van Halen: 1:43:43/Seek & Destroy", ["Runnin' With The Devil Van Halen", "Seek & Destroy"]],
    // A solo or reprise inside a medley is left out.
    ["Song For Jim/Drum Solo/Reprise", ["Song For Jim"]],
    ["Atomic Punk / Drum Solo", ["Atomic Punk"]],
    ["Red Lenses / Drum Solo - Neil Peart RIP", ["Red Lenses"]],
    // One song with a slash in its name stays one song.
    ["Weird Fishes/Arpeggi", ["Weird Fishes/Arpeggi"]],
    ["Refuse/Resist", ["Refuse/Resist"]],
    ["Left/Right", ["Left/Right"]],
    ["30/30-150", ["30/30-150"]],
  ];
  it.each(cases)("%s", (line, songs) => {
    expect(songParts(line)).toEqual(songs);
  });
  it("splits only outside brackets", () => {
    expect(splitMedley("Intro (Hello/Imaginary)")).toEqual(["Intro (Hello/Imaginary)"]);
  });
});

describe("song addresses for one band", () => {
  it("files a subtitled spelling with the plain one; the most common spelling gives the address", () => {
    const map = canonicalSlugs(["Street Spirit (Fade Out)", "Street Spirit", "Creep (Live)"]);
    expect(map.get("street-spirit-fade-out")).toBe("street-spirit"); // a tie: the shorter address
    expect(map.get("street-spirit")).toBe("street-spirit");
    expect(map.get("creep")).toBe("creep");
    const more = canonicalSlugs(["Street Spirit (Fade Out)", "Street Spirit (Fade Out)", "Street Spirit"]);
    expect(more.get("street-spirit")).toBe("street-spirit-fade-out");
    // Without the plain spelling, the full name is the address.
    expect(canonicalSlugs(["Street Spirit (Fade Out)"]).get("street-spirit-fade-out")).toBe("street-spirit-fade-out");
    // "I Am Hell (Sonata in C#)" and "I am hell" are one song.
    expect(canonicalSlugs(["I Am Hell (Sonata in C#)", "I Am Hell (Sonata in C#)", "I am hell"]).get("i-am-hell")).toBe("i-am-hell-sonata-in-c");
  });
  it("files near-duplicates together: spaces, hyphens and a leading 'The'", () => {
    const map = canonicalSlugs(["Bloodbuzz Ohio", "Bloodbuzz Ohio", "Blood Buzz Ohio", "Anybody", "Any Body", "Any Body", "The Four Horsemen", "Four Horsemen", "The Four Horsemen"]);
    expect(map.get("blood-buzz-ohio")).toBe("bloodbuzz-ohio");
    expect(map.get("anybody")).toBe("any-body");
    expect(map.get("four-horsemen")).toBe("the-four-horsemen");
    // Different songs stay apart.
    expect(canonicalSlugs(["The Unforgiven", "The Unforgiven II"]).get("the-unforgiven-ii")).toBe("the-unforgiven-ii");
  });
  it("links setlist lines to their song page", () => {
    const link = songLinker("radiohead", [["Street Spirit", "Creep"], ["Street Spirit (Fade Out)", "Airbag"]]);
    expect(link("Street Spirit (Fade Out)")).toBe("/songs/radiohead/street-spirit");
    expect(link("Creep (Live)")).toBe("/songs/radiohead/creep");
    expect(link("Airbag")).toBe("/songs/radiohead/airbag"); // a song in one setlist still has a page
    expect(link("???")).toBeNull();
    expect(link("Drum Solo")).toBeNull(); // not a song
    expect(link("Creep / Airbag")).toBeNull(); // a medley line links nowhere (its songs do on their pages)
  });
  it("links only songs with two versions or more when asked (the concert page)", () => {
    const link = songLinker("radiohead", [["Street Spirit", "Creep"], ["Street Spirit (Fade Out)", "Airbag"]], 2);
    expect(link("Street Spirit")).toBe("/songs/radiohead/street-spirit");
    expect(link("Creep")).toBeNull();
    expect(link("Airbag")).toBeNull();
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
    expect(songs.find((s) => s.slug === "street-spirit")!.title).toBe("Street Spirit"); // a tie: the spelling at the address
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
  it("leaves out lines that are not songs and counts each song of a medley", () => {
    const show = concert({
      performedYear: 1991,
      tracks: [
        track(0, "Lars Intro"),
        track(60, "Enter Sandman"),
        track(400, "Kirk Solo I"),
        track(600, "Metallica Medley - Welcome Home (Sanitarium)/One"),
        track(1200, "SAD BUT TRUUUEEEEAAAAHHH"),
        track(1500, "Sad But True"),
        track(1800, "THANK YOU"),
      ],
    });
    const list = bandSongs({ names: ["Metallica"] }, [show]);
    expect(list.map((s) => s.slug).sort()).toEqual(["enter-sandman", "one", "sad-but-true", "welcome-home-sanitarium"]);
    const one = list.find((s) => s.slug === "one")!.versions[0];
    expect([one.position, one.of]).toEqual([3, 4]);
    expect(one.time).toBe(600); // a medley's songs start where the medley does
    expect(one.lengthSeconds).toBeNull(); // and have no length of their own
    expect(list.find((s) => s.slug === "enter-sandman")!.versions[0].slot).toBe("opener"); // not "Lars Intro"
    expect(list.find((s) => s.slug === "sad-but-true")!.versions[0].slot).toBe("closer"); // not "THANK YOU"
    expect(setlistSongs(show.tracks).map((x) => x.title)).toEqual(["Enter Sandman", "Welcome Home (Sanitarium)", "One", "Sad But True"]);
    expect(songCount([...show.tracks, track(2000, "ID")])).toBe(5); // an unidentified song is still a song
    expect(setlistCount([concert({ tracks: [track(0, "Drum Solo")] })])).toBe(0);
  });
});
