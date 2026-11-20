// Ads (none yet). Every future ad slot must ask adsAllowed() for its page's concert and show nothing when it
// says no. Rules:
// - YouTube Developer Policies III.G.1.d (CLAUDE.md rule 3): ads only on pages with substantial original content
//   that has value without the video: here a setlist or our own write-up. Never on or inside the player.
// - Bootlegs (owner, 20 Nov 2026): no ads on a bootleg's page until the owner switches ADS_ON_BOOTLEGS=true
//   (after AdSense approval). Default: off.
// Pure functions, tested in tests/bootlegs.test.ts.

/** True only when the owner has switched ads on for bootleg pages (ADS_ON_BOOTLEGS=true). */
export function adsOnBootlegs(env: Record<string, string | undefined> = process.env): boolean {
  return env.ADS_ON_BOOTLEGS === "true";
}

/** Whether an ad may be shown on this concert's page. */
export function adsAllowed(
  concert: { bootleg: unknown; hasSetlist: boolean; writeUp: string | null },
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (concert.bootleg && !adsOnBootlegs(env)) return false;
  return concert.hasSetlist || Boolean(concert.writeUp?.trim());
}
