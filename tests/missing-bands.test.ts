// Bands people search for that are not on the site (src/lib/missing-bands.ts, owner 21 Nov 2026): the name in a
// phrase, merging spellings, ranking, the log block, the genre family filter and the admin_ops options.
import { describe, expect, it } from "vitest";
import { GAPS, type KeywordRow } from "../src/lib/keywords";
import { bandKey, bandNameFromPhrase, genreFamily, leadsPhrase, missingBands, missingBandsArgs, missingBandsTail, notABandReason, wordsOfOurBands } from "../src/lib/missing-bands";

const row = (phrase: string, score: number, gap: string | null = GAPS.bandMissing): KeywordRow => ({
  phrase,
  score,
  seeds: 1,
  engines: ["google"],
  rank: 0,
  intent: "watch",
  pageType: "none",
  page: null,
  gap: gap as KeywordRow["gap"],
  found: [],
  seedKind: "head",
});

describe("the band's name in a phrase", () => {
  it.each([
    ["pink floyd live at pompeii full concert", "pink floyd"],
    ["youtube pink floyd live", "pink floyd"],
    ["the dead weather live", "the dead weather"],
    ["queens of the stone age live 2023", "queens of the stone age"],
    ["florence and the machine full concert", "florence and the machine"],
    ["rage against the machine live 1997", "rage against the machine"],
    ["show do bad religion", "bad religion"],
    ["led zeppelin concierto completo", "led zeppelin"],
    ["pearl jam live in italy", "pearl jam"],
    ["watch nirvana unplugged", "nirvana"],
    ["linkin park setlist 2024", "linkin park"],
  ])("%s -> %s", (phrase, name) => expect(bandNameFromPhrase(phrase)).toBe(name));

  it.each(["best rock concerts of the 80s", "wacken open air 2019 full show", "full concert hd 1080p", "grammy awards 2020 performance"])("no band in %s", (phrase) => {
    expect(bandNameFromPhrase(phrase)).toBeNull();
  });

  it("one key for the spellings of a name", () => {
    expect(bandKey("AC/DC")).toBe(bandKey("ac dc"));
    expect(bandKey("acdc")).toBe(bandKey("AC DC"));
    expect(bandKey("The Cure")).toBe(bandKey("cure"));
  });
});

describe("missingBands", () => {
  const rows = [
    row("pink floyd live at pompeii", 30),
    row("pink floyd full concert", 20),
    row("pink floyd pulse", 10),
    row("ac/dc live river plate", 12),
    row("acdc live 1991", 8),
    row("the cure live 1989", 15),
    row("the cure full concert", 5),
    row("best concerts of the 80s", 50),
    row("radiohead live", 99, null),
    row("radiohead full concert", 40, GAPS.concertMissing),
    row("muse live 2004", 25),
  ];
  const list = missingBands(rows, { skip: new Set([bandKey("Muse")]) });

  it("scores by total keyword score, merges spellings and longer names, ranks", () => {
    expect(list.map((b) => [b.name, b.score, b.phrases, b.rank])).toEqual([
      ["Pink Floyd", 60, 3, 1],
      ["Ac Dc", 20, 2, 2],
      ["The Cure", 20, 2, 3],
    ]);
    expect(list[0].examples[0]).toBe("pink floyd live at pompeii");
  });

  it("only phrases of the gap 'band or event: not on the site', minus bands we list", () => {
    expect(list.some((b) => b.name === "Radiohead" || b.name === "Muse")).toBe(false);
  });

  it("keeps the top N and prints a parseable block for the end of the log", () => {
    expect(missingBands(rows, { top: 1 })).toHaveLength(1);
    const tail = missingBandsTail(list);
    expect(tail[0]).toMatch(/^==== MISSING BANDS: TOP 3/);
    expect(tail[1]).toBe("MISSING_BAND\t60\t3\tPink Floyd");
    expect(tail[1].split("\t")).toHaveLength(4);
  });
});

