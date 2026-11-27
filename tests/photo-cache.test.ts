// Speed (27 Nov 2026): versioned photo addresses are kept a year by browsers (src/lib/photos/cache.ts).
import { describe, expect, it } from "vitest";
import { IMMUTABLE, photoCacheControl } from "../src/lib/photos/cache";

const q = (s: string) => new URLSearchParams(s);

describe("photoCacheControl", () => {
  it("keeps a versioned band or festival photo for a year", () => {
    expect(photoCacheControl("/photos/bands/radiohead", q("v=mabc12"))).toBe(IMMUTABLE);
    expect(photoCacheControl("/photos/festivals/pinkpop", q("v=1"))).toBe(IMMUTABLE);
    expect(IMMUTABLE).toBe("public, max-age=31536000, immutable");
  });
  it("leaves the route's own header without a version or elsewhere", () => {
    expect(photoCacheControl("/photos/bands/radiohead", q(""))).toBeNull();
    expect(photoCacheControl("/photos/bands/radiohead", q("v="))).toBeNull();
    expect(photoCacheControl("/artists/radiohead", q("v=1"))).toBeNull();
    expect(photoCacheControl("/photos/bands/radiohead/extra", q("v=1"))).toBeNull();
  });
});
