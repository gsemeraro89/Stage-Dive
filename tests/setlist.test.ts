// Setlist rules: reading descriptions and comments, the checks, and which source wins.
import { describe, expect, it } from "vitest";
import { fromComments, fromDescription } from "../src/lib/setlist/choose";
import { YouTubeClient } from "../src/lib/collector/youtube";
import { toTracks } from "../src/lib/setlist/extract";
import {
  cleanTitle,
  fixSwapped,
  isUnidentified,
  parseLine,
  parseSetlist,
  timeToSeconds,
  validateTracks,
} from "../src/lib/setlist/parse";

const HOUR = 3600;

describe("parseLine", () => {
  it("reads the common formats", () => {
    expect(parseLine("00:00 NTO - Alter State")).toEqual({ time: 0, artist: "NTO", title: "Alter State" });
    expect(parseLine("[03:15] Stephan Bodzin – Boavista (Original Mix)")).toEqual({
      time: 195,
      artist: "Stephan Bodzin",
      title: "Boavista (Original Mix)",
    });
    expect(parseLine("1:02:33 ID - ID")).toEqual({ time: 3753, artist: "ID", title: "ID" });
    expect(parseLine("01. Artbat - Upperground [Diynamic]")).toEqual({
      time: null,
      artist: "Artbat",
      title: "Upperground", // the label in square brackets is dropped (13 Nov 2026)
    });
    expect(parseLine("Tale Of Us - Nova (12:30)")).toEqual({ time: 750, artist: "Tale Of Us", title: "Nova" });
    expect(parseLine("3. 10:05 Adriatique — Home")).toEqual({ time: 605, artist: "Adriatique", title: "Home" });
    expect(parseLine("- 00:45 | Mind Against - Walking Away")).toEqual({
      time: 45,
      artist: "Mind Against",
      title: "Walking Away",
    });
    expect(parseLine("(0:58:10) Fred again.. - Delilah (pull me out of this)")).toEqual({
      time: 3490,
      artist: "Fred again..",
      title: "Delilah (pull me out of this)",
    });
  });

  it("keeps hyphens inside names", () => {
    expect(parseLine("00:00 Jean-Michel Jarre - Oxygène 4")).toEqual({
      time: 0,
      artist: "Jean-Michel Jarre",
      title: "Oxygène 4",
    });
  });

  it("reads a bare ID and a chapter without an artist", () => {
    expect(parseLine("45:12 ID")).toEqual({ time: 2712, artist: "ID", title: "ID" });
    expect(parseLine("00:00 Intro")).toEqual({ time: 0, artist: null, title: "Intro" });
  });

  it("ignores links, handles and plain sentences", () => {
    expect(parseLine("Instagram - https://instagram.com/nto")).toBeNull();
    expect(parseLine("Follow @cercle for more")).toBeNull();
    expect(parseLine("Recorded live at 22:00 on a rooftop")).toBeNull();
    expect(parseLine("1. Intro")).toBeNull();
    expect(parseLine("")).toBeNull();
  });
});

describe("timeToSeconds and isUnidentified", () => {
  it("converts clock times", () => {
    expect(timeToSeconds("0:00")).toBe(0);
    expect(timeToSeconds("12:30")).toBe(750);
    expect(timeToSeconds("2:03:36")).toBe(7416);
  });
  it("spots ID tracks", () => {
    expect(isUnidentified({ time: 0, artist: "ID", title: "ID" })).toBe(true);
    expect(isUnidentified({ time: 0, artist: "Artbat", title: "ID" })).toBe(true);
    expect(isUnidentified({ time: 0, artist: "Artbat", title: "Idea" })).toBe(false);
  });
});

const CERCLE_STYLE = `Artist performing live at a beautiful place for Cercle.

Setlist:
00:00 Artist - Opening
05:40 Artist - Second One
11:02 Other Artist - Third (Artist Remix)
17:30 ID - ID
24:10 Artist feat. Singer - Fifth
31:00 Artist - Sixth

Cercle is a media company...
Follow us: https://instagram.com/cercle`;

