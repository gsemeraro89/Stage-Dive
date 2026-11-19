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
import { listWords, plural, quoted, songCounts, spokenDuration, spokenTotal, topCounts, whenWords } from "./text";

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

  const lead = [
    `${c.credits} live${place ? ` at ${place}` : ""}${when ? ` ${when}` : ""}${c.tour ? `, on ${tourWords(c.tour.name)}` : ""}:`,
    ` the full concert, ${spokenDuration(c.durationSeconds)}${genres.length ? ` of ${listWords(genres)}` : ""}`,
    songs.length ? `, with a ${songs.length}-song setlist${opener ? ` that opens with ${quoted(opener.title)}` : ""}` : "",
    ".",
    c.channel.isOfficial ? ` ${officialLine(c.channel)}` : "",
  ].join("");

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
  const songs = setlists.length >= 2 ? songCounts(setlists).slice(0, 5) : [];
  if (songs.length) {
    questions.push({
      question: `Which songs does ${band.name} play most live?`,
      answer: `Across the ${setlists.length} setlists here: ${listWords(songs.map((s) => `${quoted(s.title)} (${plural(s.count, "setlist")})`))}.`,
    });
  }
  if (band.origin) questions.push({ question: `Where are ${band.name} from?`, answer: `${band.origin}.` });
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
