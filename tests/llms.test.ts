// Being found by AI assistants: /llms.txt, /llms-full.txt and the Markdown copies.
import { describe, expect, it } from "vitest";
import { concertNotes } from "../src/lib/concert-notes";
import { bandMarkdown, concertMarkdown, llmsFullTxt, llmsTxt } from "../src/lib/llms";
import { BANNED, concertView, setlist, youtubeOnlyWithViews } from "./fixtures/concert-view";

// Set before the texts below are built (they are built while the tests are collected).
process.env.SITE_URL = "https://stagedive.example";

const data = {
  bands: [
    { slug: "metallica", name: "Metallica", concerts: 12 },
    { slug: "pixies", name: "Pixies", concerts: 1 },
  ],
  venues: [{ slug: "pinkpop", name: "Pinkpop", concerts: 30 }],
  genres: [
    { slug: "metal", name: "metal", count: 40 },
    { slug: "shoegaze", name: "shoegaze", count: 0 },
  ],
  decades: [{ label: "1990s", count: 25 }],
  tours: [{ slug: "roam", name: "Wherever We May Roam Tour", count: 3, artist: { name: "Metallica" } }],
};

describe("llms.txt", () => {
  const txt = llmsTxt(data);
  it("says what the site is and links its main pages and biggest bands", () => {
    expect(txt.startsWith("# STAGEDIVE\n\n> STAGEDIVE is a fanzine that plays")).toBe(true);
    expect(txt).toContain("- [Metallica](https://stagedive.example/artists/metallica): 12 full concerts");
    expect(txt).toContain("- [Pixies](https://stagedive.example/artists/pixies): 1 full concert");
    expect(txt).toContain("- [The 1990s](https://stagedive.example/decades/1990s): 25 full concerts");
    expect(txt).toContain("(https://stagedive.example/llms-full.txt)");
    expect(txt).not.toContain("/genres/shoegaze");
  });
  it("lists tours and concerts in the full index", () => {
    const c = concertView();
    const full = llmsFullTxt({ ...data, mostWatched: [c], latest: [c] });
    expect(full).toContain("- [Metallica: Wherever We May Roam Tour](https://stagedive.example/tours/roam): 3 full concerts");
    expect(full).toContain("- [Metallica at L.C. Walker Arena, Muskegon, US (1991, 2:22:00, setlist)](https://stagedive.example/concerts/metallica-l-c-walker-arena-1991)");
  });
  it("follows the copy rules", () => {
    for (const t of [txt, llmsFullTxt({ ...data, mostWatched: [concertView()], latest: [] })]) {
      expect(t).not.toMatch(BANNED);
      expect(youtubeOnlyWithViews(t)).toBe(true);
    }
  });
});

describe("Markdown copies", () => {
  const c = concertView({ writeUp: "A night in Michigan." });
  const notes = concertNotes({ concert: c, band: { slug: "metallica", name: "Metallica" }, siblings: [], setlist, decade: { label: "1990s", count: 4 } });
  const md = concertMarkdown(c, setlist, notes);
  it("gives a concert's lead, facts, write-up, setlist with deep links, notes and questions", () => {
    expect(md.startsWith(`# ${c.title}\n\nMetallica live at L.C. Walker Arena`)).toBe(true);
    expect(md).toContain("- **Band:** [Metallica](https://stagedive.example/artists/metallica)");
    expect(md).toContain("- **Played:** 1991-11-01");
    expect(md).toContain("- **Views on YouTube:** 2,400,000");
    expect(md).toContain("## About this concert\n\nA night in Michigan.");
    expect(md).toContain("2. [5:15](https://stagedive.example/concerts/metallica-l-c-walker-arena-1991?t=315) Creeping Death");
    expect(md).toContain("3. [11:40](https://stagedive.example/concerts/metallica-l-c-walker-arena-1991?t=700) Unidentified song");
    expect(md).toContain("Last Caress (Misfits)");
    expect(md).toContain("- One of 4 concerts from [the 1990s](https://stagedive.example/decades/1990s) here.");
    expect(md).toContain("### What songs did Metallica play?");
    expect(md).toContain("Source: STAGEDIVE, https://stagedive.example/concerts/metallica-l-c-walker-arena-1991");
  });
  it("gives a band's lead, facts, links elsewhere, concerts and questions", () => {
    const band = { name: "Metallica", slug: "metallica", bio: "Thrash metal from LA.", origin: "Los Angeles, US", bornYear: null, label: "Blackened", aka: null, sameAs: ["https://musicbrainz.org/artist/65f4f0c5"] };
    const out = bandMarkdown(band, [c], [["One"]]);
    expect(out.startsWith("# Metallica: full concerts\n\nSTAGEDIVE has 1 full concert by Metallica")).toBe(true);
    expect(out).toContain("- **Label:** Blackened");
    expect(out).toContain("## About\n\nThrash metal from LA.");
    expect(out).toContain("## Elsewhere\n\n- https://musicbrainz.org/artist/65f4f0c5");
    expect(out).toContain("### Where can I watch Metallica full concerts?");
    expect(out).not.toContain("Born");
  });
  it("follows the copy rules", () => {
    expect(md).not.toMatch(BANNED);
    expect(youtubeOnlyWithViews(md)).toBe(true);
  });
});