describe("parseSetlist", () => {
  it("finds a timed setlist inside a longer description", () => {
    const result = parseSetlist(CERCLE_STYLE, 1.5 * HOUR);
    expect(result.kind).toBe("setlist");
    if (result.kind !== "setlist") return;
    expect(result.timed).toBe(true);
    expect(result.tracks).toHaveLength(6);
    expect(result.tracks[3]).toEqual({ time: 1050, artist: "ID", title: "ID" });
  });

  it("reads a numbered list without times", () => {
    const text = ["1. A - One", "2. B - Two", "3. C - Three", "4. D - Four", "5. E - Five"].join("\n");
    const result = parseSetlist(text);
    expect(result).toMatchObject({ kind: "setlist", timed: false });
  });

  it("allows blank lines and a heading inside the list", () => {
    const text = "00:00 A - One\n10:00 B - Two\n\nPart 2\n20:00 C - Three\n30:00 D - Four\n40:00 E - Five";
    const result = parseSetlist(text, HOUR);
    expect(result.kind === "setlist" && result.tracks.length).toBe(5);
  });

  it("finds nothing in an ordinary description", () => {
    expect(parseSetlist("Live at Spectra 2026. Thanks to everyone who came!", HOUR)).toEqual({ kind: "none" });
  });

  it("does not take a chapter list for a setlist", () => {
    const text = "00:00 Intro\n10:00 Part one\n20:00 Part two\n30:00 Part three\n40:00 Outro";
    expect(parseSetlist(text, HOUR).kind).toBe("unclear");
  });

  it("flags lists whose times go backwards or past the end", () => {
    const backwards = "00:00 A - 1\n20:00 B - 2\n10:00 C - 3\n30:00 D - 4\n40:00 E - 5";
    expect(parseSetlist(backwards, HOUR)).toEqual({ kind: "unclear", reason: "times go backwards" });
    const tooLong = "00:00 A - 1\n20:00 B - 2\n40:00 C - 3\n1:30:00 D - 4\n2:00:00 E - 5";
    expect(parseSetlist(tooLong, HOUR)).toEqual({ kind: "unclear", reason: "times run past the end of the concert" });
  });

  it("needs at least five tracks", () => {
    expect(parseSetlist("00:00 A - 1\n10:00 B - 2\n20:00 C - 3", HOUR).kind).toBe("none");
  });

  it("flags a text that announces a setlist it does not give in a readable way", () => {
    const text = "Setlist:\n00:00 A - 1\n10:00 B - 2\nmore soon";
    expect(parseSetlist(text, HOUR).kind).toBe("unclear");
  });
});

describe("validateTracks", () => {
  it("rejects a mix of timed and untimed tracks", () => {
    const tracks = [0, 60, null, 180, 240].map((time, i) => ({ time, artist: `A${i}`, title: `T${i}` }));
    expect(validateTracks(tracks, HOUR)).toBe("some tracks have a time and some do not");
  });
});

const list = (prefix: string, n = 6) =>
  Array.from({ length: n }, (_, i) => `${String(i * 5).padStart(2, "0")}:00 ${prefix}${i} - Track ${i}`).join("\n");

describe("choosing a source", () => {
  it("uses the description when it has a setlist", () => {
    expect(fromDescription(CERCLE_STYLE, HOUR).chosen?.source).toBe("DESCRIPTION");
  });

  it("prefers the channel's own comment, then likes, then completeness", () => {
    const comments = [
      { text: list("Fan", 10), likeCount: 900, byChannel: false },
      { text: list("Chan", 6), likeCount: 3, byChannel: true },
    ];
    expect(fromComments(comments, HOUR).chosen?.source).toBe("CHANNEL_COMMENT");

    const fans = [
      { text: list("Few", 6), likeCount: 50, byChannel: false },
      { text: list("Liked", 6), likeCount: 400, byChannel: false },
      { text: list("Long", 9), likeCount: 400, byChannel: false },
    ];
    const chosen = fromComments(fans, HOUR).chosen!;
    expect(chosen.source).toBe("COMMENT");
    expect(chosen.tracks[0].artist).toBe("Long0");
  });

  it("returns nothing, and lists the unclear texts, when no comment is a setlist", () => {
    const comments = [
      { text: "What a concert!!", likeCount: 1000, byChannel: false },
      { text: "00:00 Intro\n10:00 a\n20:00 b\n30:00 c\n40:00 d", likeCount: 5, byChannel: false },
    ];
    const choice = fromComments(comments, HOUR);
    expect(choice.chosen).toBeNull();
    expect(choice.unclear).toHaveLength(1);
  });
});

describe("Claude's answers", () => {
  it("are turned into tracks, dropping times that are not clock times", () => {
    expect(
      toTracks([
        { time: "1:02:33", artist: "A", title: "One" },
        { time: "", artist: "", title: "Two" },
        { time: "around 5 min", artist: "B", title: "Three" },
        { time: "0:00", artist: "C", title: " " },
      ]),
    ).toEqual([
      { time: 3753, artist: "A", title: "One" },
      { time: null, artist: null, title: "Two" },
      { time: null, artist: "B", title: "Three" },
    ]);
  });
});

