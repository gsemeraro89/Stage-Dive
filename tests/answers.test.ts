// Answers for answer engines: leads and questions built only from data we hold.
import { describe, expect, it } from "vitest";
import { bandAnswers, concertAnswers, decadeLead, genreLead, tourLead, venueAnswers } from "../src/lib/answers";
import { listWords, ordinal, songCounts, songKey, spokenDuration, spokenTotal, whenWords } from "../src/lib/text";
import { BANNED, concertView, setlist, youtubeOnlyWithViews } from "./fixtures/concert-view";

const allText = (a: { lead: string; questions: { question: string; answer: string }[] }) =>
  [a.lead, ...a.questions.flatMap((q) => [q.question, q.answer])].join(" ");

describe("words", () => {
  it("speaks durations, lists, dates and ranks", () => {
    expect(spokenDuration(8520)).toBe("2 hours 22 minutes");
    expect(spokenDuration(3600)).toBe("1 hour");
    expect(spokenTotal(3000)).toBe("50 minutes");
    expect(spokenTotal(7 * 3600)).toBe("7 hours");
    expect(listWords(["a", "b", "c"])).toBe("a, b and c");
    expect(whenWords({ performedOn: new Date("1991-11-01T00:00:00Z"), performedYear: 1991 })).toBe("on 1 November 1991");
    expect(whenWords({ performedOn: null, performedYear: 1991 })).toBe("in 1991");
    expect(whenWords({ performedOn: null, performedYear: null })).toBeNull();
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
  it("counts songs across setlists, once per setlist, whatever the spelling", () => {
    expect(songKey("One (Live)")).toBe(songKey("one"));
    expect(songKey("Seek & Destroy")).toBe(songKey("Seek and Destroy"));
    expect(
      songCounts([
        ["One", "Battery", "one (live)"],
        ["Battery", "One"],
        ["Fade to Black", "Battery"],
      ]),
    ).toEqual([
      { title: "Battery", count: 3 },
      { title: "One", count: 2 },
    ]);
  });
});

describe("concert answers", () => {
  it("leads with who, where, when, the tour, how long, the genre and the setlist", () => {
    const a = concertAnswers(concertView(), setlist);
    expect(a.lead).toBe(
      "Metallica live at L.C. Walker Arena, Muskegon, US on 1 November 1991, on the Wherever We May Roam Tour: " +
        "the full concert, 2 hours 22 minutes of metal, with a 5-song setlist that opens with “Enter Sandman”. Official concert from Metallica.",
    );
  });
  it("says nothing about facts it does not hold", () => {
    const bare = concertView({ venue: null, city: null, country: null, performedOn: null, performedYear: null, tour: null, genres: [], venueKind: null, channel: { name: "Fan", isOfficial: false } });
    const a = concertAnswers(bare, null);
    expect(a.lead).toBe("Metallica live: the full concert, 2 hours 22 minutes.");
    expect(a.questions.map((q) => q.question)).toEqual(["How long is the concert?", "Where can I watch Metallica's full concert?"]);
  });
  it("asks about the setlist, the tour and the genre when known", () => {
    const qs = concertAnswers(concertView(), setlist).questions;
    expect(qs.map((q) => q.question)).toContain("What songs did Metallica play?");
    expect(qs.find((q) => q.question === "What songs did Metallica play?")!.answer).toBe(
      "5 songs, opening with “Enter Sandman”, “Creeping Death” and “Last Caress” and closing with “Seek & Destroy”. The full setlist, with the time each song starts, is on the concert page.",
    );
    expect(qs.find((q) => q.question === "Which tour was it part of?")!.answer).toBe("Wherever We May Roam Tour.");
  });
  it("follows the copy rules", () => {
    const text = allText(concertAnswers(concertView(), setlist));
    expect(text).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(text)).toBe(true);
  });
});

const concerts = [
  concertView(),
  concertView({ id: 2, slug: "metallica-pinkpop-1993", venue: { slug: "pinkpop", name: "Pinkpop" }, city: "Landgraaf", country: "NL", venueKind: { slug: "festival", name: "Festival" }, performedYear: 1993, performedOn: null, viewCount: 5_000_000, tour: null, hasSetlist: false }),
  concertView({ id: 3, slug: "metallica-pinkpop-2008", venue: { slug: "pinkpop", name: "Pinkpop" }, city: "Landgraaf", country: "NL", venueKind: { slug: "festival", name: "Festival" }, performedYear: 2008, performedOn: null, viewCount: 900_000, tour: null }),
];

describe("band answers", () => {
  it("leads with how many concerts, from where, how much music, when and where", () => {
    const a = bandAnswers({ name: "Metallica", origin: "Los Angeles, US" }, concerts, [["One", "Battery"], ["One", "Sad but True"]]);
    expect(a.lead).toBe(
      "STAGEDIVE has 3 full concerts by Metallica, from Los Angeles, US: 7 hours of metal, played between 1991 and 2008, at places such as Pinkpop and L.C. Walker Arena. Every concert plays in full on its own page, 2 with its setlist.",
    );
    const q = Object.fromEntries(a.questions.map((x) => [x.question, x.answer]));
    expect(q["Which festivals has Metallica played?"]).toBe("Full festival shows here: Pinkpop 1993 and Pinkpop 2008.");
    expect(q["What is Metallica's most watched concert?"]).toBe("Pinkpop 1993, with 5,000,000 views on YouTube.");
    expect(q["What is the oldest Metallica concert here?"]).toBe("L.C. Walker Arena 1991. The newest is Pinkpop 2008.");
    expect(q["Which songs does Metallica play most live?"]).toBe("Across the 2 setlists here: “One” (2 setlists).");
    expect(q["Where are Metallica from?"]).toBe("Los Angeles, US.");
    expect(allText(a)).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(allText(a))).toBe(true);
  });
  it("leaves out questions without data", () => {
    const a = bandAnswers({ name: "Solo", origin: null }, [concertView({ tour: null, venueKind: null, performedYear: null, performedOn: null })]);
    expect(a.questions.map((q) => q.question)).toEqual(["Where can I watch Solo full concerts?"]);
  });
});

