// Answers for answer engines (AEO, owner 19 Nov 2026): Google snippets and AI Overviews, voice
// assistants, ChatGPT / Perplexity / Claude quoting a source. Each page gets one answer-first lead
// sentence, and concert, band and venue pages a few questions with short answers. Everything is
// written only from data we hold: when a fact is missing there is no sentence or question about it.
// Owner choice (from OpenDecks): concert pages show the lead only (their questions are in the
// Markdown copy); band and venue pages show the questions in a closed FAQ at the bottom, and only
// those visible questions become FAQPage structured data.
// Dates are when the concert was played (performedOn / performedYear), never when the video went
// online. Copy rules (owner): never "free", "archive", "upload", "full-length"; "YouTube" only next to
// a view count. Pure functions, tested in tests/answers.test.ts.
import { formatDuration } from "./format";
import { placeLine, SITE_NAME } from "./site";
import { bandStats, type BandStats, type UsualSong } from "./band-stats";
import type { Song, TypicalPosition } from "./songs";
import { listWords, plural, quoted, spokenDuration, spokenTotal, topCounts, whenWords } from "./text";

export interface QA {
  question: string;
  answer: string;
}

export interface Answers {
  /** The answer-first lead sentence for the top of the page. */
  lead: string;
  questions: QA[];
}

interface ConcertForAnswers {
  title: string;
  credits: string;
  venue: { name: string } | null;
  city: string | null;
  country: string | null;
  venueKind: { slug: string; name: string } | null;
  genres: { name: string }[];
  tour: { name: string } | null;
  performedYear: number | null;
  performedOn: Date | null;
  durationSeconds: number;
  viewCount: number;
  channel: { name: string; isOfficial: boolean };
}

interface SongForAnswers {
  time: number | null;
  title: string;
  unidentified: boolean;
}

type SetlistForAnswers = { tracks: SongForAnswers[] } | null;

const tourWords = (name: string) => (/\btour\b/i.test(name) ? `the ${name.replace(/^the\s+/i, "")}` : `the ${name} tour`);
const views = (n: number) => `${n.toLocaleString("en-GB")} views on YouTube`;
/** "Pinkpop 1993", "Paradiso", "1991", or the video title when nothing else is known. */
const gigName = (c: { title: string; venue: { name: string } | null; city: string | null; performedYear: number | null }) =>
  [c.venue?.name ?? c.city, c.performedYear].filter(Boolean).join(" ") || c.title;

/** "Official concert from Metallica." when the channel is official; otherwise nothing. */
export function officialLine(channel: { name: string; isOfficial: boolean }): string {
  return channel.isOfficial ? `Official concert from ${channel.name}.` : "";
}

export function concertAnswers(c: ConcertForAnswers, setlist: SetlistForAnswers): Answers {
  const place = placeLine(c);
  const when = whenWords(c);
  const genres = c.genres.map((g) => g.name.toLowerCase());
  const songs = setlist?.tracks ?? [];
  const known = songs.filter((t) => !t.unidentified);
  const opener = known[0];
  const closer = known.length > 1 ? known[known.length - 1] : undefined;

  // Facts only (owner, 19 Nov 2026): the write-up tells the story, the lead must not repeat it.
  const lead =
    [
      `${c.credits} · full concert`,
      when?.replace(/^(on|in)\s+/, ""),
      place,
      c.tour?.name,
      spokenDuration(c.durationSeconds),
      songs.length ? `${plural(songs.length, "song")}${opener ? `, opening with ${quoted(opener.title)}` : ""}` : "",
      c.channel.isOfficial ? `official concert from ${c.channel.name}` : "",
    ]
      .filter(Boolean)
      .join(" · ") + ".";

  const questions: QA[] = [];
  if (place || when) {
    questions.push({
      question: `When and where did ${c.credits} play this concert?`,
      answer: `${place ? `At ${place}` : "The place is not known"}${when ? `, ${when}` : ""}${c.venueKind ? ` (${c.venueKind.name.toLowerCase()})` : ""}.`,
    });
  }
  questions.push({
    question: `How long is the concert?`,
    answer: `${spokenDuration(c.durationSeconds)} (${formatDuration(c.durationSeconds)}), the whole show.`,
  });
  if (songs.length) {
    const first = known.slice(0, 3).map((t) => quoted(t.title));
    questions.push({
      question: `What songs did ${c.credits} play?`,
      answer:
        `${plural(songs.length, "song")}${first.length ? `, opening with ${listWords(first)}` : ""}` +
        `${closer && known.length > 3 ? ` and closing with ${quoted(closer.title)}` : ""}.` +
        ` The full setlist${songs.some((t) => t.time !== null) ? ", with the time each song starts," : ""} is on the concert page.`,
    });
  }
  if (c.tour) questions.push({ question: `Which tour was it part of?`, answer: `${c.tour.name}.` });
  if (genres.length) questions.push({ question: `What kind of rock is it?`, answer: `${listWords(c.genres.map((g) => g.name))}.` });
  questions.push({
    question: `Where can I watch ${c.credits}'s full concert?`,
    answer: `On ${SITE_NAME}, in full, in the player on the concert page${c.channel.isOfficial ? `, from the official ${c.channel.name} channel` : ""}. No account needed.`,
  });
  return { lead, questions };
}

