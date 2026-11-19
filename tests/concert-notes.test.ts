// Concert notes: facts about one concert from the band's other concerts and the setlist.
import { describe, expect, it } from "vitest";
import { concertNotes, noteText, type SiblingConcert } from "../src/lib/concert-notes";
import { BANNED, concertView, setlist, youtubeOnlyWithViews } from "./fixtures/concert-view";

const current = concertView();
const sibling = (over: Partial<SiblingConcert>): SiblingConcert => ({
  id: 0,
  slug: "x",
  viewCount: 0,
  performedYear: null,
  venue: null,
  tour: null,
  songs: null,
  ...over,
});
const siblings: SiblingConcert[] = [
  sibling({ id: 1, slug: current.slug, viewCount: current.viewCount, performedYear: 1991, venue: current.venue, tour: current.tour, songs: ["Enter Sandman", "Creeping Death", "Last Caress", "Seek & Destroy"] }),
  sibling({ id: 2, slug: "walker-1989", viewCount: 9_000_000, performedYear: 1989, venue: current.venue, songs: ["Creeping Death", "Seek and Destroy", "Battery"] }),
  sibling({ id: 3, slug: "roam-1992", viewCount: 10, performedYear: 1992, tour: current.tour, songs: ["Enter Sandman", "Battery"] }),
  sibling({ id: 4, slug: "pinkpop-2008", viewCount: 20, performedYear: 2008, songs: ["Enter Sandman", "One"] }),
];

const input = { concert: current, band: { slug: "metallica", name: "Metallica" }, siblings, setlist, decade: { label: "1990s", count: 7 } };

describe("concert notes", () => {
  const notes = concertNotes(input);
  const byId = Object.fromEntries(notes.map((n) => [n.id, noteText(n)]));

  it("ranks the concert among the band's concerts by views", () => {
    expect(byId.rank).toBe("The 2nd most watched of Metallica's 4 concerts here (2,400,000 views on YouTube).");
  });
  it("links other nights at the same place, the tour and the decade", () => {
    expect(byId["same-place"]).toBe("Metallica also played L.C. Walker Arena in 1989.");
    expect(notes.find((n) => n.id === "same-place")!.parts).toContainEqual({ href: "/concerts/walker-1989", text: "1989" });
    expect(byId["same-tour"]).toBe("One of 2 concerts from Wherever We May Roam Tour here.");
    expect(notes.find((n) => n.id === "same-tour")!.parts).toContainEqual({ href: "/tours/wherever-we-may-roam", text: "Wherever We May Roam Tour" });
    expect(byId.decade).toBe("One of 7 concerts from the 1990s here.");
  });
  it("describes the setlist: length, opener, closer, longest song", () => {
    expect(byId.setlist).toBe("5 songs: opens with “Enter Sandman”, closes with “Seek & Destroy”.");
    // Creeping Death runs 315 -> 700 (6:25); the unidentified line is never named.
    expect(byId["longest-song"]).toBe("Longest song: “Creeping Death” (6:25).");
  });
  it("finds songs shared with the band's other setlists, and the ones only played here", () => {
    expect(byId["shared-songs"]).toBe("Also in Metallica's other setlists here: “Enter Sandman” (2 of 3), “Creeping Death” (1 of 3) and “Seek & Destroy” (1 of 3).");
    expect(byId["only-here"]).toBe("Only in this setlist, of the 4 by Metallica here: “Last Caress”.");
  });
  it("leaves notes out when their data is missing", () => {
    const alone = concertNotes({ concert: { ...current, tour: null, venue: null }, band: null, siblings: [], setlist: null, decade: { label: "1990s", count: 1 } });
    expect(alone).toEqual([]);
  });
  it("follows the copy rules", () => {
    const text = notes.map(noteText).join(" ");
    expect(text).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(text)).toBe(true);
  });
});