describe("reading comments from YouTube", () => {
  const reply = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("returns text, likes and author, and costs one unit", async () => {
    const yt = new YouTubeClient(
      "key",
      10,
      reply(200, {
        items: [
          {
            snippet: {
              topLevelComment: {
                snippet: { textOriginal: "00:00 A - B", likeCount: 12, authorChannelId: { value: "UCchan" } },
              },
            },
          },
        ],
      }),
    );
    expect(await yt.topComments("vid")).toEqual([{ text: "00:00 A - B", likeCount: 12, authorChannelId: "UCchan" }]);
    expect(yt.unitsUsed).toBe(1);
  });

  it("treats switched-off comments as no comments", async () => {
    const yt = new YouTubeClient("key", 10, reply(403, { error: { errors: [{ reason: "commentsDisabled" }] } }));
    expect(await yt.topComments("vid")).toEqual([]);
  });
});

describe("cases found in the first measurement (13 Nov 2026)", () => {
  it("drops a second time at the end of the line", () => {
    expect(parseLine("1:22 Fantasia - Klaus Doldinger 0:12")).toEqual({
      time: 82,
      artist: "Fantasia",
      title: "Klaus Doldinger",
    });
  });

  it("does not read 'unreleased' as a title with the track name as artist", () => {
    expect(parseLine("3. Space Diver - unreleased")).toBeNull(); // numbered lines need an artist
    expect(parseLine("12:00 Space Diver - unreleased")).toEqual({
      time: 720,
      artist: null,
      title: "Space Diver (unreleased)",
    });
  });
});

describe("lookUpSetlist", async () => {
  const { lookUpSetlist, setlistFields } = await import("../src/lib/setlist/lookup");
  const { QuotaBudgetExceeded } = await import("../src/lib/collector/youtube");
  const { Prisma } = await import("../src/generated/prisma/client");

  const video = (description: string) =>
    ({
      youtubeId: "VIDEO000001",
      title: "Concert",
      description,
      tags: [],
      channelId: "UCchannel",
      channelTitle: "Channel",
      publishedAt: new Date("2024-01-01"),
      liveBroadcastContent: "none",
      durationSeconds: HOUR,
      viewCount: 1,
      embeddable: true,
      privacyStatus: "public",
      madeForKids: false,
      uploadStatus: "processed",
    }) as never;
  const fakeYt = (comments: { text: string; likeCount: number; authorChannelId: string }[] | Error) => {
    const yt = {
      calls: 0,
      async topComments() {
        yt.calls++;
        if (comments instanceof Error) throw comments;
        return comments;
      },
    };
    return yt;
  };

  it("uses the description and does not spend quota on comments", async () => {
    const yt = fakeYt([]);
    const found = await lookUpSetlist(yt as never, video(CERCLE_STYLE));
    expect(found.source).toBe("DESCRIPTION");
    expect(yt.calls).toBe(0);
  });

  it("falls back to comments, and knows the channel's own comment", async () => {
    const yt = fakeYt([{ text: list("Chan", 6), likeCount: 0, authorChannelId: "UCchannel" }]);
    const found = await lookUpSetlist(yt as never, video("Live somewhere."));
    expect(found).toMatchObject({ source: "CHANNEL_COMMENT", commentsOff: false });
    expect(found.tracks).toHaveLength(6);
  });

  it("reports nothing when there is no setlist anywhere", async () => {
    const found = await lookUpSetlist(fakeYt([]) as never, video("Live somewhere."));
    expect(found).toEqual({ tracks: null, source: null, commentsOff: true, unclear: false });
  });

  it("passes a quota stop on, so the caller keeps what it had", async () => {
    await expect(lookUpSetlist(fakeYt(new QuotaBudgetExceeded("out")) as never, video("x"))).rejects.toBeInstanceOf(
      QuotaBudgetExceeded,
    );
  });

  it("treats other comment errors as no comments", async () => {
    const found = await lookUpSetlist(fakeYt(new Error("YouTube commentThreads failed: 500")) as never, video("x"));
    expect(found.tracks).toBeNull();
  });

  it("asks Claude only about unclear texts, within its limit", async () => {
    const extractor = {
      calls: 0,
      async extract() {
        extractor.calls++;
        return [{ time: 0, artist: "A", title: "B" }];
      },
    };
    const chapters = "00:00 Intro\n10:00 Part one\n20:00 Part two\n30:00 Part three\n40:00 Outro";
    const found = await lookUpSetlist(fakeYt([]) as never, video(chapters), { extractor: extractor as never });
    expect(found.source).toBe("CLAUDE");
    await lookUpSetlist(fakeYt([]) as never, video(chapters), { extractor: extractor as never, claudeMax: 1 });
    expect(extractor.calls).toBe(1);
    await lookUpSetlist(fakeYt([]) as never, video("Live somewhere."), { extractor: extractor as never });
    expect(extractor.calls).toBe(1);
  });

  it("clears an old setlist when none is found", () => {
    const now = new Date();
    expect(setlistFields({ tracks: null, source: null, commentsOff: false, unclear: false }, now)).toEqual({
      setlist: Prisma.DbNull,
      setlistSource: null,
      setlistCheckedAt: now,
    });
  });
});

