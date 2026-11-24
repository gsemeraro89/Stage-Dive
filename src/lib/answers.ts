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
import { genreSearchName } from "./keyword-targets";
import { placeLine, SITE_NAME } from "./site";
import { bandStats, type BandStats, type UsualSong } from "./band-stats";
import { setlistSongs, songCount, type Song, type TypicalPosition } from "./songs";
import { listWords, plural, quoted, spokenDuration, spokenTotal, topCounts, whenWords } from "./text";
import { BOOTLEG_EXPLAINED, type BootlegMark } from "./bootlegs";
import { LIVE_ALBUMS_IN_ANSWER, sortAlbums, type LiveAlbumView } from "./live-albums";
import { newsDay } from "./news/hubs";

export interface QA {
  question: string;
  answer: string;
  /** Where the answer comes from on our site (a news article), shown as a link after it. */
  link?: { href: string; text: string };
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
  /** A bootleg (src/lib/bootlegs.ts): said honestly, with the fan channel it comes from. */
  bootleg?: BootlegMark;
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
  // Only songs open or close a set: solos, intros, jams and notes do not (src/lib/song-title.ts).
  const known = setlistSongs(songs).map((x) => ({ ...x.track, title: x.title }));
  const count = songCount(songs);
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
      count ? `${plural(count, "song")}${opener ? `, opening with ${quoted(opener.title)}` : ""}` : "",
      c.bootleg ? `bootleg, professionally filmed, from ${c.bootleg.from}` : c.channel.isOfficial ? `official concert from ${c.channel.name}` : "",
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
  if (count) {
    const first = known.slice(0, 3).map((t) => quoted(t.title));
    questions.push({
      question: `What songs did ${c.credits} play?`,
      answer:
        `${plural(count, "song")}${first.length ? `, opening with ${listWords(first)}` : ""}` +
        `${closer && known.length > 3 ? ` and closing with ${quoted(closer.title)}` : ""}.` +
        ` The full setlist${songs.some((t) => t.time !== null) ? ", with the time each song starts," : ""} is on the concert page.`,
    });
  }
  if (c.tour) questions.push({ question: `Which tour was it part of?`, answer: `${c.tour.name}.` });
  if (genres.length) questions.push({ question: `What kind of music is it?`, answer: `${listWords(c.genres.map((g) => g.name))}.` });
  questions.push({
    question: `Where can I watch ${c.credits}'s full concert?`,
    answer: `On ${SITE_NAME}, in full, in the player on the concert page${c.bootleg ? `, from ${c.bootleg.from}` : c.channel.isOfficial ? `, from the official ${c.channel.name} channel` : ""}. No account needed.`,
  });
  if (c.bootleg) questions.push({ question: `Is this an official recording?`, answer: `No. ${BOOTLEG_EXPLAINED}` });
  return { lead, questions };
}

interface ListConcert {
  slug: string;
  title: string;
  credits: string;
  artists: { name: string; role: "MAIN" | "WITH"; hasPage: boolean }[];
  venue: { name: string } | null;
  city: string | null;
  /** For "where and when" sentences (first and most recent concert); optional for lists that do not need it. */
  country?: string | null;
  venueKind: { slug: string } | null;
  genres: { name: string }[];
  tour: { name: string } | null;
  performedYear: number | null;
  performedOn?: Date | null;
  durationSeconds: number;
  viewCount: number;
  hasSetlist: boolean;
  bootleg?: BootlegMark;
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
  /** The band's live albums from MusicBrainz (src/lib/live-albums.ts). */
  liveAlbums: LiveAlbumView[] = [],
): Answers {
  if (!concerts.length) return { lead: `${band.name} has no concert on ${SITE_NAME} right now.`, questions: [] };
  const genres = topCounts(concerts.flatMap((c) => c.genres.map((g) => g.name.toLowerCase())), 3);
  const places = topCounts(concerts.map((c) => c.venue?.name).filter((x): x is string => Boolean(x)), 3);
  const years = yearsOf(concerts);
  const setlistCount = withSetlists(concerts);
  const bootlegs = concerts.filter((c) => c.bootleg).length;
  const official = concerts.filter((c) => !c.bootleg);

  const lead =
    `${SITE_NAME} has ${plural(concerts.length, "full concert")} by ${band.name}${band.origin ? `, from ${band.origin}` : ""}: ` +
    `${totalTime(concerts)} of ${genres.length ? listWords(genres) : "live rock"}` +
    `${years.length ? `, played ${spanWords(years)}` : ""}${places.length ? `, at places such as ${listWords(places)}` : ""}. ` +
    `Every concert plays in full on its own page${setlistCount ? `, ${setlistCount === concerts.length ? "each" : `${setlistCount}`} with its setlist` : ""}.` +
    (bootlegs ? ` ${bootlegs === concerts.length ? (bootlegs === 1 ? "It is a bootleg" : "All of them are bootlegs") : `${bootlegs} of them ${bootlegs === 1 ? "is a bootleg" : "are bootlegs"}`}: ${bootlegs === 1 ? "a professionally filmed show shared by a fan channel" : "professionally filmed shows shared by fans"}${bootlegs < concerts.length ? ", listed after the official concerts" : ""}.` : "");

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
    // The official concerts are named first: the most watched official one when there is one.
    const top = mostWatched(official.length ? official : concerts);
    questions.push({ question: `What is ${band.name}'s most watched concert?`, answer: `${gigName(top)}, with ${views(top.viewCount)}.` });
  }
  questions.push(...bandSpanQuestions(band.name, headlined(band.name, concerts)));
  const tours = [...new Set(concerts.map((c) => c.tour?.name).filter((x): x is string => Boolean(x)))];
  if (tours.length) questions.push({ question: `Which ${band.name} tours are here?`, answer: `${listWords(tours)}.` });
  questions.push(...bandStatQuestions(band.name, bandStatsFor(band.name, concerts, setlists)));
  const albums = liveAlbumQuestion(band.name, liveAlbums);
  if (albums) questions.push(albums);
  if (band.origin) questions.push({ question: `Where are ${band.name} from?`, answer: `${band.origin}.` });
  return { lead, questions };
}

