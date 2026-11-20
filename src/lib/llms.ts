// Plain-text views of the site for AI assistants (owner, 19 Nov 2026: be found by every LLM).
// - /llms.txt: what the site is and where its main pages are (llmstxt.org format).
// - /llms-full.txt: every band, venue, genre, decade and tour with its page, the most watched and the
//   newest concerts.
// - /concerts/<slug>.md and /artists/<slug>.md: one page as clean Markdown (facts, write-up, setlist,
//   concert notes, questions and answers), easier for a model to read and quote than the HTML page.
// All built from the database at request time (cached for a while), so new concerts, setlists and
// bios show up here by themselves. Copy rules as everywhere (src/lib/answers.ts).
// Pure functions, tested in tests/llms.test.ts.
import { bandAnswers, bandSongsAnswers, bandStatLines, bandStatsFor, concertAnswers, positionLabel, songAnswers, venueYearAnswers, type QA } from "./answers";
import { bandSongsPath, songPath, songTally, type Song } from "./songs";
import { noteText, type ConcertNote, type NotePart } from "./concert-notes";
import { formatDuration } from "./format";
import { startAtPath } from "./player/start-time";
import { abs, bestListIsStrong, venueYearIsStrong, venueYearName } from "./seo";
import { venueYearPath, type VenueYear, type VenueYearLink } from "./venue-years";
import { bestHeading, bestLead, bestPath, bestQuestions, rankedName, type BestList } from "./best";
import { placeLine, SITE_NAME } from "./site";
import { plural } from "./text";
import { BOOTLEG_EXPLAINED, bootlegCredit, bootlegNote, FAN_SECTION_TITLE, type BootlegMark } from "./bootlegs";

export const SITE_SUMMARY =
  "STAGEDIVE is a fanzine that plays: full rock concerts (classic rock, hard rock, punk, post-punk, new wave, indie, alternative, grunge, metal, garage, shoegaze, stoner, emo and post-hardcore, plus trip hop, electronic rock and big beat, art pop and experimental), the whole show by one band, from official festival, broadcaster, band and label channels first, then bootlegs shared by fan channels (marked as such). Every concert plays on the site, in the player on its own page, organised by band, festival and room, decade, genre and tour, with the setlist (click a song to jump to it) where it is known.";

interface Named {
  slug: string;
  name: string;
  concerts: number;
}

const count = (n: number) => plural(n, "full concert");

/** A band's songs played live, for the full index (src/lib/queries.ts songCatalogue). */
export interface SongCatalogueBand {
  slug: string;
  name: string;
  setlists: number;
  songs: { slug: string; title: string; versions: number }[];
}

export interface LlmsData {
  bands: Named[];
  venues: Named[];
  genres: { slug: string; name: string; count: number }[];
  decades: { label: string; count: number }[];
  tours: { slug: string; name: string; count: number; artist: { name: string } | null }[];
  /** Every place and year with concerts (src/lib/venue-years.ts); only strong ones are listed. */
  venueYears?: VenueYear[];
  /** The "best of" rankings (src/lib/best.ts); only strong ones are listed. */
  best?: { slug: string; title: string; count: number }[];
}