describe("venue, genre, decade and tour leads", () => {
  it("writes the venue lead and questions", () => {
    const pinkpop = concerts.slice(1);
    const a = venueAnswers({ name: "Pinkpop", city: "Landgraaf", country: "NL" }, pinkpop);
    expect(a.lead).toBe("2 full concerts from Pinkpop (Landgraaf, NL), played between 1993 and 2008, with Metallica. Every concert plays in full on its own page.");
    expect(a.questions.map((q) => q.question)).toEqual([
      "Which bands played Pinkpop?",
      "Which years are covered?",
      "What is the most watched concert from Pinkpop?",
      "Where is Pinkpop?",
      "How many full concerts from Pinkpop are there?",
    ]);
    expect(allText(a)).not.toMatch(BANNED);
  });
  it("writes genre, decade and tour leads", () => {
    expect(genreLead("metal", concerts)).toBe("3 full metal concerts, 7 hours of music, from Metallica, played between 1991 and 2008. Every concert plays in full on its own page.");
    expect(decadeLead("1990s", concerts.slice(0, 2))).toBe("2 full rock concerts played in the 1990s, from Metallica, mostly metal. Every concert plays in full on its own page.");
    expect(tourLead("Wherever We May Roam Tour", "Metallica", [concerts[0]])).toBe(
      "1 full concert from Metallica's Wherever We May Roam Tour, played in 1991, at L.C. Walker Arena. Every concert plays in full on its own page, in the order of the tour.",
    );
    expect(tourLead("Black Album", null, [])).toBe("No concert from the Black Album tour is on STAGEDIVE right now.");
  });
});