interface ListConcert {
  slug: string;
  title: string;
  credits: string;
  artists: { name: string; role: "MAIN" | "WITH"; hasPage: boolean }[];
  venue: { name: string } | null;
  city: string | null;
  venueKind: { slug: string } | null;
  genres: { name: string }[];
  tour: { name: string } | null;
  performedYear: number | null;
  durationSeconds: number;
  viewCount: number;
  hasSetlist: boolean;
}

const yearsOf = (cs: ListConcert[]) => cs.map((c) => c.performedYear).filter((y): y is number => y !== null);
const spanWords = (years: number[], from = "between", to = "and") => {
  if (!years.length) return "";
  const [a, b] = [Math.min(...years), Math.max(...years)];
  return a === b ? `in ${a}` : `${from} ${a} ${to} ${b}`;
};
const mostWatched = (cs: ListConcert[]) => [...cs].sort((a, b) => b.viewCount - a.viewCount)[0];
const totalTime = (cs: ListConcert[]) => spokenTotal(cs.reduce((n, c) => n + c.durationSeconds, 0));
const mainBands = (cs: ListConcert[]) => cs.flatMap((c) => c.artists.filter((a) => a.role === "MAIN").map((a) => a.name));
const withSetlists = (cs: ListConcert[]) => cs.filter((c) => c.hasSetlist).length;

export function bandAnswers(
  band: { name: string; origin: string | null },
  concerts: ListConcert[],
  /** Song titles of each of the band's setlists (for "most played live"). */
  setlists: string[][] = [],
): Answers {
  if (!concerts.length) return { lead: `${band.name} has no concert on ${SITE_NAME} right now.`, questions: [] };
  const genres = topCounts(concerts.flatMap((c) => c.genres.map((g) => g.name.toLowerCase())), 3);
  const places = topCounts(concerts.map((c) => c.venue?.name).filter((x): x is string => Boolean(x)), 3);
  const years = yearsOf(concerts);
  const setlistCount = withSetlists(concerts);

  const lead =
    `${SITE_NAME} has ${plural(concerts.length, "full concert")} by ${band.name}${band.origin ? `, from ${band.origin}` : ""}: ` +
    `${totalTime(concerts)} of ${genres.length ? listWords(genres) : "live rock"}` +
    `${years.length ? `, played ${spanWords(years)}` : ""}${places.length ? `, at places such as ${listWords(places)}` : ""}. ` +
    `Every concert plays in full on its own page${setlistCount ? `, ${setlistCount === concerts.length ? "each" : `${setlistCount}`} with its setlist` : ""}.`;

  const questions: QA[] = [
    {
      question: `Where can I watch ${band.name} full concerts?`,
      answer: `On ${SITE_NAME}: ${plural(concerts.length, "full concert")} by ${band.name}, each played in full on its own page${setlistCount ? `, ${setlistCount === 1 ? "one" : setlistCount} with the setlist` : ""}.`,
    },
  ];
  const festivals = [
    ...new Set(concerts.filter((c) => c.venueKind?.slug === "festival" && c.venue).map((c) => [c.venue!.name, c.performedYear].filter(Boolean).join(" "))),
  ];
  if (festivals.length) {
    questions.push({ question: `Which festivals has ${band.name} played?`, answer: `Full festival shows here: ${listWords(festivals.slice(0, 8))}${festivals.length > 8 ? " and more" : ""}.` });
  }
  if (concerts.length > 1) {
    const top = mostWatched(concerts);
    questions.push({ question: `What is ${band.name}'s most watched concert?`, answer: `${gigName(top)}, with ${views(top.viewCount)}.` });
  }
  const dated = concerts.filter((c) => c.performedYear !== null).sort((a, b) => a.performedYear! - b.performedYear!);
  if (dated.length > 1 && dated[0].performedYear !== dated[dated.length - 1].performedYear) {
    questions.push({
      question: `What is the oldest ${band.name} concert here?`,
      answer: `${gigName(dated[0])}. The newest is ${gigName(dated[dated.length - 1])}.`,
    });
  }
  const tours = [...new Set(concerts.map((c) => c.tour?.name).filter((x): x is string => Boolean(x)))];
  if (tours.length) questions.push({ question: `Which ${band.name} tours are here?`, answer: `${listWords(tours)}.` });
  questions.push(...bandStatQuestions(band.name, bandStatsFor(band.name, concerts, setlists)));
  if (band.origin) questions.push({ question: `Where are ${band.name} from?`, answer: `${band.origin}.` });
  return { lead, questions };
}

