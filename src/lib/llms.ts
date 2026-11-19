// Plain-text views of the site for AI assistants (owner, 19 Nov 2026: be found by every LLM).
// - /llms.txt: what the site is and where its main pages are (llmstxt.org format).
// - /llms-full.txt: every band, venue, genre, decade and tour with its page, the most watched and the
//   newest concerts.
// - /concerts/<slug>.md and /artists/<slug>.md: one page as clean Markdown (facts, write-up, setlist,
//   concert notes, questions and answers), easier for a model to read and quote than the HTML page.
// All built from the database at request time (cached for a while), so new concerts, setlists and
// bios show up here by themselves. Copy rules as everywhere (src/lib/answers.ts).
// Pure functions, tested in tests/llms.test.ts.
import { bandAnswers, concertAnswers, type QA } from "./answers";
import { noteText, type ConcertNote, type NotePart } from "./concert-notes";
import { formatDuration } from "./format";
import { startAtPath } from "./player/start-time";
import { abs } from "./seo";
import { placeLine, SITE_NAME } from "./site";
import { plural } from "./text";

export const SITE_SUMMARY =
  "STAGEDIVE is a fanzine that plays: full rock concerts (classic rock, hard rock, punk, post-punk, new wave, indie, alternative, grunge, metal, garage, shoegaze, stoner, emo and post-hardcore), the whole show by one band, from official festival, broadcaster, band and label channels. Every concert plays on the site, in the player on its own page, organised by band, festival and room, decade, genre and tour, with the setlist (click a song to jump to it) where it is known.";

interface Named {
  slug: string;
  name: string;
  concerts: number;
}

const count = (n: number) => plural(n, "full concert");

export interface LlmsData {
  bands: Named[];
  venues: Named[];
  genres: { slug: string; name: string; count: number }[];
  decades: { label: string; count: number }[];
  tours: { slug: string; name: string; count: number; artist: { name: string } | null }[];
}

export function llmsTxt(data: LlmsData): string {
  const top = <T extends { concerts: number }>(xs: T[], n: number) => [...xs].sort((a, b) => b.concerts - a.concerts).slice(0, n);
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_SUMMARY}`,
    "",
    "Each concert page gives the band, where and when it was played, its length, genres, tour, a short write-up when there is one, the setlist with the time each song starts when known, and notes such as other nights by the same band at the same place. Concerts are only listed while the video is public and embeddable. A Markdown copy of a concert or band page is at the same address with `.md` added.",
    "",
    "## Main pages",
    "",
    `- [Every concert](${abs("/concerts")}): every concert, newest first, with search and sorting`,
    `- [Bands](${abs("/artists")}): every band with a full concert here`,
    `- [Fields and rooms](${abs("/venues")}): festivals and venues with their concerts`,
    `- [Decades](${abs("/decades")}): concerts by the decade they were played`,
    `- [Genres](${abs("/genres")}): concerts by genre`,
    `- [Tours](${abs("/tours")}): concerts by tour`,
    `- [Find your next band](${abs("/map")}): bands similar to one you like`,
    "",
    "## Most featured bands",
    "",
    ...top(data.bands, 50).map((a) => `- [${a.name}](${abs(`/artists/${a.slug}`)}): ${count(a.concerts)}`),
    "",
    "## Festivals and venues",
    "",
    ...top(data.venues, 30).map((v) => `- [${v.name}](${abs(`/venues/${v.slug}`)}): ${count(v.concerts)}`),
    "",
    "## Decades",
    "",
    ...data.decades.map((d) => `- [The ${d.label}](${abs(`/decades/${d.label}`)}): ${count(d.count)}`),
    "",
    "## Genres",
    "",
    ...data.genres.filter((g) => g.count > 0).map((g) => `- [${g.name}](${abs(`/genres/${g.slug}`)}): ${count(g.count)}`),
    "",
    "## Optional",
    "",
    `- [Full index](${abs("/llms-full.txt")}): every band, venue, genre, decade and tour, the most watched and the most recently published concerts`,
    `- [Sitemap](${abs("/sitemap.xml")})`,
    "",
  ].join("\n");
}

interface ConcertLine {
  slug: string;
  credits: string;
  venue: { name: string } | null;
  city: string | null;
  country: string | null;
  performedYear: number | null;
  durationSeconds: number;
  hasSetlist: boolean;
}

const concertLine = (c: ConcertLine) => {
  const where = placeLine(c);
  const facts = [c.performedYear, formatDuration(c.durationSeconds), c.hasSetlist ? "setlist" : null].filter(Boolean).join(", ");
  return `- [${c.credits}${where ? ` at ${where}` : ""} (${facts})](${abs(`/concerts/${c.slug}`)})`;
};

export function llmsFullTxt(data: LlmsData & { mostWatched: ConcertLine[]; latest: ConcertLine[] }): string {
  return [
    `# ${SITE_NAME}: full index`,
    "",
    `> ${SITE_SUMMARY}`,
    "",
    `## Bands (${data.bands.length})`,
    "",
    ...data.bands.map((a) => `- [${a.name}](${abs(`/artists/${a.slug}`)}): ${count(a.concerts)}`),
    "",
    `## Festivals and venues (${data.venues.length})`,
    "",
    ...data.venues.map((v) => `- [${v.name}](${abs(`/venues/${v.slug}`)}): ${count(v.concerts)}`),
    "",
    "## Decades",
    "",
    ...data.decades.map((d) => `- [The ${d.label}](${abs(`/decades/${d.label}`)}): ${count(d.count)}`),
    "",
    "## Genres",
    "",
    ...data.genres.filter((g) => g.count > 0).map((g) => `- [${g.name}](${abs(`/genres/${g.slug}`)}): ${count(g.count)}`),
    "",
    ...(data.tours.length
      ? [
          `## Tours (${data.tours.length})`,
          "",
          ...data.tours.map((t) => `- [${t.artist ? `${t.artist.name}: ` : ""}${t.name}](${abs(`/tours/${t.slug}`)}): ${count(t.count)}`),
          "",
        ]
      : []),
    "## Most watched concerts",
    "",
    ...data.mostWatched.map(concertLine),
    "",
    "## Recently published",
    "",
    ...data.latest.map(concertLine),
    "",
  ].join("\n");
}