/** A long gap between two concerts here, in years (owner, 21 Nov 2026). */
export const GAP_YEARS = 8;

type DatedConcert = ListConcert & { performedYear: number };

/** Oldest first: by year, then by day (a concert known only by its year last in its year). */
function byDate(concerts: ListConcert[]): DatedConcert[] {
  const day = (c: ListConcert) => (c.performedOn ? new Date(c.performedOn).getTime() : Infinity);
  return concerts.filter((c): c is DatedConcert => c.performedYear !== null).sort((a, b) => a.performedYear - b.performedYear || day(a) - day(b));
}

/** "at Pinkpop, Landgraaf, Netherlands, on 3 June 1995", "in 1993" (only what we hold). */
function whereWhen(c: DatedConcert): string {
  const place = placeLine({ venue: c.venue, city: c.city, country: c.country ?? null });
  return [place ? `at ${place}` : "", whenWords({ performedOn: c.performedOn ?? null, performedYear: c.performedYear })].filter(Boolean).join(", ");
}

/**
 * "First / last concert" and a long gap (owner, 21 Nov 2026, keyword research: "<band> first concert",
 * "<band> last concert", "<band> reunion"). Worded about our catalogue only: the earliest and the most
 * recent concert on STAGEDIVE, never the band's first or last show ever. A reunion cannot be told from
 * our data, so it is never claimed: only a gap of GAP_YEARS or more between two concerts here is stated.
 * `concerts` are the band's own (headline) concerts. Pure.
 */
export function bandSpanQuestions(name: string, concerts: ListConcert[]): QA[] {
  const dated = byDate(concerts);
  if (dated.length < 2) return [];
  const first = dated[0];
  const last = dated[dated.length - 1];
  // Two concerts are only told apart in time by different years, or by two different known days.
  const days = [first.performedOn, last.performedOn].map((d) => (d ? new Date(d).getTime() : null));
  if (first.performedYear === last.performedYear && (days[0] === null || days[1] === null || days[0] === days[1])) return [];
  const out: QA[] = [
    {
      question: `What is the first ${name} concert on ${SITE_NAME}?`,
      answer: `The earliest full concert by ${name} on ${SITE_NAME} was played ${whereWhen(first)}. It is the oldest one here, not necessarily their first show ever.`,
    },
    {
      question: `What is the most recent ${name} concert on ${SITE_NAME}?`,
      answer: `The most recent full concert by ${name} on ${SITE_NAME} was played ${whereWhen(last)}. It is the newest one here, not necessarily their last show.`,
    },
  ];
  // The longest stretch of years with no concert here (the first one when two are as long).
  let gap: [DatedConcert, DatedConcert] | null = null;
  for (let i = 1; i < dated.length; i++) {
    const span = dated[i].performedYear - dated[i - 1].performedYear;
    if (span >= GAP_YEARS && (!gap || span > gap[1].performedYear - gap[0].performedYear)) gap = [dated[i - 1], dated[i]];
  }
  if (gap) {
    const [a, b] = gap;
    const place = (c: DatedConcert) => c.venue?.name ?? c.city;
    const at = (c: DatedConcert) => `${c.performedYear}${place(c) ? ` (${place(c)})` : ""}`;
    out.push({
      question: `Is there a long gap between ${name} concerts here?`,
      answer: `Yes: ${name}${/s$/i.test(name) ? "'" : "'s"} full concerts on ${SITE_NAME} jump from ${at(a)} to ${at(b)}, ${b.performedYear - a.performedYear} years later, with none in between.`,
    });
  }
  return out;
}

