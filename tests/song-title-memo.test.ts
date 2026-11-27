// Speed (27 Nov 2026): the song-title cleaning is kept (src/lib/song-title.ts), capped.
import { describe, expect, it } from "vitest";
import { SONG_TITLE_MEMO_MAX, songParts, songSlug, songTitleBase } from "../src/lib/song-title";

describe("song-title cleaning, kept", () => {
  it("gives the same answers when asked again", () => {
    const lines = ["01. Creep (Live)", "Street Spirit (Fade Out)", "Metallica Medley - Sanitarium/One", "Drum solo"];
    const first = lines.map((l) => [songTitleBase(l), songSlug(l), songParts(l)]);
    expect(lines.map((l) => [songTitleBase(l), songSlug(l), songParts(l)])).toEqual(first);
    expect(songSlug("01. Creep (Live)")).toBe("creep");
  });
  it("hands out a copy of a line's songs, so a caller cannot change the kept one", () => {
    const parts = songParts("Metallica Medley - Sanitarium/One");
    parts.push("Changed");
    expect(songParts("Metallica Medley - Sanitarium/One")).toEqual(["Sanitarium", "One"]);
  });
  it("stays capped", () => {
    for (let i = 0; i < SONG_TITLE_MEMO_MAX + 10; i++) songTitleBase(`Song number ${i}`);
    expect(songTitleBase("Song number 1")).toBe("Song number 1");
  });
});