/** The band's figures from its own (headline) concerts and its setlists (src/lib/band-stats.ts). */
export function bandStatsFor(name: string, concerts: ListConcert[], setlists: string[][]): BandStats {
  return bandStats(headlined(name, concerts), setlists);
}

/** The band's own concerts (headline), so a guest spot elsewhere does not change its figures. */
function headlined(name: string, concerts: ListConcert[]): ListConcert[] {
  const own = concerts.filter((c) => c.artists.some((a) => a.role === "MAIN" && a.name === name));
  return own.length ? own : concerts;
}

/** "“There There”: it opens 3 of the 4 setlists here." / "Most often “Airbag”: ..." */
function usualWords(u: UsualSong, verb: "opens" | "closes"): string {
  return `${u.majority ? "" : "Most often "}${quoted(u.title)}: it ${verb} ${shareWords(u.count, u.of, "setlists")} here.`;
}

/** "3 of the 4 setlists", "both setlists", "all 5 setlists". */
export function shareWords(count: number, of: number, things: string): string {
  if (count < of) return `${count} of the ${of} ${things}`;
  return of === 2 ? `both ${things}` : `all ${of} ${things}`;
}

/**
 * Questions from the band's statistics (src/lib/band-stats.ts). Each one only when its figure is
 * there, which takes at least two concerts or setlists.
 */
export function bandStatQuestions(name: string, stats: BandStats): QA[] {
  const out: QA[] = [];
  if (stats.averageSeconds !== null) {
    const l = stats.longest;
    out.push({
      question: `How long is a ${name} concert?`,
      answer:
        `The ${stats.concerts} ${name} concerts here run ${spokenDuration(stats.averageSeconds)} on average.` +
        (l ? ` The longest is ${gigName(l)} (${formatDuration(l.durationSeconds)}).` : ""),
    });
  }
  if (stats.averageSongs !== null) {
    out.push({
      question: `How many songs does ${name} play in a concert?`,
      answer: `${Math.round(stats.averageSongs)} on average, across the ${stats.setlists} setlists here.`,
    });
  }
  if (stats.opener) out.push({ question: `What song does ${name} usually open with?`, answer: usualWords(stats.opener, "opens") });
  if (stats.closer) out.push({ question: `What song does ${name} usually close with?`, answer: usualWords(stats.closer, "closes") });
  if (stats.mostPlayed.length) {
    out.push({
      question: `What are ${name}'s most played songs live?`,
      answer: `Across the ${stats.setlists} setlists here: ${listWords(stats.mostPlayed.map((s) => `${quoted(s.title)} (${plural(s.count, "setlist")})`))}.`,
    });
  }
  return out;
}

/** Figures for the band page and its Markdown copy, as label and value ("Average concert", "1:48:00"). */
export function bandStatLines(stats: BandStats): { id: string; label: string; value: string; href?: string }[] {
  const out: { id: string; label: string; value: string; href?: string }[] = [];
  if (stats.averageSeconds !== null) out.push({ id: "average-length", label: "Average concert", value: formatDuration(stats.averageSeconds) });
  if (stats.longest) {
    out.push({ id: "longest", label: "Longest concert", value: `${gigName(stats.longest)} (${formatDuration(stats.longest.durationSeconds)})`, href: `/concerts/${stats.longest.slug}` });
  }
  if (stats.averageSongs !== null) out.push({ id: "average-songs", label: "Songs per concert", value: `${Math.round(stats.averageSongs)} on average` });
  if (stats.opener) out.push({ id: "opener", label: stats.opener.majority ? "Usually opens with" : "Most often opens with", value: `${stats.opener.title} (${stats.opener.count} of ${stats.opener.of})` });
  if (stats.closer) out.push({ id: "closer", label: stats.closer.majority ? "Usually closes with" : "Most often closes with", value: `${stats.closer.title} (${stats.closer.count} of ${stats.closer.of})` });
  if (stats.years) out.push({ id: "years", label: "Years", value: `${stats.years.from} to ${stats.years.to}` });
  return out;
}