describe("setlist on the concert page", async () => {
  const { readSetlist, linkArtists, artistSlugsIn, sourceNote } = await import("../src/lib/setlist/view");

  it("reads stored tracks and skips anything malformed", () => {
    const view = readSetlist(
      [{ time: 0, artist: "NTO", title: "Alter State" }, { time: 60, artist: "ID", title: "ID" }, { nope: 1 }, "x", { time: -5, artist: "", title: "Outro" }],
      "DESCRIPTION",
    );
    expect(view!.tracks).toEqual([
      { time: 0, artist: "NTO", title: "Alter State", unidentified: false, artistSlug: null },
      { time: 60, artist: "ID", title: "ID", unidentified: true, artistSlug: null },
      { time: null, artist: null, title: "Outro", unidentified: false, artistSlug: null },
    ]);
    expect(readSetlist(null, null)).toBeNull();
    expect(readSetlist([], "COMMENT")).toBeNull();
  });

  it("links only artists we have a page for, never ID", () => {
    const view = readSetlist([{ time: 0, artist: "NTO", title: "A" }, { time: 1, artist: "Nobody Known", title: "B" }, { time: 2, artist: "ID", title: "ID" }], null);
    expect(artistSlugsIn(view)).toEqual(["nto", "nobody-known"]);
    expect(linkArtists(view, new Set(["nto"]))!.tracks.map((t) => t.artistSlug)).toEqual(["nto", null, null]);
  });

  it("says where the setlist came from", () => {
    expect(sourceNote("COMMENT")).toMatch(/viewer/);
    expect(sourceNote("DESCRIPTION")).toMatch(/description/);
  });
});

describe("fixes from the store check (13 Nov 2026)", () => {
  it("turns round lists written 'Title - Artist'", () => {
    const text = [
      "00:00 Petit Matin - NTO",
      "06:10 Cirrus - NTO",
      "12:30 Fior Di Macchia - NTO",
      "18:00 Worakls - Red Dressed",
      "24:00 NTO - The Hound",
    ].join("\n");
    const result = parseSetlist(text, HOUR);
    expect(result.kind === "setlist" && result.tracks.map((t) => `${t.artist} – ${t.title}`)).toEqual([
      "NTO – Petit Matin",
      "NTO – Cirrus",
      "NTO – Fior Di Macchia",
      "Worakls – Red Dressed",
      "NTO – The Hound",
    ]);
  });

  it("leaves ordinary lists alone, even when the concert's artist plays many of their own tracks", () => {
    const tracks = [0, 1, 2, 3, 4].map((i) => ({ time: i * 60, artist: "The Blaze", title: `Song ${i}` }));
    expect(fixSwapped(tracks)).toEqual(tracks);
  });

  it("drops a second time at the start of a line", () => {
    expect(parseLine("58:10 1:04:27 Stereo Express - Transcendance")).toEqual({
      time: 3490,
      artist: "Stereo Express",
      title: "Transcendance",
    });
    expect(parseLine("1:00:00 00:11:43 – Petit Matin - NTO")).toMatchObject({ time: 3600, artist: "Petit Matin", title: "NTO" });
  });

  it("removes notes glued to titles, but keeps versions and titles in capitals", () => {
    expect(cleanTitle("Overdrive (Intro Mix) KNTXT")).toBe("Overdrive (Intro Mix)");
    expect(cleanTitle("Seda AFTR:HRS")).toBe("Seda");
    expect(cleanTitle("Kali UNREALESED")).toBe("Kali");
    expect(cleanTitle("Kompass 2022 ID")).toBe("Kompass 2022");
    expect(cleanTitle("Thandaza [OGUM] (Out Now) {Played by Adam}")).toBe("Thandaza");
    expect(cleanTitle("Ten (DnB Freddit) [ATLANTIC (WARNER MUSIC)]")).toBe("Ten (DnB Freddit)");
    expect(cleanTitle("Always [Tinlicker Remix]")).toBe("Always [Tinlicker Remix]");
    expect(cleanTitle("NO8DO")).toBe("NO8DO");
    expect(cleanTitle("Delilah (pull me out of this)")).toBe("Delilah (pull me out of this)");
  });

  it("decodes HTML entities", () => {
    expect(parseLine("00:00 Zelda &amp; ZHU - Good Life")).toMatchObject({ artist: "Zelda & ZHU", title: "Good Life" });
  });
});