/**
 * "What live albums has X released?" from MusicBrainz (src/lib/live-albums.ts), oldest first, up to
 * LIVE_ALBUMS_IN_ANSWER by name; an album tied to one of our concerts says so. Null without albums. Pure.
 */
export function liveAlbumQuestion(name: string, albums: LiveAlbumView[]): QA | null {
  if (!albums.length) return null;
  const sorted = sortAlbums(albums);
  const named = sorted.slice(0, LIVE_ALBUMS_IN_ANSWER).map((a) => `${quoted(a.title)}${a.year ? ` (${a.year})` : ""}`);
  const more = sorted.length - named.length;
  const tied = sorted.filter((a) => a.concert);
  return {
    question: `What live albums has ${name} released?`,
    answer:
      `MusicBrainz lists ${plural(sorted.length, "live album")} by ${name}: ${listWords(more > 0 ? [...named, `${more} more`] : named)}.` +
      (tied.length ? ` ${listWords(tied.map((a) => quoted(a.title)))} ${tied.length === 1 ? "is" : "are"} also on ${SITE_NAME} as a full concert.` : ""),
  };
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
  // The name people search ("full metal concert", "full new wave concert"; src/lib/keyword-targets.ts),
  // with the whole name after it when the genre has two ("new wave / synth").
  const search = genreSearchName(name).toLowerCase();
  return (
    `${plural(concerts.length, `full ${search} concert`)}${search === name.toLowerCase() ? "" : name.includes("/") ? ` (${name})` : ""}, ${totalTime(concerts)} of music` +
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

// ---- Festival and venue years (src/lib/venue-years.ts) ----

interface YearConcert extends ListConcert {
  performedOn: Date | null;
}

/** "3 June 1995", "3 to 5 June 1995", or null when no day is known. Only days we hold. */
export function daySpan(concerts: { performedOn: Date | null }[]): string | null {
  const days = concerts.map((c) => c.performedOn).filter((d): d is Date => Boolean(d)).map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  if (!days.length) return null;
  const first = whenWords({ performedOn: new Date(days[0]), performedYear: null })!.replace(/^on /, "");
  const last = whenWords({ performedOn: new Date(days[days.length - 1]), performedYear: null })!.replace(/^on /, "");
  if (first === last) return first;
  const [d1, m1, y1] = first.split(" ");
  const [, m2, y2] = last.split(" ");
  if (y1 !== y2) return `${first} to ${last}`;
  return m1 === m2 ? `${d1} to ${last}` : `${d1} ${m1} to ${last}`;
}

/**
 * Lead and questions for a festival-year or venue-year page ("Pinkpop 1995"). `name` is the page's
 * name ("Pinkpop 1995"); `festival` says whether the place is a festival (any concert of the Festival kind).
 */
export function venueYearAnswers(
  venue: { name: string; city: string | null; country: string | null },
  name: string,
  year: number,
  concerts: YearConcert[],
  festival: boolean,
): Answers {
  if (!concerts.length) return { lead: `No concert from ${name} is on ${SITE_NAME} right now.`, questions: [] };
  const where = [venue.city, venue.country].filter(Boolean).join(", ");
  const bands = [...new Set(mainBands(concerts))];
  const shown = bands.length > 8 ? [...bands.slice(0, 8), `${bands.length - 8} more`] : bands;
  const days = daySpan(concerts);
  const from = festival ? `from ${name}` : `recorded at ${venue.name} in ${year}`;
  const lead =
    `${plural(concerts.length, "full concert")} ${from}${where ? ` (${where})` : ""}${bands.length ? `: ${listWords(shown)}` : ""}. ` +
    `Every concert plays in full on its own page.`;
  const questions: QA[] = [];
  if (bands.length) {
    questions.push({
      question: festival ? `Who played ${name}?` : `Which bands played ${venue.name} in ${year}?`,
      answer: `Full concerts here: ${listWords(bands)}.`,
    });
  }
  if (days) questions.push({ question: festival ? `When was ${name}?` : `When were these concerts played?`, answer: `The concerts here were played ${days.includes(" to ") ? "from" : "on"} ${days}.` });
  if (where) questions.push({ question: `Where was ${name}?`, answer: `${venue.name}, ${where}.` });
  if (concerts.length > 1) {
    const top = mostWatched(concerts);
    questions.push({ question: `What is the most watched concert from ${name}?`, answer: `${top.credits}, with ${views(top.viewCount)}.` });
  }
  const setlistCount = withSetlists(concerts);
  questions.push({
    question: `How many full concerts from ${name} are there?`,
    answer: `${concerts.length}, ${totalTime(concerts)} of music${setlistCount ? `, ${setlistCount === concerts.length ? "all" : setlistCount} with the setlist` : ""}.`,
  });
  return { lead, questions };
}

// ---- Answers from our news (owner, 22 Nov 2026) ----
// Only from an article we published, saying what it says, with its date and a link; no article, no answer.

/** How recent a tour article must be to answer "Is <band> touring?". */
export const TOURING_NEWS_MONTHS = 6;
/** How recent a festival (line-up) article must be to answer "What is the <festival> line-up?". */
export const LINEUP_NEWS_MONTHS = 12;

/** The date `months` months before `now`. Pure. */
export function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

interface NewsForAnswer {
  slug: string;
  title: string;
  lead: string;
  publishedAt: Date;
}

const sentence = (s: string) => (/[.?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** "Is Metallica touring?", from the band's newest tour article of the last six months. Pure. */
export function touringQuestion(name: string, article: NewsForAnswer | null, now = new Date()): QA | null {
  if (!article || article.publishedAt < monthsBefore(now, TOURING_NEWS_MONTHS) || article.publishedAt > now) return null;
  return {
    question: `Is ${name} touring?`,
    answer: `The latest tour news about ${name} on ${SITE_NAME}, from ${newsDay(article.publishedAt)}: ${sentence(article.lead)}`,
    link: { href: `/news/${article.slug}`, text: article.title },
  };
}

/** Acts named in a line-up answer, at most. */
export const LINEUP_ACTS_SHOWN = 12;

/**
 * "What is the Glastonbury 2027 line-up?" (the year only when the headline gives it), from the festival's
 * newest line-up article of the last twelve months, with the acts the source names. Pure.
 */
export function lineupQuestion(name: string, article: (NewsForAnswer & { artists: string[] }) | null, now = new Date()): QA | null {
  if (!article || article.publishedAt < monthsBefore(now, LINEUP_NEWS_MONTHS) || article.publishedAt > now) return null;
  const year = article.title.match(/\b(20\d{2})\b/)?.[1];
  const acts = [...new Set(article.artists.map((a) => a.trim()).filter(Boolean))];
  const shown = acts.slice(0, LINEUP_ACTS_SHOWN);
  return {
    question: year ? `What is the ${name} ${year} line-up?` : `What is the latest ${name} line-up news?`,
    answer:
      `The latest line-up news about ${name} on ${SITE_NAME}, from ${newsDay(article.publishedAt)}: ${sentence(article.lead)}` +
      (shown.length ? ` Acts named: ${listWords(acts.length > shown.length ? [...shown, `${acts.length - shown.length} more`] : shown)}.` : ""),
    link: { href: `/news/${article.slug}`, text: article.title },
  };
}

// ---- Homepage ----

/** What the homepage lead is built from (src/lib/home.ts SiteTotals). */
export interface HomeTotals {
  concerts: number;
  official: number;
  bootlegs: number;
  bands: number;
  withSetlist: number;
  festivals: number;
  venues: number;
}

/**
 * The answer-first lead sentence from the totals: only facts we hold, no clause for a zero. Copy rules:
 * never "free", "archive", "upload", "full-length"; no "YouTube" (no view count here). Empty without concerts.
 */
export function homeLead(t: HomeTotals): string {
  if (!t.concerts) return "";
  const what = t.bootlegs
    ? `${plural(t.concerts, "full rock concert")} you can play here, the whole show (${t.official} official, ${plural(t.bootlegs, "bootleg")})`
    : `${plural(t.concerts, "full rock concert")} you can play here, the whole show`;
  const where = [t.festivals ? plural(t.festivals, "festival") : null, t.venues ? plural(t.venues, "venue") : null].filter(Boolean) as string[];
  const by = t.bands ? ` by ${plural(t.bands, "band")}` : "";
  const at = where.length ? ` at ${listWords(where)}` : "";
  const setlists = t.withSetlist ? `; ${t.withSetlist === t.concerts ? "every one" : t.withSetlist} with a setlist: click a song to jump to it` : "";
  return `${SITE_NAME} has ${what}${by}${at}${setlists}.`;
}
