// "Concert notes": short facts about one concert, computed from data we hold (owner, 19 Nov 2026,
// ported from the OpenDecks set facts idea). They give each concert page original, quotable text
// that grows by itself as the catalogue grows: where it ranks among the band's concerts, other
// nights at the same place or on the same tour, what the setlist looks like, and which songs turn
// up in the band's other setlists. Nothing is guessed: a note is left out when its data is missing.
// Pure functions, tested in tests/concert-notes.test.ts.
import { formatDuration } from "./format";
import { songLinker } from "./songs";
import { listWords, ordinal, plural, quoted, songKey } from "./text";

/** A piece of a note: plain text, or a link to another page on the site. */
export type NotePart = string | { href: string; text: string };

export interface ConcertNote {
  /** Stable name for the kind of note (for the page's markup and tests). */
  id: "rank" | "same-place" | "same-tour" | "setlist" | "longest-song" | "shared-songs" | "only-here" | "decade";
  parts: NotePart[];
}

/** Another concert by the same band (the current one may be among them; it is skipped). */
export interface SiblingConcert {
  id: number;
  slug: string;
  viewCount: number;
  performedYear: number | null;
  venue: { slug: string; name: string } | null;
  tour: { slug: string; name: string } | null;
  /** Song titles of its setlist, or null when it has none. */
  songs: string[] | null;
}

export interface NotesInput {
  concert: {
    id: number;
    viewCount: number;
    durationSeconds: number;
    venue: { slug: string; name: string } | null;
    tour: { slug: string; name: string } | null;
    performedYear: number | null;
  };
  /** The headline band, when it has a page. */
  band: { slug: string; name: string } | null;
  /** Every visible concert of the headline band, the current one included. */
  siblings: SiblingConcert[];
  setlist: { tracks: { time: number | null; title: string; unidentified: boolean }[] } | null;
  /** The concert's decade and how many concerts it has on the site. */
  decade: { label: string; count: number } | null;
}

/** Plain text of a note (for descriptions and tests). */
export const noteText = (n: ConcertNote) => n.parts.map((p) => (typeof p === "string" ? p : p.text)).join("");

const views = (n: number) => `${n.toLocaleString("en-GB")} views on YouTube`;

/** Groups of parts joined as words: a, b and c. */
function wordList(groups: NotePart[][]): NotePart[] {
  const out: NotePart[] = [];
  groups.forEach((g, i) => {
    if (i > 0) out.push(i === groups.length - 1 ? " and " : ", ");
    out.push(...g);
  });
  return out;
}

/** Links joined as words: [a], " and ", [b]. */
function linkList(links: { href: string; text: string }[]): NotePart[] {
  const out: NotePart[] = [];
  links.forEach((l, i) => {
    if (i > 0) out.push(i === links.length - 1 ? " and " : ", ");
    out.push(l);
  });
  return out;
}

