// "Pick up where you left off": the record the player keeps across full page loads.
import { describe, expect, it } from "vitest";
import type { Track } from "../src/lib/player-types";
import {
  clearResume,
  isResumeFresh,
  parseResume,
  readResume,
  RESUME_KEY,
  RESUME_MAX_AGE_MS,
  resumeSecond,
  serializeResume,
  writeResume,
} from "../src/lib/player/resume";

const track = (id: string, extra: Partial<Track> = {}): Track => ({
  youtubeId: id,
  slug: `band-at-${id.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
  title: `Band at ${id}`,
  credits: "Band",
  durationSeconds: 3600,
  thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ...extra,
});
const A = track("AAAAAAAAAAA");
const B = track("BBBBBBBBBBB");
const C = track("CCCCCCCCCCC");
const NOW = Date.UTC(2026, 10, 25, 20, 0, 0);

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("player resume record", () => {
  it("round-trips what the player needs", () => {
    const raw = serializeResume({ track: A, at: 754.8, queue: [B, C], history: [C], mini: true, now: NOW });
    const record = parseResume(raw, NOW + 1000);
    expect(record).toEqual({ v: 1, track: A, at: 754, savedAt: NOW, queue: [B, C], history: [C], mini: true });
  });

  it("stores only the player's fields of a track", () => {
    const fat = { ...A, thumbnailSources: { src: "x" }, secret: "no" } as unknown as Track;
    const record = parseResume(serializeResume({ track: fat, at: 1, queue: [], history: [], mini: false, now: NOW }), NOW);
    expect(Object.keys(record!.track).sort()).toEqual(["credits", "durationSeconds", "slug", "thumbnail", "title", "youtubeId"]);
  });

  it("keeps the second inside the concert", () => {
    expect(resumeSecond(-5, 3600)).toBe(0);
    expect(resumeSecond(Number.NaN, 3600)).toBe(0);
    expect(resumeSecond(12.9, 3600)).toBe(12);
    expect(resumeSecond(9999, 3600)).toBe(3599);
    expect(resumeSecond(500, 0)).toBe(500); // length unknown: keep the second
  });

  it("expires after six hours, and ignores records from the future", () => {
    expect(isResumeFresh(NOW, NOW)).toBe(true);
    expect(isResumeFresh(NOW, NOW + RESUME_MAX_AGE_MS - 1)).toBe(true);
    expect(isResumeFresh(NOW, NOW + RESUME_MAX_AGE_MS)).toBe(false);
    expect(isResumeFresh(NOW + 10 * 60_000, NOW)).toBe(false);
    const raw = serializeResume({ track: A, at: 60, queue: [], history: [], mini: false, now: NOW });
    expect(parseResume(raw, NOW + RESUME_MAX_AGE_MS + 1)).toBeNull();
  });

  it("rejects broken, foreign or tampered records", () => {
    for (const raw of [null, "", "{", "null", "[]", '"x"', JSON.stringify({ v: 2, track: A, at: 1, savedAt: NOW })]) {
      expect(parseResume(raw, NOW)).toBeNull();
    }
    const bad = (t: unknown) => JSON.stringify({ v: 1, track: t, at: 10, savedAt: NOW, queue: [], history: [], mini: false });
    expect(parseResume(bad({ ...A, youtubeId: "short" }), NOW)).toBeNull();
    expect(parseResume(bad({ ...A, slug: "../admin" }), NOW)).toBeNull();
    expect(parseResume(bad({ ...A, slug: "pearl-jam-2024-bootleg-qqoclvam2_a" }), NOW)?.track.slug).toBe("pearl-jam-2024-bootleg-qqoclvam2_a");
    expect(parseResume(bad({ ...A, durationSeconds: "1h" }), NOW)).toBeNull();
    expect(parseResume(bad(undefined), NOW)).toBeNull();
  });

  it("drops bad queue entries and the playing concert from the queue and history", () => {
    const raw = JSON.stringify({ v: 1, track: A, at: "x", savedAt: NOW, queue: [B, { nope: 1 }, A, C], history: "no", mini: "yes" });
    expect(parseResume(raw, NOW)).toEqual({ v: 1, track: A, at: 0, savedAt: NOW, queue: [B, C], history: [], mini: false });
  });

  it("caps the queue and keeps the latest history", () => {
    const many = Array.from({ length: 80 }, (_, i) => track(`X${String(i).padStart(10, "0")}`));
    const record = parseResume(serializeResume({ track: A, at: 0, queue: many, history: many, mini: false, now: NOW }), NOW)!;
    expect(record.queue).toHaveLength(30);
    expect(record.queue[0]).toEqual(many[0]);
    expect(record.history).toHaveLength(30);
    expect(record.history.at(-1)).toEqual(many[79]);
  });

  it("reads, writes and clears through storage, deleting what it cannot use", () => {
    const store = memoryStore();
    writeResume(store, serializeResume({ track: A, at: 42, queue: [], history: [], mini: false, now: NOW }));
    expect(readResume(store, NOW)?.at).toBe(42);
    expect(readResume(store, NOW + RESUME_MAX_AGE_MS + 1)).toBeNull();
    expect(store.data.has(RESUME_KEY)).toBe(false); // the expired record is gone
    store.setItem(RESUME_KEY, "garbage");
    expect(readResume(store, NOW)).toBeNull();
    expect(store.data.has(RESUME_KEY)).toBe(false);
    writeResume(store, "x");
    clearResume(store);
    expect(store.data.has(RESUME_KEY)).toBe(false);
  });

  it("never throws when storage is off or full", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readResume(broken, NOW)).toBeNull();
    expect(() => writeResume(broken, "x")).not.toThrow();
    expect(() => clearResume(broken)).not.toThrow();
    expect(readResume(null, NOW)).toBeNull();
  });
});