export function llmsTxt(data: LlmsData): string {
  const top = <T extends { concerts: number }>(xs: T[], n: number) => [...xs].sort((a, b) => b.concerts - a.concerts).slice(0, n);
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_SUMMARY}`,
    "",
    "Each concert page gives the band, where and when it was played, its length, genres, tour, a short write-up when there is one, the setlist with the time each song starts when known, and notes such as other nights by the same band at the same place. Concerts are only listed while the video is public and embeddable. Most concerts are official (festival, broadcaster, band and label channels); a few are bootlegs: complete shows filmed professionally (TV or pro-shot footage), not official releases, shared by fan channels, always marked \"bootleg\", listed after the official concerts and left out of the rankings; when an official version of the same concert is listed, the bootleg is withdrawn. A Markdown copy of a concert or band page is at the same address with `.md` added.",
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
    ...(data.best?.some((b) => bestListIsStrong(b.count))
      ? [`- [Most watched](${abs("/best")}): rankings of the most watched concerts, overall, by decade, by genre and by kind of place, by views on YouTube`]
      : []),
    "- Festival and venue years: every festival or venue with two or more concerts played there in one year has its own page at `/venues/<place>/<year>`, e.g. every concert from one edition of a festival",
    "- Songs played live: each band with setlists has a list of the songs it plays live at `/songs/<band>`, and every song a page with every live version at `/songs/<band>/<song>` (each version starts the concert at the song)",
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
  /** A bootleg is marked in every list (owner, 20 Nov 2026). */
  bootleg?: BootlegMark;
}

const concertLine = (c: ConcertLine) => {
  const where = placeLine(c);
  const facts = [c.performedYear, formatDuration(c.durationSeconds), c.hasSetlist ? "setlist" : null, c.bootleg ? "bootleg" : null].filter(Boolean).join(", ");
  return `- [${c.credits}${where ? ` at ${where}` : ""} (${facts})](${abs(`/concerts/${c.slug}`)})`;
};

/** Songs most played live across the site, listed in the full index. */
export const LLMS_TOP_SONGS = 200;

/** The full index's song sections: every band's songs page, then the songs with the most live versions. */
function songSections(bands: SongCatalogueBand[]): string[] {
  if (!bands.length) return [];
  const top = bands
    .flatMap((b) => b.songs.filter((s) => s.versions >= 2).map((s) => ({ ...s, band: b })))
    .sort((a, b) => b.versions - a.versions || a.title.localeCompare(b.title))
    .slice(0, LLMS_TOP_SONGS);
  return [
    `## Songs played live (${plural(bands.length, "band")})`,
    "",
    ...bands.map((b) => `- [${b.name}: songs played live](${abs(bandSongsPath(b.slug))}): ${plural(b.songs.length, "song")}, ${plural(b.setlists, "setlist")}`),
    "",
    ...(top.length
      ? ["## Most played songs live", "", ...top.map((s) => `- [${s.title} by ${s.band.name}](${abs(songPath(s.band.slug, s.slug))}): ${plural(s.versions, "live version")}`), ""]
      : []),
  ];
}

/** The full index's "best of" rankings with ten concerts or more. */
function bestSection(lists: { slug: string; title: string; count: number }[]): string[] {
  const strong = lists.filter((l) => bestListIsStrong(l.count));
  if (!strong.length) return [];
  return [`## Rankings by views on YouTube (${strong.length})`, "", ...strong.map((l) => `- [${l.title}](${abs(bestPath(l.slug))}): top ${l.count}`), ""];
}

/** The full index's festival and venue years with two or more concerts, newest first. */
function venueYearSection(years: VenueYear[]): string[] {
  const strong = years.filter((y) => venueYearIsStrong(y.count)).sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
  if (!strong.length) return [];
  return [
    `## Festival and venue years (${strong.length})`,
    "",
    ...strong.map((y) => `- [${venueYearName(y.name, y.year)}](${abs(venueYearPath(y.slug, y.year))}): ${count(y.count)}`),
    "",
  ];
}

export function llmsFullTxt(data: LlmsData & { songs?: SongCatalogueBand[]; mostWatched: ConcertLine[]; latest: ConcertLine[] }): string {
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
    ...bestSection(data.best ?? []),
    ...venueYearSection(data.venueYears ?? []),
    ...songSections(data.songs ?? []),
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
  bootleg?: BootlegMark;
}

type SetlistForMd = { tracks: { time: number | null; artist: string | null; title: string; unidentified: boolean }[] } | null;

