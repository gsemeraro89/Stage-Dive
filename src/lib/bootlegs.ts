// Bootlegs on the site (owner, 20 Nov 2026): professionally filmed, complete shows shared by fan channels
// (sourceKind FAN_PRO_SHOT). They are always marked ("Bootleg", data-od="bootleg-label"), credited "From
// <channel>" (never "upload"), listed after the official concerts everywhere, kept out of the "best of"
// rankings, and counted in a band's songs and setlist figures. An official version of the same concert always
// wins: the bootleg is hidden by itself (src/lib/collector/store.ts).
// Copy rules as everywhere: never "free", "archive", "upload", "full-length"; "YouTube" only next to a view count.
// Pure functions, tested in tests/bootlegs.test.ts.

/** The label shown on a bootleg's page and rows. */
export const BOOTLEG_LABEL = "Bootleg";

/** What a bootleg is, said once where it is shown (concert page, Markdown copies, llms files). */
export const BOOTLEG_EXPLAINED =
  "A bootleg: a professionally filmed recording of the whole show, shared by a fan channel, not an official release.";

/** The note under a band page's "From the fans": what these are, for one or several. */
export function bootlegNote(count: number, hasOfficial = true): string {
  const what =
    count === 1 ? BOOTLEG_EXPLAINED : "Bootlegs: professionally filmed recordings of whole shows, shared by fan channels, not official releases.";
  // "come first" only when there is an official concert to come first (a band with only bootlegs has none).
  return hasOfficial ? `${what} The official concerts come first.` : what;
}

/**
 * The band page's "Start here" pick: the most watched official concert; a bootleg only when the band has no
 * official concert, and then it says so. `before` and `after` go around the link to the concert.
 */
export function startHere<T extends { viewCount: number; id: number; bootleg?: BootlegMark }>(
  concerts: T[],
): { pick: T; before: string; after: string } | null {
  const byViews = (list: T[]) => [...list].sort((a, b) => b.viewCount - a.viewCount || a.id - b.id);
  const official = byViews(concerts.filter((c) => !c.bootleg));
  const bootlegs = byViews(concerts.filter((c) => c.bootleg));
  const pick = official[0] ?? bootlegs[0];
  if (!pick) return null;
  const views = `${pick.viewCount.toLocaleString("en-GB")} views on YouTube`;
  if (!pick.bootleg) {
    if (concerts.length === 1) return { pick, before: "It is ", after: ", the whole set." };
    return bootlegs.length
      ? { pick, before: "If you watch one, make it ", after: `: the most watched of the official concerts (${views}).` }
      : { pick, before: "If you watch one, make it ", after: `: the most watched of them (${views}).` };
  }
  // No official concert: the pick is a bootleg, and the sheet says so.
  if (concerts.length === 1) return { pick, before: "It is ", after: ", a bootleg, professionally filmed: the whole set." };
  return { pick, before: "If you watch one, make it ", after: `, a bootleg, professionally filmed: the most watched of them (${views}).` };
}

/** Site-wide words about where the concerts come from (footer, issue strip, llms files): never "official only". */
export const FOOTER_LINE = "every gig here is a whole show, played in full: official concerts first, then bootlegs. We just glue them together.";
export const ISSUE_STRIP_SOURCES = "FULL ROCK GIGS, OFFICIAL FIRST";

/** The heading of a band page's bootleg section. */
export const FAN_SECTION_TITLE = "From the fans";

/** A concert's bootleg mark: the fan channel it comes from, or null for an official concert. */
export type BootlegMark = { from: string } | null;

/**
 * A fan channel's name as the site shows it: emoji and decorative symbols out ("⚡Marco's HIGH VOLTAGE Music
 * Channel⚡" -> "Marco's HIGH VOLTAGE Music Channel"), fancy Unicode letters back to plain ones ("𝓒𝓪𝓷" ->
 * "Can", "ᴴᴰ" -> "HD"), spaces tidied. Letters in any script, accents, digits and ordinary punctuation stay.
 * The stored name (creditName) is untouched; this is for display only (pages, Markdown copies, llms files,
 * answers). Falls back to the trimmed name when nothing would be left.
 */
export function displayChannelName(name: string): string {
  const cleaned = name
    .replace(/[\p{Extended_Pictographic}\p{So}\p{Co}\p{Regional_Indicator}\p{Emoji_Modifier}\u200D\u20E3\uFE00-\uFE0F]/gu, " ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    // Separators left dangling by a removed symbol ("★ - Name -", "| Name").
    .replace(/^[\s\-|~*·•_:]+|[\s\-|~*·•_:]+$/g, "");
  return cleaned || name.trim();
}

/** "From Better Than Nothing Videos" (never "uploaded by"). */
export function bootlegCredit(from: string): string {
  return `From ${displayChannelName(from)}`;
}

/** The credit line of any concert: "Official concert from Pinkpop Archive", "From <channel>" for a bootleg or another channel. */
export function sourceCredit(c: { channel: { name: string; isOfficial: boolean }; bootleg?: BootlegMark }): string {
  if (c.bootleg) return bootlegCredit(c.bootleg.from);
  return c.channel.isOfficial ? `Official concert from ${c.channel.name}` : `From ${displayChannelName(c.channel.name)}`;
}

/** The same list with the official concerts first and the bootlegs after them, each part in its own order. */
export function officialFirst<T extends { bootleg?: BootlegMark }>(list: T[]): T[] {
  return [...list.filter((c) => !c.bootleg), ...list.filter((c) => c.bootleg)];
}

/** Official concerts and bootlegs apart (band pages: the main list, then "From the fans"). */
export function splitBootlegs<T extends { bootleg?: BootlegMark }>(list: T[]): { official: T[]; bootlegs: T[] } {
  return { official: list.filter((c) => !c.bootleg), bootlegs: list.filter((c) => c.bootleg) };
}

/** The /concerts filter by source: `?source=official` or `?source=bootleg`. */
export const SOURCE_FILTERS = ["official", "bootleg"] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];

export const SOURCE_FILTER_LABELS: Record<SourceFilter, string> = { official: "Official concerts", bootleg: "Bootlegs" };

/** The database condition for a source filter. */
export function sourceKindFor(f: SourceFilter): "OFFICIAL" | "FAN_PRO_SHOT" {
  return f === "bootleg" ? "FAN_PRO_SHOT" : "OFFICIAL";
}
