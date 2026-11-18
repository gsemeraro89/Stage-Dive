// Artist profiles: free MusicBrainz facts first (owner decision 13 Nov 2026, cost).
import { describe, expect, it } from "vitest";
import { factsAreEnough, factsFromDetail } from "../src/lib/collector/musicbrainz";
import { MAX_SEARCHES, PROFILE_MODEL } from "../src/lib/collector/profiles";

describe("MusicBrainz facts for profiles", () => {
  it("reads origin, birth year (people only) and tags", () => {
    const person = factsFromDetail("id1", {
      type: "Person",
      area: { name: "France" },
      "begin-area": { name: "Lyon" },
      "life-span": { begin: "1990-05-02" },
      genres: [{ name: "Melodic Techno", count: 3 }],
      tags: [{ name: "electronic", count: 2 }, { name: "spam", count: 0 }],
    });
    expect(person).toEqual({ mbid: "id1", type: "Person", origin: "Lyon, France", bornYear: 1990, tags: ["melodic techno", "electronic"] });
    expect(factsAreEnough(person)).toBe(true);

    const group = factsFromDetail("id2", { type: "Group", area: { name: "Berlin" }, "life-span": { begin: "2009" }, tags: [{ name: "house", count: 1 }] });
    expect(group.origin).toBe("Berlin");
    expect(group.bornYear).toBeNull(); // a group's start year is not an age
    expect(factsAreEnough(group)).toBe(true);
  });

  it("asks the web when MusicBrainz knows too little", () => {
    expect(factsAreEnough(null)).toBe(false);
    expect(factsAreEnough(factsFromDetail("x", { type: "Person", area: { name: "Italy" }, tags: [{ name: "techno", count: 1 }] }))).toBe(false); // no birth year
    expect(factsAreEnough(factsFromDetail("x", { type: "Group", tags: [{ name: "techno", count: 1 }] }))).toBe(false); // no origin
    expect(factsAreEnough(factsFromDetail("x", { type: "Group", area: { name: "Paris" } }))).toBe(false); // no tags
  });

  it("uses the cheaper model and at most two searches", () => {
    expect(PROFILE_MODEL).toBe("claude-sonnet-5-5");
    expect(MAX_SEARCHES).toBe(2);
  });
});