/** Questions and answers as Markdown (src/lib/answers.ts). */
function qaMarkdown(questions: QA[]): string[] {
  return questions.length ? ["## Questions and answers", "", ...questions.flatMap((q) => [`### ${q.question}`, "", q.answer, ""])] : [];
}

/** A concert note with its links as Markdown links. */
export function noteMarkdown(note: ConcertNote): string {
  return note.parts.map((p: NotePart) => (typeof p === "string" ? p : `[${p.text}](${abs(p.href)})`)).join("");
}

interface ConcertForMd extends ConcertLine {
  title: string;
  writeUp: string | null;
  viewCount: number;
  performedOn: Date | null;
  genres: { slug: string; name: string }[];
  venue: { slug: string; name: string } | null;
  venueKind: { slug: string; name: string } | null;
  tour: { slug: string; name: string } | null;
  channel: { name: string; isOfficial: boolean };
  artists: { name: string; slug: string; hasPage: boolean; role: "MAIN" | "WITH"; creditNote: string | null }[];
}

type SetlistForMd = { tracks: { time: number | null; artist: string | null; title: string; unidentified: boolean }[] } | null;

export function concertMarkdown(c: ConcertForMd, setlist: SetlistForMd, notes: ConcertNote[] = []): string {
  const link = (text: string, path: string) => `[${text}](${abs(path)})`;
  const facts: [string, string | null | undefined][] = [
    ["Band", c.artists.map((a) => `${a.hasPage ? link(a.name, `/artists/${a.slug}`) : a.name}${a.creditNote ? ` (${a.creditNote})` : ""}`).join(", ")],
    ["Where", [c.venue ? link(c.venue.name, `/venues/${c.venue.slug}`) : null, c.city, c.country].filter(Boolean).join(", ")],
    ["Kind of place", c.venueKind?.name],
    ["Played", c.performedOn ? new Date(c.performedOn).toISOString().slice(0, 10) : c.performedYear ? String(c.performedYear) : null],
    ["Tour", c.tour ? link(c.tour.name, `/tours/${c.tour.slug}`) : null],
    ["Genres", c.genres.map((g) => link(g.name, `/genres/${g.slug}`)).join(", ")],
    ["Length", formatDuration(c.durationSeconds)],
    ["Views on YouTube", c.viewCount.toLocaleString("en-GB")],
    ["Channel", `${c.channel.name}${c.channel.isOfficial ? " (official)" : ""}`],
    ["Watch", abs(`/concerts/${c.slug}`)],
  ];
  const answers = concertAnswers(c, setlist);
  const lines = [`# ${c.title}`, "", answers.lead, "", ...facts.filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${v}`), ""];
  if (c.writeUp) lines.push("## About this concert", "", c.writeUp, "");
  if (setlist?.tracks.length) {
    lines.push("## Setlist", "");
    setlist.tracks.forEach((t, i) => {
      const time = t.time !== null ? `[${formatDuration(t.time)}](${abs(startAtPath(c.slug, t.time))}) ` : "";
      const song = t.unidentified ? "Unidentified song" : t.title;
      lines.push(`${i + 1}. ${time}${song}${t.artist && !c.artists.some((a) => a.name.toLowerCase() === t.artist!.toLowerCase()) ? ` (${t.artist})` : ""}`);
    });
    lines.push("");
  }
  if (notes.length) lines.push("## Concert notes", "", ...notes.map((n) => `- ${noteMarkdown(n)}`), "");
  lines.push(...qaMarkdown(answers.questions));
  lines.push(`Source: ${SITE_NAME}, ${abs(`/concerts/${c.slug}`)}`, "");
  return lines.join("\n");
}

export function bandMarkdown(
  band: { name: string; slug: string; bio: string | null; origin: string | null; bornYear: number | null; label: string | null; aka: string | null; sameAs?: string[] },
  concerts: (ConcertForMd & { viewCount: number })[],
  setlists: string[][] = [],
): string {
  const answers = bandAnswers(band, concerts, setlists);
  const facts: [string, string | null][] = [
    ["From", band.origin],
    ["Born", band.bornYear ? String(band.bornYear) : null],
    ["Label", band.label],
    ["Also written", band.aka],
    [`Full concerts on ${SITE_NAME}`, String(concerts.length)],
    ["Page", abs(`/artists/${band.slug}`)],
  ];
  return [
    `# ${band.name}: full concerts`,
    "",
    answers.lead,
    "",
    ...facts.filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${v}`),
    "",
    ...(band.bio ? ["## About", "", band.bio, ""] : []),
    ...(band.sameAs?.length ? ["## Elsewhere", "", ...band.sameAs.map((u) => `- ${u}`), ""] : []),
    "## Concerts",
    "",
    ...concerts.map(concertLine),
    "",
    ...qaMarkdown(answers.questions),
    `Source: ${SITE_NAME}, ${abs(`/artists/${band.slug}`)}`,
    "",
  ].join("\n");
}

/** Plain text of the notes, joined (for descriptions). */
export const notesText = (notes: ConcertNote[]) => notes.map(noteText).join(" ");