describe("genre families (MusicBrainz genres, most used first)", () => {
  it("keeps rock and the new families", () => {
    expect(genreFamily(["alternative rock", "pop rock", "pop", "britpop"])).toEqual({ family: "OURS", ours: ["alternative", "classic rock", "indie"] });
    expect(genreFamily(["trip hop", "electronic", "downtempo"]).family).toBe("OURS");
    expect(genreFamily(["big beat", "electronic", "breakbeat"]).ours).toEqual(["electronic rock / big beat"]);
    expect(genreFamily(["art pop", "experimental", "electronic"]).ours).toEqual(["art pop / experimental"]);
    expect(genreFamily(["synth-pop", "new wave", "pop"]).ours).toEqual(["new wave / synth"]);
    expect(genreFamily(["heavy metal", "thrash metal"]).ours).toEqual(["metal"]);
  });

  it("drops pop, hip hop, country, jazz and the like", () => {
    expect(genreFamily(["pop", "country", "singer-songwriter", "pop rock"]).family).toBe("OTHER");
    expect(genreFamily(["hip hop", "rap", "trap"]).family).toBe("OTHER");
    expect(genreFamily(["jazz", "jazz fusion", "jazz rock"]).family).toBe("OTHER");
    expect(genreFamily(["country", "americana", "country rock", "folk"]).family).toBe("OTHER");
    expect(genreFamily(["house", "techno", "electronic"]).family).toBe("OTHER");
  });

  it("no genres we can read: not kept", () => {
    expect(genreFamily([]).family).toBe("NO_GENRES");
    expect(genreFamily(["british", "male vocalists", "1990s"]).family).toBe("NO_GENRES");
  });
});

describe("admin_ops options", () => {
  it("reads top and names", () => {
    expect(missingBandsArgs("missing-bands-check")).toEqual({ top: 40, names: [], noBatch: false });
    expect(missingBandsArgs("missing-bands-check:top=80")).toEqual({ top: 80, names: [], noBatch: false });
    expect(missingBandsArgs("missing-bands-publish:25")).toEqual({ top: 25, names: [], noBatch: false });
    expect(missingBandsArgs("missing-bands-publish:names=Idles|Fontaines D.C.,no-batch")).toEqual({ top: 40, names: ["Idles", "Fontaines D.C."], noBatch: true });
    expect(missingBandsArgs("missing-bands-check:top=900").top).toBe(300);
    expect(() => missingBandsArgs("missing-bands-check:foo=1")).toThrow();
  });
});