export function concertMarkdown(
  c: ConcertForMd,
  setlist: SetlistForMd,
  notes: ConcertNote[] = [],
  /** Setlist title -> its song page (src/lib/songs.ts). */
  songLinks: Record<string, string> = {},
  /** The other concerts from the same place and year (src/lib/venue-years.ts). */
  venueYear: VenueYearLink | null = null,
): string {
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
    ...(c.bootleg
      ? ([["Source", `Bootleg, ${bootlegCredit(c.bootleg.from)}. ${BOOTLEG_EXPLAINED}`]] as [string, string][])
      : ([["Channel", `${c.channel.name}${c.channel.isOfficial ? " (official)" : ""}`]] as [string, string][])),
    ["Watch", abs(`/concerts/${c.slug}`)],
  ];
  const answers = concertAnswers(c, setlist);
  const lines = [`# ${c.title}`, "", answers.lead, "", ...facts.filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${v}`), ""];
  if (c.writeUp) lines.push("## About this concert", "", c.writeUp, "");
  if (setlist?.tracks.length) {
    lines.push("## Setlist", "");
    setlist.tracks.forEach((t, i) => {
      const time = t.time !== null ? `[${formatDuration(t.time)}](${abs(startAtPath(c.slug, t.time))}) ` : "";
      const song = t.unidentified ? "Unidentified song" : songLinks[t.title] ? link(t.title, songLinks[t.title]) : t.title;
      lines.push(`${i + 1}. ${time}${song}${t.artist && !c.artists.some((a) => a.name.toLowerCase() === t.artist!.toLowerCase()) ? ` (${t.artist})` : ""}`);
    });
    lines.push("");
  }
  if (notes.length) lines.push("## Concert notes", "", ...notes.map((n) => `- ${noteMarkdown(n)}`), "");
  if (venueYear?.others.length) {
    lines.push(
      `## More from ${venueYear.name}`,
      "",
      ...venueYear.others.map((o) => `- ${link(o.credits, `/concerts/${o.slug}`)}`),
      "",
      `Every concert from ${venueYear.name} (${venueYear.count}): ${abs(venueYear.path)}`,
      "",
    );
  }
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
  const stats = bandStatLines(bandStatsFor(band.name, concerts, setlists));
  const songs = songTally(setlists);
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
    ...concerts.filter((c) => !c.bootleg).map(concertLine),
    "",
    // Bootlegs after the official concerts, said for what they are (owner, 20 Nov 2026).
    ...(concerts.some((c) => c.bootleg)
      ? [`## ${FAN_SECTION_TITLE} (bootlegs)`, "", bootlegNote(concerts.filter((c) => c.bootleg).length, concerts.some((c) => !c.bootleg)), "", ...concerts.filter((c) => c.bootleg).map(concertLine), ""]
      : []),
    ...(stats.length ? ["## Live statistics", "", ...stats.map((l) => `- **${l.label}:** ${l.value}`), ""] : []),
    ...(songs.length
      ? [
          "## Songs played live",
          "",
          ...songs.slice(0, BAND_MD_SONGS).map((s) => `- [${s.title}](${abs(songPath(band.slug, s.slug))}): ${plural(s.count, "setlist")}`),
          ...(songs.length > BAND_MD_SONGS ? ["", `Every song: ${abs(bandSongsPath(band.slug))}`] : []),
          "",
        ]
      : []),
    ...qaMarkdown(answers.questions),
    `Source: ${SITE_NAME}, ${abs(`/artists/${band.slug}`)}`,
    "",
  ].join("\n");
}

/** Songs listed in a band's Markdown copy (the rest are on its songs page). */
export const BAND_MD_SONGS = 30;

/** A song page as Markdown: lead, facts, every version with a link that starts the concert at the song, questions. */
export function songMarkdown(
  band: { slug: string; name: string },
  song: Song,
  setlists: number,
  others: { slug: string; title: string; versions: number }[] = [],
): string {
  const answers = songAnswers(band, song, setlists);
  const facts: [string, string | null][] = [
    ["Band", `[${band.name}](${abs(`/artists/${band.slug}`)})`],
    ["Live versions", String(song.versions.length)],
    ["Oldest here", song.oldest ? versionLabel(song.oldest) : null],
    ["Newest here", song.newest && song.versions.length > 1 ? versionLabel(song.newest) : null],
    ["Place in the set", song.position ? positionLabel(song.position) : null],
    ["Length", song.averageLengthSeconds !== null ? `${formatDuration(song.averageLengthSeconds)}${song.timedVersions > 1 ? ` on average (${song.timedVersions} versions)` : ""}` : null],
    ["Credited to", song.creditedTo],
    ["Played at", song.places.map((p) => `[${p.name}](${abs(`/venues/${p.slug}`)})`).join(", ") || null],
    ["Decades", song.decades.map((d) => `[${d.label}](${abs(`/decades/${d.label}`)})`).join(", ") || null],
    ["Tours", song.tours.map((t) => `[${t.name}](${abs(`/tours/${t.slug}`)})`).join(", ") || null],
  ];
  return [
    `# ${song.title} by ${band.name}: every live version`,
    "",
    answers.lead,
    "",
    ...facts.filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${v}`),
    "",
    song.versions.some((v) => v.concert.bootleg) ? "## Live versions, official first, then bootlegs; newest first" : "## Live versions, newest first",
    "",
    ...song.versions.map(
      (v, i) =>
        `${i + 1}. [${versionLabel(v)}](${abs(v.href)})${v.concert.bootleg ? " (bootleg)" : ""}: song ${v.position} of ${v.of}` +
        `${v.time !== null ? `, starts at ${formatDuration(v.time)}` : ""}${v.lengthSeconds !== null ? `, ${formatDuration(v.lengthSeconds)} long` : ""}`,
    ),
    "",
    ...(others.length
      ? ["## More songs by " + band.name, "", ...others.map((o) => `- [${o.title}](${abs(songPath(band.slug, o.slug))}): ${plural(o.versions, "live version")}`), ""]
      : []),
    ...qaMarkdown(answers.questions),
    `Source: ${SITE_NAME}, ${abs(songPath(band.slug, song.slug))}`,
    "",
  ].join("\n");
}

/** A band's songs played live as Markdown. */
export function bandSongsMarkdown(band: { slug: string; name: string }, songs: Song[], setlists: number): string {
  const answers = bandSongsAnswers(band, songs.map((s) => ({ title: s.title, count: s.versions.length })), setlists);
  return [
    `# ${band.name}: songs played live`,
    "",
    answers.lead,
    "",
    `- **Band:** [${band.name}](${abs(`/artists/${band.slug}`)})`,
    `- **Songs:** ${songs.length}`,
    `- **Setlists:** ${setlists}`,
    "",
    "## Songs, most played first",
    "",
    ...songs.map(
      (s) =>
        `- [${s.title}](${abs(songPath(band.slug, s.slug))}): ${plural(s.versions.length, "live version")}` +
        `${s.oldest && s.newest && s.oldest !== s.newest ? `, ${yearOrName(s.oldest)} to ${yearOrName(s.newest)}` : ""}`,
    ),
    "",
    ...qaMarkdown(answers.questions),
    `Source: ${SITE_NAME}, ${abs(bandSongsPath(band.slug))}`,
    "",
  ].join("\n");
}