export function concertNotes({ concert, band, siblings, setlist, decade }: NotesInput): ConcertNote[] {
  const notes: ConcertNote[] = [];
  const others = siblings.filter((s) => s.id !== concert.id);
  const bandPart: NotePart = band ? { href: `/artists/${band.slug}`, text: band.name } : "the band";
  const bandName = band?.name ?? "the band";

  // Where it ranks among the band's concerts, by views.
  if (band && others.length >= 1) {
    const all = [...others, { id: concert.id, viewCount: concert.viewCount }].sort((a, b) => b.viewCount - a.viewCount || a.id - b.id);
    const rank = all.findIndex((s) => s.id === concert.id) + 1;
    notes.push({
      id: "rank",
      parts: [
        rank === 1 ? "The most watched of " : `The ${ordinal(rank)} most watched of `,
        bandPart,
        `'s ${all.length} concerts here (${views(concert.viewCount)}).`,
      ],
    });
  }

  // Other nights at the same place.
  if (concert.venue) {
    const samePlace = others.filter((s) => s.venue?.slug === concert.venue!.slug).sort((a, b) => (a.performedYear ?? 0) - (b.performedYear ?? 0));
    if (samePlace.length) {
      notes.push({
        id: "same-place",
        parts: [
          bandPart,
          " also played ",
          { href: `/venues/${concert.venue.slug}`, text: concert.venue.name },
          " in ",
          ...linkList(samePlace.slice(0, 6).map((s) => ({ href: `/concerts/${s.slug}`, text: s.performedYear ? String(s.performedYear) : "another year" }))),
          samePlace.length > 6 ? `, ${plural(samePlace.length, "time")} in all.` : ".",
        ],
      });
    }
  }

  // The rest of the tour.
  if (concert.tour) {
    const sameTour = siblings.filter((s) => s.tour?.slug === concert.tour!.slug);
    if (sameTour.length > 1) {
      notes.push({
        id: "same-tour",
        parts: [`One of ${sameTour.length} concerts from `, { href: `/tours/${concert.tour.slug}`, text: concert.tour.name }, " here."],
      });
    }
  }

  // The setlist itself.
  const songs = setlist?.tracks ?? [];
  const known = songs.filter((t) => !t.unidentified);
  if (songs.length) {
    const opener = known[0];
    const closer = known.length > 1 ? known[known.length - 1] : undefined;
    notes.push({
      id: "setlist",
      parts: [
        `${plural(songs.length, "song")}${opener ? `: opens with ${quoted(opener.title)}` : ""}${closer ? `, closes with ${quoted(closer.title)}` : ""}.`,
      ],
    });
  }

  // The longest song, from the times in the setlist (the last song's end is not known, so it is left out).
  let longest: { title: string; seconds: number } | null = null;
  for (let i = 0; i < songs.length - 1; i++) {
    const [a, b] = [songs[i], songs[i + 1]];
    if (a.time === null || b.time === null || a.unidentified) continue;
    const seconds = b.time - a.time;
    if (seconds > 0 && (!longest || seconds > longest.seconds)) longest = { title: a.title, seconds };
  }
  if (longest && longest.seconds >= 240) {
    notes.push({ id: "longest-song", parts: [`Longest song: ${quoted(longest.title)} (${formatDuration(longest.seconds)}).`] });
  }

  // Songs this setlist shares with the band's other setlists (each linked to its song page), and the ones only played here.
  const linkSong = band ? songLinker(band.slug, siblings.flatMap((s) => s.songs ?? [])) : () => null;
  const otherSetlists = others.filter((s) => s.songs?.length).map((s) => new Set(s.songs!.map(songKey)));
  if (known.length && otherSetlists.length) {
    const shared = known
      .map((t) => ({ title: t.title, count: otherSetlists.filter((set) => set.has(songKey(t.title))).length }))
      .filter((s, i, all) => s.count > 0 && all.findIndex((x) => songKey(x.title) === songKey(s.title)) === i)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    if (shared.length) {
      notes.push({
        id: "shared-songs",
        parts: [
          `Also in ${bandName}'s other setlists here: `,
          ...wordList(
            shared.map((s): NotePart[] => {
              const href = linkSong(s.title);
              return [href ? { href, text: quoted(s.title) } : quoted(s.title), ` (${s.count} of ${otherSetlists.length})`];
            }),
          ),
          ".",
        ],
      });
    }
    if (otherSetlists.length >= 3) {
      const rare = [...new Map(known.filter((t) => !otherSetlists.some((set) => set.has(songKey(t.title)))).map((t) => [songKey(t.title), t.title])).values()];
      if (rare.length && rare.length <= 5) {
        notes.push({
          id: "only-here",
          parts: [`Only in this setlist, of the ${otherSetlists.length + 1} by ${bandName} here: ${listWords(rare.map(quoted))}.`],
        });
      }
    }
  }

  // The decade it belongs to.
  if (decade && decade.count > 1) {
    notes.push({ id: "decade", parts: [`One of ${decade.count} concerts from `, { href: `/decades/${decade.label}`, text: `the ${decade.label}` }, " here."] });
  }
  return notes;
}
