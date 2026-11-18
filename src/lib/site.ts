export const SITE_NAME = "FullDJSet";
export const SITE_TAGLINE = "Free full-length electronic DJ sets, played right here";

/** Public address of the site, used for canonical links. Set SITE_URL on the server. */
export function siteUrl(): string {
  return (process.env.SITE_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** 4413755 -> "4.4M", 66693 -> "67K", 950 -> "950". */
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function placeLine(set: { venue: { name: string } | null; city: string | null; country: string | null }): string {
  return [set.venue?.name, set.city, set.country].filter(Boolean).join(", ");
}
