// Places written one way (owner, 20 Nov 2026): the same festival stored as "Pinkpop" and "Pinkpop
// Festival" split its page in two, and the Netherlands appeared as "NL" and "Netherlands".
// - countryName(): every country as its full English name ("NL" -> "Netherlands", "USA" -> "United
//   States"; England, Scotland, Wales and Northern Ireland stay as written: owner, 20 Nov 2026). Used when storing
//   (collector, seed import), when showing, and by the admin op "normalize-countries".
// - venueKey() / sameVenue(): two venue names are the same place when they are equal after dropping
//   case, accents, punctuation, a leading "the" and a leading or trailing "festival"/"fest", and their
//   countries and cities do not disagree. The collector then reuses the stored venue and its name.
// Pure functions, tested in tests/places.test.ts.

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** Common ways of writing a country that are not ISO codes, as the full English name. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  "u s a": "United States",
  "u s": "United States",
  "united states of america": "United States",
  america: "United States",
  uk: "United Kingdom",
  "u k": "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  holland: "Netherlands",
  "the netherlands": "Netherlands",
  "czech republic": "Czechia",
  "russian federation": "Russia",
  "south korea": "South Korea",
  "republic of ireland": "Ireland",
};

const plain = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** A country as its full English name; empty or unknown text is kept as written (trimmed), null for nothing. */
export function countryName(country: string | null | undefined): string | null {
  const raw = country?.trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) {
    const code = raw.toUpperCase() === "UK" ? "GB" : raw.toUpperCase();
    try {
      const name = regionNames.of(code);
      if (name && name !== code) return COUNTRY_ALIASES[plain(name)] ?? name;
    } catch {
      // not a region code: fall through
    }
  }
  return COUNTRY_ALIASES[plain(raw)] ?? raw;
}

const FESTIVAL_WORD = /^(festival|fest|festivals)$/;

/** The comparable form of a venue name: "The Pinkpop Festival" and "pinkpop" give "pinkpop". */
export function venueKey(name: string): string {
  const words = plain(name.replace(/&/g, " and ")).split(" ").filter(Boolean);
  if (words[0] === "the") words.shift();
  while (words.length > 1 && FESTIVAL_WORD.test(words[words.length - 1])) words.pop();
  while (words.length > 1 && FESTIVAL_WORD.test(words[0])) words.shift();
  return words.join(" ");
}

interface PlaceLike {
  name: string;
  city: string | null;
  country: string | null;
}

/** Two values agree when either is unknown or they are the same after normalising. */
const agree = (a: string | null, b: string | null, norm: (s: string) => string | null) => !a || !b || norm(a) === norm(b);

/** Whether two venue records are the same place (see the top of this file). */
export function sameVenue(a: PlaceLike, b: PlaceLike): boolean {
  const key = venueKey(a.name);
  return (
    key !== "" &&
    key === venueKey(b.name) &&
    agree(a.country, b.country, (s) => plain(countryName(s) ?? "")) &&
    agree(a.city, b.city, plain)
  );
}

/** The stored venue a new name belongs to, if any (the first match, so the stored, canonical name wins). */
export function matchVenue<V extends PlaceLike>(stored: V[], wanted: PlaceLike): V | null {
  return stored.find((v) => sameVenue(v, wanted)) ?? null;
}

/** Groups of stored venues that are the same place (for the report and the admin merge). */
export function duplicateVenues<V extends PlaceLike>(venues: V[]): V[][] {
  const groups: V[][] = [];
  for (const v of venues) {
    const g = groups.find((x) => sameVenue(x[0], v));
    if (g) g.push(v);
    else groups.push([v]);
  }
  return groups.filter((g) => g.length > 1);
}