// The 22 Nov 2026 check (admin_ops missing-bands-check:top=40) listed mostly everyday words and chopped names.
describe("missing bands: the 22 Nov 2026 list", () => {
  const OUR_NAMES = ["In Flames", "Fall Out Boy", "Thirty Seconds to Mars", "Red Hot Chili Peppers", "Black Sabbath", "Pink Floyd", "Kings of Leon", "Dead Kennedys", "The Hives", "Queen", "Metallica", "Bruce Springsteen"];
  const ourWords = wordsOfOurBands(OUR_NAMES);

  it.each([
    ["in flames live", "in flames"],
    ["a perfect circle live", "a perfect circle"],
    ["30 seconds to mars live", "30 seconds to mars"],
    ["system of a down live", "system of a down"],
    ["death cab for cutie full concert", "death cab for cutie"],
    ["heart live full concert", "heart"],
    ["full concerts by mudvayne", "mudvayne"],
    ["metallica live at download festival", "metallica"],
    ["2024 metallica live", "metallica"],
  ])("keeps the whole name: %s -> %s", (phrase, name) => expect(bandNameFromPhrase(phrase)).toBe(name));

  it.each([
    "full shower enclosures with base",
    "full shower kits",
    "full concert experience",
    "hard rock upcoming concerts",
    "hard rock live upcoming events",
    "live concert events",
    "full length videos of concerts",
    "jazz festival leverkusen 2026",
    "freaks in a field festival 2026",
    "hell fest where to watch",
    "full show miss venezuela 1985",
    "full show miss grand international 2026",
    "best live performances ever",
    "live aid full concert",
    "concert outfit ideas",
    "best live performance microphone",
    "best kept secrets podcast",
    "full show of judge judy",
    "live concert meaning",
  ])("no band in %s", (phrase) => expect(bandNameFromPhrase(phrase)).toBeNull());

  it("a one-word name must lead the phrase", () => {
    expect(leadsPhrase("heart live full concert", "heart")).toBe(true);
    expect(leadsPhrase("youtube heart live", "heart")).toBe(true);
    expect(leadsPhrase("full concerts by mudvayne", "mudvayne")).toBe(true);
    expect(leadsPhrase("the fall live 1983", "the fall")).toBe(true);
    expect(leadsPhrase("best live performances of all time ever", "ever")).toBe(false);
    expect(leadsPhrase("garden rock concert series", "garden")).toBe(true);
    expect(leadsPhrase("full concert recordings", "recordings")).toBe(false);
  });

  it.each([
    ["Convert", "everyday word"],
    ["Garden", "everyday word"],
    ["Summer", "everyday word"],
    ["One", "everyday word"],
    ["This", "everyday word"],
    ["My", "everyday word"],
    ["Upcoming", "everyday word"],
    ["Events", "everyday word"],
    ["Length", "everyday word"],
    ["Lost", "everyday word"],
    ["Baby", "everyday word"],
    ["Jazz", "everyday word"],
    ["Experience", "everyday word"],
    ["Brothers", "everyday word"],
    ["Freaks", "everyday word"],
    ["London", "everyday word"],
    ["France", "everyday word"],
    ["Aid", "everyday word"],
    ["Shower", "everyday word"],
    ["Love", "everyday word"],
    ["Ever", "everyday word"],
    ["Outfit", "everyday word"],
    ["The Beach", "everyday word"],
    ["Flames", "part of one of our bands' names"],
    ["Fall", "everyday word"],
    ["Seconds", "everyday word"],
    ["The Hive", "part of one of our bands' names"],
    ["King", "everyday word"],
    ["Black", "everyday word"],
    ["Red", "everyday word"],
    ["Miss Venezuela", "pageant"],
  ])("%s is not a band (%s)", (name, reason) => expect(notABandReason(name, ourWords)).toBe(reason));

  it.each(["Heart", "Eagles", "Kansas", "Europe", "Mudvayne", "Harmony", "Kaizer Chiefs", "The Fall", "The Dead", "Boston", "America", "Yes", "Death"])("%s may be a band", (name) => {
    expect(notABandReason(name, ourWords)).toBeNull();
  });

  it("drops words of our bands' names even when not everyday words", () => {
    expect(notABandReason("Peppers", ourWords)).toBe("part of one of our bands' names");
    expect(notABandReason("Sabbath", ourWords)).toBe("part of one of our bands' names");
    expect(notABandReason("Hive", ourWords)).toBe("part of one of our bands' names");
  });

  it("ranks only names seen as a band in two phrases or more, no everyday word to fold into", () => {
    const rows = [
      row("heart live full concert", 145.5),
      row("heart live full concert video", 126),
      row("best live performances ever", 120),
      row("best live performances fun of all time", 100),
      row("full concert experience", 127.5),
      row("full concerts on prime", 127.5),
      row("full concerts by mudvayne", 115.5),
      row("mudvayne live 2001", 20),
      row("full concert bruce springsteen hyde park", 112.5),
      row("bruce springsteen hyde park 2013 full concert", 50),
      row("full shower enclosures with base", 80),
      row("garden rock concert series", 60),
      row("garden rocks concert series 2026 times", 50),
      row("in flames live", 40),
      row("in flames full concert 2019", 30),
      row("black pumas live", 30),
      row("black pumas full concert", 20),
      row("black live", 5),
      row("black full concert", 5),
      row("eagles live", 50),
      row("eagles hell freezes over full concert", 40),
      row("full show miss venezuela 1985", 30),
      row("miss venezuela 2026 full show", 30),
      row("kansas live 1978", 10),
    ];
    const list = missingBands(rows, { ourNames: OUR_NAMES, skip: new Set(OUR_NAMES.map(bandKey)) });
    expect(list.map((b) => [b.name, b.phrases])).toEqual([
      ["Heart", 2],
      ["Mudvayne", 2],
      ["Eagles", 2],
      ["Black Pumas", 2],
    ]);
  });
});
