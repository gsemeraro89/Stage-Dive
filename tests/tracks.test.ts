// Which tracklist lines are the same track (BRIEF 4.8: one page per version, versions linked).
import { describe, expect, it } from "vitest";
import { artistKey, baseTitle, trackKey, versionName } from "../src/lib/tracks/normalize";

const key = (artist: string | null, title: string) => trackKey(artist, title)?.versionKey ?? null;
const song = (artist: string | null, title: string) => trackKey(artist, title)?.songKey ?? null;

describe("same track, written differently", () => {
  it("ignores Original/Extended mix, labels and release notes", () => {
    const k = key("Stephan Bodzin", "Boavista");
    expect(key("Stephan Bodzin", "Boavista (Original Mix)")).toBe(k);
    expect(key("Stephan Bodzin", "Boavista (Extended Mix)")).toBe(k);
    expect(key("STEPHAN BODZIN", "Boavista [Herzblut]")).toBe(k);
    expect(key("Stephan Bodzin", "Boavista (Out Now)")).toBe(k);
    expect(key("Stephan Bodzin", "Boavista - unreleased")).toBe(k);
  });

  it("matches artists in any order and with any separator, without feat. guests", () => {
    const k = key("Keinemusik, Boys Noize & Vinson", "Crazy For It");
    expect(key("Vinson x Keinemusik & Boys Noize", "Crazy For It")).toBe(k);
    expect(key("Keinemusik feat. Someone, Boys Noize, Vinson", "Crazy For It")).toBe(k);
    expect(key("Rampa ft. WhoMadeWho", "Tell Me Are We")).toBe(key("Rampa", "Tell Me Are We"));
  });

  it("ignores accents and case", () => {
    expect(key("Ben Böhmer", "Fade To Blue")).toBe(key("ben bohmer", "fade to blue"));
  });

  it("handles the long Keinemusik-style lines", () => {
    expect(
      key("Keinemusik, Boys Noize, Vinson", "Crazy For It (Extended Version) [Keinemusik] (Out Now) {Played by Rampa}"),
    ).toBe(key("Keinemusik, Boys Noize, Vinson", "Crazy For It"));
  });
});

describe("versions", () => {
  it("a remix is its own version of the same song", () => {
    const original = trackKey("Monolink", "Father Ocean")!;
    const remix = trackKey("Monolink", "Father Ocean (Ben Böhmer Remix)")!;
    expect(remix.songKey).toBe(original.songKey);
    expect(remix.versionKey).not.toBe(original.versionKey);
    expect(remix.version).toBe("Ben Böhmer Remix");
    expect(original.version).toBe("");
  });

  it("edits, dubs and reworks are versions too; two remixers are two versions", () => {
    expect(versionName("Gamma (Solomun Edit)")).toBe("Solomun Edit");
    expect(versionName("All I Need To Get High (Ae:ther Dreaming Dub Remix)")).toBe("Ae:ther Dreaming Dub Remix");
    expect(key("A", "Song (X Remix)")).not.toBe(key("A", "Song (Y Remix)"));
  });

  it("the same remix written twice is one version", () => {
    expect(key("Radio Slave", "Another Club (Charlotte De Witte Remix) [REKIDS]")).toBe(
      key("Radio Slave", "Another Club (Charlotte de Witte remix)"),
    );
  });
});

describe("lines that are not a nameable track", () => {
  it("has no key for ID, no artist, or an empty title", () => {
    expect(trackKey("ID", "ID")).toBeNull();
    expect(trackKey("Artbat", "ID")).toBeNull();
    expect(trackKey(null, "Intro")).toBeNull();
    expect(trackKey("A", "(Original Mix)")).toBeNull();
  });
});

describe("helpers", () => {
  it("artistKey and baseTitle", () => {
    expect(artistKey("Tale Of Us")).toBe("tale-of-us");
    expect(artistKey("A b2b B")).toBe("a_b");
    expect(baseTitle("Delilah (pull me out of this) [Atlantic]")).toBe("Delilah");
    expect(song("Fred again..", "Delilah (pull me out of this)")).toBe(song("Fred again..", "Delilah"));
  });
});

describe("cases found in the first count (13 Nov 2026)", () => {
  it("a pun edit, a revision and a respray are versions", () => {
    expect(key("Fred again.. ft. Jozzy", "Ten (DnB Freddit) [ATLANTIC (WARNER MUSIC)]")).not.toBe(key("Fred again..", "Ten"));
    expect(versionName("Trauma (2018' Revision)")).toBe("2018' Revision");
    expect(versionName("On My Way To Heaven (Above & Beyond's Cercle Respray)")).not.toBe("");
  });

  it("a doubtful note or a fan's remark is not a version", () => {
    expect(key("Getula", "Be Svendsen (unsure)")).toBe(key("Getula", "Be Svendsen"));
    expect(key("Perc", "Look What Your Love Has Done To Me (MY FAVORITE)")).toBe(key("Perc", "Look What Your Love Has Done To Me"));
  });

  it("N'to and NTO, curly and straight apostrophes, Nanã and Nana are the same", () => {
    expect(key("N'to", "The Hound")).toBe(key("NTO", "The Hound"));
    expect(key("Polo & Pan", "Coeur d’artichaut")).toBe(key("Polo & Pan", "Coeur d'Artichaut"));
    expect(key("Polo & Pan", "Nanã")).toBe(key("Polo & Pan", "Nana"));
  });
});
