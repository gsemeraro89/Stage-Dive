import { describe, expect, it } from "vitest";
import { fixedAnchor } from "../src/lib/player/anchor";

const rect = (top: number, left: number, w: number, h: number) =>
  ({ top, left, width: w, height: h, bottom: top + h, right: left + w, x: left, y: top, toJSON() {} }) as DOMRect;

describe("player frame anchor", () => {
  it("in the full bar, pins the video by its distance from the bar's bottom (moves with the bar)", () => {
    const bar = rect(600, 0, 400, 204);
    const video = rect(603, 0, 356, 200);
    expect(fixedAnchor(video, bar, false)).toEqual({ top: "auto", bottom: "1px", left: "0px" });
  });
  it("in the mini-player window, pins it from the top like the window", () => {
    const win = rect(100, 20, 358, 249);
    const video = rect(148, 21, 356, 200);
    expect(fixedAnchor(video, win, true)).toEqual({ top: "148px", bottom: "auto", left: "21px" });
  });
});