/** A version's concert in words: "Pinkpop 1996". */
function versionLabel(v: Song["versions"][number]): string {
  const c = v.concert;
  return [c.venue?.name ?? c.city, c.performedYear].filter(Boolean).join(" ") || c.title;
}
const yearOrName = (v: Song["versions"][number]) => String(v.concert.performedYear ?? versionLabel(v));

/** Plain text of the notes, joined (for descriptions). */
export const notesText = (notes: ConcertNote[]) => notes.map(noteText).join(" ");

// ---- Festival and venue years (src/lib/venue-years.ts) ----

/** A festival-year or venue-year page as Markdown: lead, facts, every concert, other years, questions. */
export function venueYearMarkdown(
  venue: { slug: string; name: string; city: string | null; country: string | null },
  year: number,
  concerts: (ConcertForMd & { performedOn: Date | null; viewCount: number })[],
  festival: boolean,
  otherYears: { year: number; count: number }[] = [],
): string {
  const name = venueYearName(venue.name, year);
  const path = venueYearPath(venue.slug, year);
  const answers = venueYearAnswers(venue, name, year, concerts, festival);
  const others = otherYears.filter((y) => y.year !== year && venueYearIsStrong(y.count));
  return [
    `# ${name}: full concerts`,
    "",
    answers.lead,
    "",
    `- **Place:** [${venue.name}](${abs(`/venues/${venue.slug}`)})${[venue.city, venue.country].some(Boolean) ? `, ${[venue.city, venue.country].filter(Boolean).join(", ")}` : ""}`,
    `- **Year:** ${year}`,
    `- **Full concerts:** ${concerts.length}`,
    "",
    "## Concerts",
    "",
    ...concerts.map(concertLine),
    "",
    ...(others.length
      ? [`## Other years at ${venue.name}`, "", ...others.map((y) => `- [${venueYearName(venue.name, y.year)}](${abs(venueYearPath(venue.slug, y.year))}): ${count(y.count)}`), ""]
      : []),
    ...qaMarkdown(answers.questions),
    `Source: ${SITE_NAME}, ${abs(path)}`,
    "",
  ].join("\n");
}

// ---- "Best of" rankings (src/lib/best.ts) ----

/** A ranking as Markdown: lead, every concert in order with its views, questions. */
export function bestMarkdown(list: BestList, concerts: (ConcertLine & { viewCount: number; artists: { name: string; role: "MAIN" | "WITH" }[] })[]): string {
  const path = bestPath(list.slug);
  return [
    `# ${bestHeading(list)}`,
    "",
    bestLead(list, concerts),
    "",
    "## The ranking, most watched first",
    "",
    ...concerts.map((c, i) => `${i + 1}. [${rankedName(c)}](${abs(`/concerts/${c.slug}`)}): ${c.viewCount.toLocaleString("en-GB")} views on YouTube, ${formatDuration(c.durationSeconds)}${c.hasSetlist ? ", setlist" : ""}`),
    "",
    ...qaMarkdown(bestQuestions(list, concerts)),
    `Every ranking: ${abs("/best")}`,
    "",
    `Source: ${SITE_NAME}, ${abs(path)}`,
    "",
  ].join("\n");
}
