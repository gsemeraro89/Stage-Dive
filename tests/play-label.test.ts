// Accessibility (27 Nov 2026): a play button's name starts with the words it shows (src/lib/player-types.ts).
import { describe, expect, it } from "vitest";
import { playLabel } from "../src/lib/player-types";

describe("playLabel", () => {
  it("starts with the words the button shows", () => {
    expect(playLabel("Metallica: Live at Slane Castle", "Play it loud")).toBe("Play it loud: Metallica: Live at Slane Castle");
    expect(playLabel("Live In Texas", "1:11:01")).toBe("1:11:01: play Live In Texas");
    expect(playLabel("Live In Texas", "Play it loud /// 1:11:01")).toMatch(/^Play it loud \/\/\/ 1:11:01/);
  });
  it("is 'Play <title>' for a button without words", () => {
    expect(playLabel("Creep")).toBe("Play Creep");
  });
});
