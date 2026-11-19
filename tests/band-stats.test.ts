// Band statistics from setlists and concerts (src/lib/band-stats.ts) and the questions and figures
// built from them (src/lib/answers.ts): nothing is stated without two concerts or setlists behind it.
import { describe, expect, it } from "vitest";
import { bandStatLines, bandStatQuestions } from "../src/lib/answers";
import { bandStats, usualSong } from "../src/lib/band-stats";
import { BANNED, youtubeOnlyWithViews } from "./fixtures/concert-view";

const gig = (slug: string, durationSeconds: number, performedYear: number | null, venue: string | null = null) => ({
  slug,
  title: `Radiohead ${slug}`,
  durationSeconds,
  performedYear,
  venue: venue ? { name: venue } : null,
  city: null,
});

describe("usual opener and closer", () => {
  it("needs two setlists and the song at least twice", () => {
    expect(usualSong(["Creep"], 1)).toBeNull();
    expect(usualSong(["Creep", "Airbag"], 2)).toBeNull();
    expect(usualSong(["Creep", "Creep (Live)"], 2)).toEqual({ title: "Creep", slug: "creep", count: 2, of: 2, majority: true });
  });
  it("needs a clear winner: no tie for the top", () => {
    expect(usualSong(["Creep", "Creep", "Airbag", "Airbag"], 4)).toBeNull();
    expect(usualSong(["Creep", "Creep", "Airbag", "Airbag", "Creep"], 5)?.title).toBe("Creep");
  });
  it("needs at least a third of the setlists; under half is 'most often'", () => {
    // 2 of 7 is under a third.
    expect(usualSong(["A", "A", "B", "C", "D", "E", "F"], 7)).toBeNull();
    // 3 of 7: a plurality, not a majority.
    expect(usualSong(["A", "A", "A", "B", "B", "C", "D"], 7)).toEqual({ title: "A", slug: "a", count: 3, of: 7, majority: false });
    // 4 of 7: a majority.
    expect(usualSong(["A", "A", "A", "A", "B", "C", "D"], 7)?.majority).toBe(true);
  });
});

describe("band statistics", () => {
  const concerts = [gig("pinkpop-1996", 3345, 1996, "Pinkpop"), gig("glastonbury-1997", 5400, 1997, "Glastonbury"), gig("bonnaroo-2006", 7600, 2006, "Bonnaroo")];
  const setlists = [
    ["There There", "2 + 2 = 5", "Karma Police", "Creep"],
    ["There There", "Airbag", "Karma Police", "Street Spirit (Fade Out)"],
    ["Lucky", "Karma Police", "Creep", "Street Spirit"],
  ];
  const stats = bandStats(concerts, setlists);

  it("gives the figures two or more concerts support", () => {
    expect(stats.averageSeconds).toBe(Math.round((3345 + 5400 + 7600) / 3));
    expect(stats.longest?.slug).toBe("bonnaroo-2006");
    expect(stats.years).toEqual({ from: 1996, to: 2006 });
    expect(stats.averageSongs).toBe(4);
    expect(stats.opener).toEqual({ title: "There There", slug: "there-there", count: 2, of: 3, majority: true });
    // "Street Spirit (Fade Out)" and "Street Spirit" are one song; on a tie the shorter address and its spelling.
    expect(stats.closer).toEqual({ title: "Street Spirit", slug: "street-spirit", count: 2, of: 3, majority: true });
    expect(stats.mostPlayed).toEqual([
      { slug: "karma-police", title: "Karma Police", count: 3 },
      { slug: "there-there", title: "There There", count: 2 },
      { slug: "creep", title: "Creep", count: 2 },
      { slug: "street-spirit", title: "Street Spirit", count: 2 },
    ]);
  });
  it("states nothing from a single concert or setlist", () => {
    const one = bandStats([concerts[0]], [setlists[0]]);
    expect(one).toMatchObject({ averageSeconds: null, longest: null, years: null, averageSongs: null, opener: null, closer: null, mostPlayed: [] });
    expect(bandStatQuestions("Radiohead", one)).toEqual([]);
    expect(bandStatLines(one)).toEqual([]);
  });
  it("gives no span for concerts all from one year", () => {
    expect(bandStats([gig("a", 4000, 1997), gig("b", 4000, 1997)], []).years).toBeNull();
  });
  it("asks and answers the questions people search for", () => {
    const q = Object.fromEntries(bandStatQuestions("Radiohead", stats).map((x) => [x.question, x.answer]));
    expect(q["How long is a Radiohead concert?"]).toBe("The 3 Radiohead concerts here run 1 hour 31 minutes on average. The longest is Bonnaroo 2006 (2:06:40).");
    expect(q["How many songs does Radiohead play in a concert?"]).toBe("4 on average, across the 3 setlists here.");
    expect(q["What song does Radiohead usually open with?"]).toBe("“There There”: it opens 2 of the 3 setlists here.");
    expect(q["What song does Radiohead usually close with?"]).toBe("“Street Spirit”: it closes 2 of the 3 setlists here.");
    expect(q["What are Radiohead's most played songs live?"]).toBe(
      "Across the 3 setlists here: “Karma Police” (3 setlists), “There There” (2 setlists), “Creep” (2 setlists) and “Street Spirit” (2 setlists).",
    );
  });
  it("says 'most often' for a plurality that is not a majority", () => {
    const lists = [["A", "x"], ["A", "y"], ["A", "z"], ["B", "w"], ["C", "v"], ["D", "u"], ["E", "t"]];
    const q = bandStatQuestions("Pixies", bandStats([gig("a", 3600, 1988), gig("b", 3600, 1989)], lists));
    expect(q.find((x) => x.question === "What song does Pixies usually open with?")?.answer).toBe("Most often “A”: it opens 3 of the 7 setlists here.");
  });
  it("lists the figures for the page", () => {
    expect(bandStatLines(stats).map((l) => [l.id, l.label, l.value])).toEqual([
      ["average-length", "Average concert", "1:30:48"],
      ["longest", "Longest concert", "Bonnaroo 2006 (2:06:40)"],
      ["average-songs", "Songs per concert", "4 on average"],
      ["opener", "Usually opens with", "There There (2 of 3)"],
      ["closer", "Usually closes with", "Street Spirit (2 of 3)"],
      ["years", "Years", "1996 to 2006"],
    ]);
  });
  it("follows the copy rules", () => {
    const text = [...bandStatQuestions("Radiohead", stats).flatMap((q) => [q.question, q.answer]), ...bandStatLines(stats).map((l) => `${l.label} ${l.value}`)].join(" ");
    expect(text).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(text)).toBe(true);
  });
  it("never counts solos, intros, jams or notes as the opener, closer or a most played song", () => {
    const lists = [
      ["Lars Intro", "Hit the Lights", "Bass Solo", "Seek & Destroy", "THANK YOU"],
      ["Kirk Intro", "Hit the Lights", "Metallijam", "Seek and Destroy", "Kirk Solo II"],
    ];
    const st = bandStats([gig("a", 4000, 1983), gig("b", 4000, 1984)], lists);
    expect(st.opener?.title).toBe("Hit the Lights");
    expect(st.closer?.slug).toBe("seek-and-destroy");
    expect(st.averageSongs).toBe(2);
    expect(st.mostPlayed.map((s) => s.slug)).toEqual(["hit-the-lights", "seek-and-destroy"]);
  });
});
