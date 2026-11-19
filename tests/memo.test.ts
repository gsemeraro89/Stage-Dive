// The in-memory page cache stays small on the 512 MB server: least recently used entries go first.
import { beforeEach, describe, expect, it } from "vitest";
import { cacheSize, clearCache, recall, remember } from "../src/lib/memo";

beforeEach(() => clearCache());

describe("page cache", () => {
  it("keeps at most the cap, dropping the least recently used", async () => {
    const now = 1000;
    remember("a", Promise.resolve(1), now, 60_000, 2);
    remember("b", Promise.resolve(2), now, 60_000, 2);
    expect(await recall("a", now)).toBe(1); // "a" is now the most recently used
    remember("c", Promise.resolve(3), now, 60_000, 2);
    expect(cacheSize()).toBe(2);
    expect(recall("b", now)).toBeUndefined();
    expect(await recall("a", now)).toBe(1);
    expect(await recall("c", now)).toBe(3);
  });
  it("forgets expired entries", () => {
    remember("a", Promise.resolve(1), 0, 10, 5);
    expect(recall("a", 5)).toBeDefined();
    expect(recall("a", 10)).toBeUndefined();
  });
});
