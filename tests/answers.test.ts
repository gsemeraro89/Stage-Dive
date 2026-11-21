// Answers for answer engines: leads and questions built only from data we hold.
import { describe, expect, it } from "vitest";
import { bandAnswers, bandSpanQuestions, concertAnswers, decadeLead, genreLead, liveAlbumQuestion, tourLead, venueAnswers } from "../src/lib/answers";
import { liveAlbumViews } from "../src/lib/live-albums";
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
  it("leads with the facts only: when, where, the tour, how long and the setlist", () => {
    const a = concertAnswers(concertView(), setlist);
    expect(a.lead).toBe(
      "Metallica · full concert · 1 November 1991 · L.C. Walker Arena, Muskegon, US · Wherever We May Roam Tour · 2 hours 22 minutes · " +
        "5 songs, opening with “Enter Sandman” · official concert from Metallica.",
    );
  });
  it("says nothing about facts it does not hold", () => {
    const bare = concertView({ venue: null, city: null, country: null, performedOn: null, performedYear: null, tour: null, genres: [], venueKind: null, channel: { name: "Fan", isOfficial: false } });
    const a = concertAnswers(bare, null);
    expect(a.lead).toBe("Metallica · full concert · 2 hours 22 minutes.");
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
    expect(q["What is the first Metallica concert on STAGEDIVE?"]).toBe(
      "The earliest full concert by Metallica on STAGEDIVE was played at L.C. Walker Arena, Muskegon, US, on 1 November 1991. It is the oldest one here, not necessarily their first show ever.",
    );
    expect(q["What is the most recent Metallica concert on STAGEDIVE?"]).toBe(
      "The most recent full concert by Metallica on STAGEDIVE was played at Pinkpop, Landgraaf, NL, in 2008. It is the newest one here, not necessarily their last show.",
    );
    expect(q["Is there a long gap between Metallica concerts here?"]).toBe(
      "Yes: Metallica's full concerts on STAGEDIVE jump from 1993 (Pinkpop) to 2008 (Pinkpop), 15 years later, with none in between.",
    );
    expect(q["What are Metallica's most played songs live?"]).toBe("Across the 2 setlists here: “One” (2 setlists).");
    expect(q["What song does Metallica usually open with?"]).toBe("“One”: it opens both setlists here.");
    expect(q["How long is a Metallica concert?"]).toBe("The 3 Metallica concerts here run 2 hours 22 minutes on average. The longest is L.C. Walker Arena 1991 (2:22:00).");
    expect(q["Where are Metallica from?"]).toBe("Los Angeles, US.");
    expect(allText(a)).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(allText(a))).toBe(true);
  });
  it("leaves out questions without data", () => {
    const a = bandAnswers({ name: "Solo", origin: null }, [concertView({ tour: null, venueKind: null, performedYear: null, performedOn: null })]);
    expect(a.questions.map((q) => q.question)).toEqual(["Where can I watch Solo full concerts?"]);
  });
});

describe("first and most recent concert, and long gaps", () => {
  const at = (year: number, over: Parameters<typeof concertView>[0] = {}) =>
    concertView({ id: year, slug: `x-${year}`, performedYear: year, performedOn: null, venue: null, city: null, country: null, ...over });
  it("never claims the band's first or last show ever, and says only what we hold", () => {
    const qs = bandSpanQuestions("Pixies", [at(2004), at(1988, { city: "Leiden" })]);
    expect(qs.map((q) => q.answer)).toEqual([
      "The earliest full concert by Pixies on STAGEDIVE was played at Leiden, in 1988. It is the oldest one here, not necessarily their first show ever.",
      "The most recent full concert by Pixies on STAGEDIVE was played in 2004. It is the newest one here, not necessarily their last show.",
      "Yes: Pixies' full concerts on STAGEDIVE jump from 1988 (Leiden) to 2004, 16 years later, with none in between.",
    ]);
    for (const q of qs) expect(`${q.question} ${q.answer}`).not.toMatch(/reunion|reunite|broke up|split/i);
  });
  it("asks nothing with one concert, or two it cannot tell apart in time", () => {
    expect(bandSpanQuestions("Muse", [at(2004)])).toEqual([]);
    expect(bandSpanQuestions("Muse", [at(2004), at(2004)])).toEqual([]);
    expect(bandSpanQuestions("Muse", [at(2004), concertView({ performedYear: null, performedOn: null })])).toEqual([]);
    const sameYear = bandSpanQuestions("Muse", [
      at(2004, { id: 1, performedOn: new Date("2004-06-26T00:00:00Z") }),
      at(2004, { id: 2, performedOn: new Date("2004-08-27T00:00:00Z") }),
    ]);
    expect(sameYear.map((q) => q.answer.match(/on \d+ \w+ 2004/)![0])).toEqual(["on 26 June 2004", "on 27 August 2004"]);
  });
  it("states a gap only from 8 years, the longest one", () => {
    expect(bandSpanQuestions("Blur", [at(1990), at(1997)]).length).toBe(2);
    const qs = bandSpanQuestions("Blur", [at(1990), at(1999), at(2009), at(2023)]);
    expect(qs[2].answer).toContain("jump from 2009 to 2023, 14 years later");
  });
  it("leaves guest spots out of the band's first and last concert", () => {
    const guest = concertView({ id: 9, performedYear: 1975, performedOn: null, credits: "Ramones with Metallica", artists: [{ slug: "ramones", name: "Ramones", role: "MAIN", creditNote: null, hasPage: true }, { slug: "metallica", name: "Metallica", role: "WITH", creditNote: null, hasPage: true }] });
    const q = Object.fromEntries(bandAnswers({ name: "Metallica", origin: null }, [...concerts, guest]).questions.map((x) => [x.question, x.answer]));
    expect(q["What is the first Metallica concert on STAGEDIVE?"]).toContain("1 November 1991");
  });
});

describe("live albums answer", () => {
  const albums = liveAlbumViews(
    [
      { mbid: "a", title: "S&M", year: 1999 },
      { mbid: "b", title: "Live Shit: Binge & Purge", year: 1993 },
      { mbid: "c", title: "Live at Pinkpop 1993", year: 2010 },
      { mbid: "d", title: "Undated", year: null },
    ],
    concerts,
  );
  it("names the albums oldest first, says where the list comes from and which ones are here", () => {
    expect(liveAlbumQuestion("Metallica", albums)).toEqual({
      question: "What live albums has Metallica released?",
      answer:
        "MusicBrainz lists 4 live albums by Metallica: “Live Shit: Binge & Purge” (1993), “S&M” (1999), “Live at Pinkpop 1993” (2010) and “Undated”. “Live at Pinkpop 1993” is also on STAGEDIVE as a full concert.",
    });
    expect(liveAlbumQuestion("Metallica", [])).toBeNull();
  });
  it("names ten at most, and is in the band FAQ", () => {
    const many = liveAlbumViews(Array.from({ length: 13 }, (_, i) => ({ mbid: `m${i}`, title: `Live ${i}`, year: 1980 + i })), []);
    expect(liveAlbumQuestion("Metallica", many)!.answer).toMatch(/“Live 9” \(1989\) and 3 more\.$/);
    const a = bandAnswers({ name: "Metallica", origin: null }, concerts, [], albums);
    expect(a.questions.some((q) => q.question === "What live albums has Metallica released?")).toBe(true);
    expect(allText(a)).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(allText(a))).toBe(true);
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