// ---- Songs played live (src/lib/songs.ts) ----

/** "Pinkpop 1996" for a version's concert. */
const versionName = (v: { concert: { title: string; venue: { name: string } | null; city: string | null; performedYear: number | null } }) => gigName(v.concert);

/** Where a song usually comes in the set, as a sentence; empty without a pattern. */
export function positionWords(p: TypicalPosition | null): string {
  if (!p) return "";
  switch (p.slot) {
    case "opener":
      return `It opened ${shareWords(p.count, p.of, "sets")} here.`;
    case "closer":
      return `It closed ${shareWords(p.count, p.of, "sets")} here.`;
    case "early":
      return "It usually comes early in the set.";
    case "middle":
      return "It usually comes in the middle of the set.";
    default:
      return "It usually comes near the end of the set.";
  }
}

/** Short label for the facts list: "Opener (3 of 4)", "Early in the set". */
export function positionLabel(p: TypicalPosition): string {
  if (p.slot === "opener") return `Opener (${p.count} of ${p.of})`;
  if (p.slot === "closer") return `Closer (${p.count} of ${p.of})`;
  return { early: "Early in the set", middle: "Middle of the set", late: "Near the end of the set" }[p.slot];
}

/** Lead and questions for a song page. `setlists` is how many of the band's concerts here have a setlist. */
export function songAnswers(band: { name: string }, song: Song, setlists: number): Answers {
  const n = song.versions.length;
  const years = song.versions.map((v) => v.concert.performedYear).filter((y): y is number => y !== null);
  const places = song.places.map((p) => p.name);
  const timed = song.versions.some((v) => v.time !== null);
  const length = song.averageLengthSeconds !== null ? `It runs ${spokenDuration(song.averageLengthSeconds)}${song.timedVersions > 1 ? " on average" : ""}.` : "";
  const lead = [
    `${quoted(song.title)} by ${band.name}: ${plural(n, "live version")} on ${SITE_NAME}` +
      `${years.length ? `, played ${spanWords(years)}` : ""}${places.length ? `, at ${listWords(places.slice(0, 3))}${places.length > 3 ? " and more" : ""}` : ""}.`,
    positionWords(song.position),
    length,
    `Each version plays on its concert page${timed ? ", starting at the song where the setlist gives its time" : ""}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const questions: QA[] = [
    {
      question: `How often does ${band.name} play ${quoted(song.title)} live?`,
      answer: `It is in ${n} of the ${setlists} ${band.name} setlists on ${SITE_NAME}.`,
    },
  ];
  if (song.oldest && song.newest) {
    questions.push({
      question: `When did ${band.name} play ${quoted(song.title)} live?`,
      answer:
        n > 1 && song.oldest !== song.newest
          ? `The oldest version here is from ${versionName(song.oldest)}, the newest from ${versionName(song.newest)}.`
          : `At ${versionName(song.newest)}.`,
    });
  }
  if (song.position) questions.push({ question: `Where in the set does ${band.name} play ${quoted(song.title)}?`, answer: positionWords(song.position) });
  if (song.averageLengthSeconds !== null) {
    questions.push({
      question: `How long is ${quoted(song.title)} live?`,
      answer: `${spokenDuration(song.averageLengthSeconds)}${song.timedVersions > 1 ? ` on average, from ${song.timedVersions} versions with times` : ""} (${formatDuration(song.averageLengthSeconds)}).`,
    });
  }
  questions.push({
    question: `Where can I watch ${band.name} play ${quoted(song.title)} live?`,
    answer: `On ${SITE_NAME}: ${n > 1 ? `each of the ${n} versions plays` : "it plays"} on its concert page${timed ? ", starting at the song where the time is known" : ""}.`,
  });
  return { lead, questions };
}

/** Lead and questions for a band's "songs played live" page. */
export function bandSongsAnswers(band: { name: string }, songs: { title: string; count: number }[], setlists: number): Answers {
  if (!songs.length) return { lead: `No ${band.name} setlist is on ${SITE_NAME} right now.`, questions: [] };
  const top = songs.filter((s) => s.count >= 2).slice(0, 5);
  const most = top.length ? ` Most played: ${listWords(top.map((s) => `${quoted(s.title)} (${s.count})`))}.` : "";
  const lead = `${plural(songs.length, "song")} ${band.name} played live in the ${plural(setlists, "setlist")} on ${SITE_NAME}.${most} Each song has its own page with every live version.`;
  const questions: QA[] = [
    { question: `How many different songs has ${band.name} played live here?`, answer: `${songs.length}, across ${plural(setlists, "setlist")}.` },
  ];
  if (top.length) {
    questions.push({
      question: `What are ${band.name}'s most played songs live?`,
      answer: `Across the ${setlists} setlists here: ${listWords(top.map((s) => `${quoted(s.title)} (${plural(s.count, "setlist")})`))}.`,
    });
  }
  return { lead, questions };
}

