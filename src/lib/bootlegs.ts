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

/** The heading of a band page's bootleg section. */
export const FAN_SECTION_TITLE = "From the fans";

/** A concert's bootleg mark: the fan channel it comes from, or null for an official concert. */
export type BootlegMark = { from: string } | null;

/** "From Better Than Nothing Videos" (never "uploaded by"). */
export function bootlegCredit(from: string): string {
  return `From ${from}`;
}

/** The credit line of any concert: "Official concert from Pinkpop Archive", "From <channel>" for a bootleg or another channel. */
export function sourceCredit(c: { channel: { name: string; isOfficial: boolean }; bootleg?: BootlegMark }): string {
  if (c.bootleg) return bootlegCredit(c.bootleg.from);
  return c.channel.isOfficial ? `Official concert from ${c.channel.name}` : `From ${c.channel.name}`;
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
