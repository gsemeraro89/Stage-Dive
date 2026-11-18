export const SITE_NAME = "STAGEDIVE";
export const SITE_TAGLINE = "A fanzine that plays. Full rock gigs, free, the whole set.";

/** Public address of the site, used for canonical links. Set SITE_URL on the server. */
export function siteUrl(): string {
  return (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** 4413755 -> "4.4M", 66693 -> "67K", 950 -> "950". */
export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function placeLine(concert: { venue: { name: string } | null; city: string | null; country: string | null }): string {
  return [concert.venue?.name, concert.city, concert.country].filter(Boolean).join(", ");
}
