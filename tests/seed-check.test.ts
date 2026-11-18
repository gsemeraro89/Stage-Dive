// The seed check: the owner's 18 candidates against what YouTube says (no network here).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { YouTubeVideo } from "../src/lib/collector/youtube";
import { checkRow, confirmOfficial, parseCsv, uploaderUnknown, venueKindFor, type CsvRow } from "../src/lib/seed/check";
import { normalizeSeed } from "../src/lib/seed/normalize";

const rows = parseCsv(readFileSync("data/seed-concerts.csv", "utf8")) as unknown as CsvRow[];
const row = (n: number) => rows.find((r) => r.id === String(n))!;
const listed = ["Pinkpop Archive", "Rock in Rio", "Primavera Sound", "ARTE Concert", "Metallica", "The Cure"];

function yt(overrides: Partial<YouTubeVideo> = {}): YouTubeVideo {
  return {
    youtubeId: "IA9xKr_Dmek",
    title: "Metallica: Live in Muskegon, MI - November 1, 1991 (Full Concert)",
    description: "",
    tags: [],
    channelId: "UCbulh9WdLtEXiooRcYK7SWw",
    channelTitle: "Metallica",
    publishedAt: new Date("2021-05-03T12:00:00Z"),
    durationSeconds: 8820,
    viewCount: 2_400_000,
    embeddable: true,
    privacyStatus: "public",
    madeForKids: false,
    liveBroadcastContent: "none",
    uploadStatus: "processed",
    blockedIn: [],
    ...overrides,
  };
}

describe("data/seed-concerts.csv", () => {
  it("has the owner's 18 candidates, each with a YouTube ID", () => {
    expect(rows).toHaveLength(18);
    for (const r of rows) expect(r.youtube_id).toMatch(/^[A-Za-z0-9_-]{11}$/);
    expect(new Set(rows.map((r) => r.youtube_id)).size).toBe(18);
  });
  it("puts Depeche Mode in new wave / synth (owner, 18 Nov 2026) and leaves the Stones out", () => {
    expect(rows.find((r) => r.band === "Depeche Mode")!.genre).toBe("new wave / synth");
    expect(rows.some((r) => /rolling stones/i.test(r.band))).toBe(false);
  });
  it("reads quoted fields with commas and quotes", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([{ a: "x, y", b: 'say "hi"' }]);
  });
});

describe("checkRow", () => {
  const today = "2026-11-18";
  it("passes an official, public, embeddable, long, unblocked video and builds its seed entry", () => {
    const out = checkRow(row(2), yt(), listed, today);
    expect(out.kind).toBe("pass");
    if (out.kind !== "pass") return;
    expect(out.concert).toMatchObject({
      id: "IA9xKr_Dmek",
      artist: "Metallica",
      channel: "Metallica",
      official: true,
      secs: 8820,
      date: "2021-05-03",
      performed: "1991-11-01",
      genres: ["metal"],
      venueKind: "Room",
      checked_on: today,
    });
    // The entry is a valid seed concert.
    expect(() => normalizeSeed({ concerts: [out.concert] })).not.toThrow();
  });
  it("drops what YouTube does not let us show, with every reason", () => {
    expect(checkRow(row(5), null, listed, today)).toEqual({ kind: "drop", reasons: ["not found on YouTube (deleted or private)"] });
    const out = checkRow(row(12), yt({ youtubeId: "cyRIdVoDYG4", durationSeconds: 38 * 60, embeddable: false, blockedIn: ["IT", "DE"] }), listed, today);
    expect(out).toEqual({ kind: "drop", reasons: ["embedding switched off", "too short (38 min)", "blocked in IT, DE"] });
    expect(checkRow(row(7), yt({ privacyStatus: "private" }), listed, today).kind).toBe("drop");
  });
  it("asks the owner when the uploader is not confirmed official", () => {
    const out = checkRow(row(18), yt({ youtubeId: "7VBl29wkCX4", channelTitle: "oldgigs4ever", channelId: "UCfan" }), listed, today);
    expect(out.kind).toBe("ask");
  });
  it("confirms archive and broadcaster channels from our list", () => {
    expect(checkRow(row(9), yt({ youtubeId: "vXsFpdYAV9c", channelTitle: "Pinkpop Archive" }), listed, today).kind).toBe("pass");
    expect(checkRow(row(8), yt({ youtubeId: "nvHGa6fDhUs", channelTitle: "Primavera Sound" }), listed, today).kind).toBe("pass");
  });
});

describe("uploader and venue kind", () => {
  it("knows when the owner did not know the uploader", () => {
    expect(uploaderUnknown("unknown - check")).toBe(true);
    expect(uploaderUnknown("check")).toBe(true);
    expect(uploaderUnknown("Pinkpop Archive")).toBe(false);
  });
  it("confirms by band name, by the CSV's uploader note, or by our channel list", () => {
    expect(confirmOfficial("The Cure", { band: "The Cure", uploader: "unknown - check" }, []).official).toBe(true);
    expect(confirmOfficial("Metallica", { band: "Metallica", uploader: "Metallica (#MetallicaMondays)" }, []).official).toBe(true);
    expect(confirmOfficial("Rock in Rio", { band: "Linkin Park", uploader: "unknown - check" }, listed).official).toBe(true);
    expect(confirmOfficial("Telekom Street Gigs", { band: "Depeche Mode", uploader: "check" }, listed).official).toBe(false);
  });
  it("derives the venue kind from the owner's source type", () => {
    expect(venueKindFor(row(9))).toBe("Festival"); // festival archive
    expect(venueKindFor(row(6))).toBe("Livestream"); // artist channel livestream at Troxy
    expect(venueKindFor(row(4))).toBe("Room"); // Yankee Stadium
    expect(venueKindFor(row(8))).toBe("Festival"); // Primavera Sound stream
  });
});