export function venueAnswers(
  venue: { name: string; city: string | null; country: string | null },
  concerts: ListConcert[],
): Answers {
  const where = [venue.city, venue.country].filter(Boolean).join(", ");
  if (!concerts.length) return { lead: `No concert from ${venue.name} is on ${SITE_NAME} right now.`, questions: [] };
  const festival = concerts.some((c) => c.venueKind?.slug === "festival");
  const bands = topCounts(mainBands(concerts), 8);
  const years = yearsOf(concerts);
  const lead =
    `${plural(concerts.length, "full concert")} ${festival ? "from" : "recorded at"} ${venue.name}${where ? ` (${where})` : ""}` +
    `${years.length ? `, played ${spanWords(years)}` : ""}${bands.length ? `, with ${listWords(bands.slice(0, 4))}` : ""}. ` +
    `Every concert plays in full on its own page.`;
  const questions: QA[] = [];
  if (bands.length) questions.push({ question: `Which bands played ${venue.name}?`, answer: `Full concerts here include ${listWords(bands)}.` });
  const distinct = [...new Set(years)].sort((a, b) => a - b);
  if (distinct.length > 1) {
    questions.push({ question: `Which years are covered?`, answer: `Concerts played from ${distinct[0]} to ${distinct[distinct.length - 1]}, in ${plural(distinct.length, "different year")}.` });
  }
  if (concerts.length > 1) {
    const top = mostWatched(concerts);
    questions.push({
      question: `What is the most watched concert from ${venue.name}?`,
      answer: `${top.credits}${top.performedYear ? ` in ${top.performedYear}` : ""}, with ${views(top.viewCount)}.`,
    });
  }
  if (where) questions.push({ question: `Where is ${venue.name}?`, answer: `${where}.` });
  const setlistCount = withSetlists(concerts);
  questions.push({
    question: `How many full concerts from ${venue.name} are there?`,
    answer: `${concerts.length}, ${totalTime(concerts)} of music${setlistCount ? `, ${setlistCount === concerts.length ? "all" : setlistCount} with the setlist` : ""}.`,
  });
  return { lead, questions };
}

/** Lead sentence for a genre page. */
export function genreLead(name: string, concerts: ListConcert[]): string {
  if (!concerts.length) return `No ${name} concert is on ${SITE_NAME} right now.`;
  const bands = topCounts(mainBands(concerts), 4);
  const years = yearsOf(concerts);
  return (
    `${plural(concerts.length, `full ${name} concert`)}, ${totalTime(concerts)} of music` +
    `${bands.length ? `, from ${listWords(bands)}` : ""}${years.length ? `, played ${spanWords(years)}` : ""}. ` +
    `Every concert plays in full on its own page.`
  );
}

/** Lead sentence for a decade page. */
export function decadeLead(label: string, concerts: ListConcert[]): string {
  if (!concerts.length) return `No concert from the ${label} is on ${SITE_NAME} right now.`;
  const bands = topCounts(mainBands(concerts), 4);
  const genres = topCounts(concerts.flatMap((c) => c.genres.map((g) => g.name.toLowerCase())), 3);
  return (
    `${plural(concerts.length, "full rock concert")} played in the ${label}${bands.length ? `, from ${listWords(bands)}` : ""}` +
    `${genres.length ? `, mostly ${listWords(genres)}` : ""}. Every concert plays in full on its own page.`
  );
}

/** Lead sentence for a tour page. */
export function tourLead(tour: string, band: string | null, concerts: ListConcert[]): string {
  if (!concerts.length) return `No concert from ${tourWords(tour)} is on ${SITE_NAME} right now.`;
  const places = [...new Set(concerts.map((c) => c.venue?.name ?? c.city).filter((x): x is string => Boolean(x)))];
  const years = yearsOf(concerts);
  return (
    `${plural(concerts.length, "full concert")} from ${band ? `${band}'s ` : ""}${tourWords(tour).replace(/^the /, band ? "" : "the ")}` +
    `${years.length ? `, played ${spanWords(years)}` : ""}${places.length ? `, at ${listWords(places.slice(0, 4))}${places.length > 4 ? " and more" : ""}` : ""}. ` +
    `Every concert plays in full on its own page, in the order of the tour.`
  );
}
