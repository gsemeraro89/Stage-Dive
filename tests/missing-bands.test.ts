// Bands people search for that are not on the site (src/lib/missing-bands.ts, owner 21 Nov 2026): the name in a
// phrase, merging spellings, ranking, the log block, the genre family filter and the admin_ops options.
import { describe, expect, it } from "vitest";
import { GAPS, type KeywordRow } from "../src/lib/keywords";
import { bandKey, bandNameFromPhrase, genreFamily, missingBands, missingBandsArgs, missingBandsTail } from "../src/lib/missing-bands";

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
      ["The Cure", 15, 1, 3],
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
