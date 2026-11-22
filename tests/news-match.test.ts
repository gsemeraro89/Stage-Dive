// The news matcher and the free headline filter on the real headlines of the 22 Nov 2026 dry run
// (admin_ops news:dry), which would have sent ~130 items to Claude, many matched to the wrong band or festival.
import { describe, expect, it } from "vitest";
import { festivalBase, festivalNames, newsMatcher, type NewsEntity } from "../src/lib/news/match";
import { notNewsReason } from "../src/lib/news/not-news";

const band = (name: string): NewsEntity => ({ kind: "band", slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name });
const fest = (name: string, slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-")): NewsEntity => ({ kind: "festival", slug, name });

const OURS: NewsEntity[] = [
  ...[
    "Down", "System of a Down", "Madness", "Rush", "Ghost", "Can", "The Holy", "Rhonda", "Tool", "Metallica", "Slayer", "Megadeth",
    "Anthrax", "Santana", "Black Sabbath", "Iron Maiden", "Danzig", "Queen", "Korn", "Trivium", "In Flames", "Touché Amoré", "Slipknot", "Blondie", "Lucius",
  ].map(band),
  fest("Hyde Park"),
  fest("North Festival"),
  fest("Power Trip Festival"),
  fest("Hard Rock Fest"),
  fest("Glastonbury Festival"),
  fest("When We Were Young 2024, Purple Stage", "when-we-were-young-2024-purple-stage"),
  fest("Outbreak Fest", "outbreak-fest"),
  fest("Outbreak Fest, Bowlers Arena", "outbreak-fest-bowlers-arena"),
  fest("Outbreak Fest 2022", "outbreak-fest-2022"),
  fest("Outbreak Fest, second stage", "outbreak-fest-second-stage"),
];
const matcher = newsMatcher(OURS);
const names = (title: string, summary = "") => {
  const m = matcher.find({ title, summary });
  return [...m.bands, ...m.festivals].map((e) => e.name);
};

describe("matcher: the longest name wins", () => {
  it("'System of a Down' is not also 'Down'", () => {
    expect(names("John Dolmayan Says 'Big Things Are Coming' for System of a Down")).toEqual(["System of a Down"]);
    expect(names("JOHN DOLMAYAN Says 'Big Things Are Coming For SYSTEM OF A DOWN'")).toEqual(["System of a Down"]);
    expect(names("System Of A Down drummer targets history-making shows at world landmarks")).toEqual(["System of a Down"]);
  });
});

describe("matcher: one-word band names must be used as a band", () => {
  it("does not take the everyday word in a Title Case headline", () => {
    expect(names("Promoter Behind Troubled Furnace Fest And Rock The Country Shuts Down")).toEqual([]);
    expect(names("Fans Trampled At OsamaSon's Terminal 5 Show After DJ Tells Crowd To Rush Merch Booth For Jordan 4s")).toEqual([]);
    expect(names("Power Trip's New Single, \"Mutual Death Warrant,\" Can Only Be Heard in 'Grand Theft Auto VI'")).toEqual([]);
    expect(names("Touché Amoré Drops First Standalone Single in Two Years, \"(I Can't Get Out Of) My Own Way\"")).toEqual(["Touché Amoré"]);
  });

  it("does not take a song or album title in quotes", () => {
    expect(names("Tube Alloys Announce New Album Live From Death Row: Hear “Down By The Pool”")).toEqual([]);
    expect(names("ATREYU Releases German-Language Version Of 'Ghost In Me' From New Album 'The End Is Not The End'")).toEqual([]);
    expect(names("Maruja thank fans with new live album 'The Holy Inadequate' and Ritual Union headline set")).toEqual([]);
  });

  it("does not take a word in someone's name or in another sense", () => {
    expect(
      names(
        "FLOTSAM AND JETSAM's ERIC 'A.K.' KNUTSON Says JASON NEWSTED Is 'Still The Same Guy'",
        "Knutson talked about the madness of touring in the eighties and Newsted's band.",
      ),
    ).toEqual([]);
    expect(names("THE POWER OF 3, Featuring ORIANTHI, CINDY BLACKMAN SANTANA And RHONDA SMITH, Announces Special Live Performance")).toEqual([]);
    expect(names("The Power of 3 live", "Featuring Orianthi, Cindy Blackman Santana and Rhonda Smith, the trio plays the Grammy Museum.")).toEqual([]);
  });

  it("takes the band when it is used as one", () => {
    expect(names("Geddy Lee Insists 'Woke Agenda' Didn't Impact Rush Drummer Choice")).toEqual(["Rush"]);
    expect(names("Down announce first European tour in a decade")).toEqual(["Down"]);
    expect(names("John Christ, Original Danzig Guitarist, Dead at 61")).toEqual(["Danzig"]);
    expect(names("Billy Strings and Phish's Trey Anastasio Cover Metallica's \"Master of Puppets\"")).toEqual(["Metallica"]);
    expect(names("Black Sabbath, Metallica, Anthrax, Tool, System Of A Down and more feature on GTA VI soundtrack")).toEqual([
      "Black Sabbath",
      "Metallica",
      "Anthrax",
      "Tool",
      "System of a Down",
    ]);
    expect(names("Queen Has Reworked an '80s Song They Felt Was Still Unfinished")).toEqual(["Queen"]);
    expect(names("Watch: Rammstein Debut New Live Video", "")).toEqual([]);
    expect(names("SLAYER's KERRY KING Announces Second Solo Album")).toEqual(["Slayer"]);
    expect(names("Megadeth's Dave Mustaine + Family Have a New Reality Show")).toEqual(["Megadeth"]);
  });

  it("a distinctive one-word name needs a music word, and not to be part of a person's name", () => {
    expect(names("Why Metallica Has to Rehearse Overnight for Sphere Residency")).toEqual(["Metallica"]);
    expect(names("The Power of 3 live", "With Cindy Blackman Santana on drums, the trio plays the Grammy Museum.")).toEqual([]);
    expect(names("Santana 2027 Tour Adds North American Dates")).toEqual(["Santana"]);
  });
});

describe("matcher: festivals", () => {
  it("does not use a short name made only of everyday words", () => {
    expect(festivalNames("Hard Rock Fest")).not.toContain("Hard Rock");
    expect(festivalNames("North Festival")).not.toContain("North");
    expect(festivalNames("Power Trip Festival")).not.toContain("Power Trip");
    expect(names("THUNDERMOTHER Shares Single", "The Swedish hard rock band's new album is out in March.")).toEqual([]);
    expect(names("Carlos Santana adds North American dates to Planet of Free Will Global Tour")).toEqual(["Santana"]);
    expect(names("Thrash metal ragers Power Trip release new track, Mutual Death Warrant, only through Grand Theft Auto VI")).toEqual([]);
  });

  it("still takes the full name", () => {
    expect(names("Hard Rock Fest 2027 announces first headliners")).toEqual(["Hard Rock Fest"]);
    expect(names("North Festival reveals 2027 line-up")).toEqual(["North Festival"]);
    expect(names("Billie Eilish, Harry Styles, and Sam Fender Headlining Glastonbury 2027")).toEqual(["Glastonbury Festival"]);
  });

  it("a place counts only with one of our bands", () => {
    expect(names("BST Hyde Park 2027: Billie Eilish announced as latest headliner")).toEqual([]);
    expect(names("Metallica to headline BST Hyde Park 2027")).toEqual(["Metallica", "Hyde Park"]);
  });

  it("one entity per festival, named without its stage or year", () => {
    expect(festivalBase("When We Were Young 2024, Purple Stage")).toBe("When We Were Young");
    expect(names("When We Were Young adds a third day")).toEqual(["When We Were Young"]);
    expect(names("Hayley Williams-Curated Outbreak Fest Features Dinosaur Jr., Blood Orange")).toEqual(["Outbreak Fest"]);
    const m = matcher.find({ title: "Outbreak Fest 2027 line-up" });
    expect(m.festivals.map((f) => f.slug)).toEqual(["outbreak-fest"]);
  });
});

describe("headline filter: not news, Claude not asked", () => {
  it.each([
    ["My Chemical Romance quiz: How much do you know about the band?", "quiz"],
    ["Korn quiz: How much do you know about these nu metal legends?", "quiz"],
    ["10 Unusual 2026 Classic Rock Holiday Gifts From Etsy", "gift guide"],
    ["The 10 Best Metal Bass Intros of All Time", "numbered list"],
    ["15 Rock + Metal Bands That Broke Up in 2026", "numbered list"],
    ["21 New Rock + Metal Tours Announced This Past Week", "numbered list"],
    ["30 Best Rock + Metal Songs of 2026", "numbered list"],
    ["25 Best Rock + Metal Albums of 2026", "numbered list"],
    ["10 candid photos from Pearl Jam's early years taken by bassist Jeff Ament", "numbered list"],
    ["All 5 Rock + Metal Musicians Who Are DJs in 'Grand Theft Auto 6'", "numbered list"],
    ["Sleep’s Dale Crover & Bubba DuPree Name 10 Essential 1970s Classic Rock Albums", "numbered list"],
    ["AP A-sides: 10 songs you need to hear", "numbered list"],
    ["The Weekly Injection: New Releases From Suicide Silence, Trivium, and More Out This Week – 11/20", "round-up"],
    ["Megadeth's Massive 2027 Tour, GTA VI Goes Heavy & More Top Stories", "round-up"],
    ["Metal Hammer's Tracks Of The Week: November 20 2026", "round-up"],
    ["Heavy Song of the Week: Kerry King Thrashes Us to Death with “My War”", "round-up"],
    ["Feedbacker: Rock Music for November by JR Moores", "round-up"],
    ["Energy Flowing, Energy Growing: Martin Gore & Cliff Damavandi Interviewed", "interview"],
    ["Tony Iommi Exclusive Interview - New Album, Back to the Start", "interview"],
    ["Interview - Tommy Victor Discusses Prong's New Album + More", "interview"],
    ["How U2 dismantled everything they held sacred and saved their career with the fearless, futuristic Achtung Baby", "retrospective"],
    ["How Chris Cornell delivered the grittiest James Bond theme of them all", "retrospective"],
    ["The day Roger Daltrey threatened to throw Iron Maiden’s Nicko McBrain down a flight of stairs", "retrospective"],
    ["35 Years Ago: U2's 'Achtung Baby' – A Track-by-Track Guide", "retrospective"],
    ["Instant noodles and cassette tapes: A short history of Bon Jovi and advertising", "retrospective"],
    ["Review: Parkway Drive's Home is a thrilling, surprisingly emotional treat", "review"],
    ["Siouxsie And The Banshees: Downside Up (B-sides 1978-1995) – Box set review", "review"],
    ["Photos: Trivium, In Flames, Fit For An Autopsy, and Frozen Soul", "photo gallery"],
    ["Photos - Slayer, Cannibal Corpse, Cavalera Conspiracy + Crowbar", "photo gallery"],
    ["Better Three Days Grace Album - 'Alienation' vs. 'Self-Titled'", "comparison"],
    ["Every Rock + Metal Song That's Been in 'Grand Theft Auto' Games", "list of every"],
    ["Here Are All the Rock Songs in 'Grand Theft Auto VI'", "list of every"],
    ["Which Rock Hall-Eligible Bands Have the Best Chart Resume?", "list of every"],
  ])("%s -> %s", (title, reason) => expect(notNewsReason(title)).toBe(reason));

  it.each([
    "Deep Purple Postpones All Remaining 2026 Tour Dates",
    "Foo Fighters Announce 2027 Summer Tour",
    "Iron Maiden's Bruce Dickinson Announces New 'PsychoGod' Album",
    "Lamb of God Earns First Platinum Single",
    "The Who Confirms New Show a Year After Song Is Over Farewell Tour",
    "Slayer's Kerry King Announces 2nd Solo Album + Drops New Song",
    "Glastonbury Reveals First Acts for 2027 Edition",
    "Petition calling for Marilyn Manson to be removed from Slipknot’s 2027 Wembley Stadium show has over 20,000 signatures",
    "Metallica give $200,000 to local charities following Las Vegas Sphere residency",
    "Here's When Michael Stipe Will Finally Release His Debut Solo LP",
    "Watch: Rammstein Debut New Live Video for “Du Hast” From Their Concert Film",
    "3 Doors Down announce 2027 tour",
    "30 Seconds to Mars return with new single",
    "Every Time I Die members reunite for one show",
    "Why Metallica Has to Rehearse Overnight for Sphere Residency",
  ])("news: %s", (title) => expect(notNewsReason(title)).toBeNull());
});
