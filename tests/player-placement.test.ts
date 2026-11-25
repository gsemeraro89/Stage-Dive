import { describe, expect, it } from "vitest";
import { framePlacement } from "../src/lib/player/placement";

describe("player frame placement", () => {
  it("hides the player only when nothing is playing", () => {
    expect(framePlacement(false, false)).toBe("hide");
    expect(framePlacement(false, true)).toBe("hide");
  });
  it("never hides a playing concert while its new place is not there yet (leaving the concert page)", () => {
    expect(framePlacement(true, false)).toBe("keep");
  });
  it("puts a playing concert over its slot or the bar's video box", () => {
    expect(framePlacement(true, true)).toBe("place");
  });
});
