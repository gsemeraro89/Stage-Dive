// Deep links to a moment of a concert (?t=), used by the key moments in search results.
import { describe, expect, it } from "vitest";
import { parseStartTime, startAtPath } from "../src/lib/player/start-time";

describe("start time from the address", () => {
  it("reads seconds and the usual written forms", () => {
    expect(parseStartTime("315")).toBe(315);
    expect(parseStartTime("315s")).toBe(315);
    expect(parseStartTime("5m15s")).toBe(315);
    expect(parseStartTime("1h2m3s")).toBe(3723);
    expect(parseStartTime("1h")).toBe(3600);
    expect(parseStartTime("1:02:03")).toBe(3723);
    expect(parseStartTime("5:15")).toBe(315);
  });
  it("ignores nonsense, zero and times past the end", () => {
    for (const v of [null, undefined, "", "abc", "-5", "0", "1.5", "5:1", "9".repeat(20)]) expect(parseStartTime(v)).toBeNull();
    expect(parseStartTime("600", 600)).toBeNull();
    expect(parseStartTime("599", 600)).toBe(599);
  });
  it("builds the page address for a second", () => {
    expect(startAtPath("metallica-1991", 315.7)).toBe("/concerts/metallica-1991?t=315");
  });
});
