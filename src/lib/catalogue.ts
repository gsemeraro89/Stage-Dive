// Fixed lists the catalogue is built on. Both are a starting point the owner can edit.

/**
 * Genres shown on the site (owner decision, 12 Nov 2026: these 9 only, for now).
 * "Live Act" is an attribute, not a genre (see Set.liveAct).
 */
export const GENRES = [
  "Techno",
  "Melodic Techno",
  "Melodic House",
  "Progressive House",
  "Progressive",
  "Deep House",
  "Tech House",
  "Afro House",
  "Electronica",
] as const;

/**
 * Genres used only for artists the owner approved by name (data/artist-rules.json), owner decision
 * 16 Nov 2026. They are never offered to the classifier, so other artists of these styles (e.g. Alok,
 * Timmy Trumpet) still stay out. "Hard Techno" added by the owner on 17 Nov 2026 for the hard techno
 * artists of the per-artist lane (I Hate Models, Sara Landry, Klangkuenstler...).
 */
export const ARTIST_ONLY_GENRES = ["Big Room / EDM", "Trance", "Nu Disco", "Bass", "Hard Techno"] as const;

/** Every genre that can appear on the site, in display order. */
export const SITE_GENRES = [...GENRES, ...ARTIST_ONLY_GENRES] as const;

/**
 * Genres that were on the original list (docs/BRIEF.md 4.2) and were taken off by the owner.
 * In the seed data they are dropped quietly; a set keeps its other genres.
 */
export const RETIRED_GENRES = [
  "Hard Techno",
  "Psytrance",
  "House",
  "Organic House",
  "Disco",
  "Drum & Bass",
  "Trance",
  "Neo-Classical",
] as const;

/** The "Live Act" label in source data. Stored as Set.liveAct, not as a genre. */
export const LIVE_ACT = "Live Act";

/** Settings from docs/BRIEF.md section 4 (owner approved, 12 Nov 2026). */
export const SETTINGS = [
  "Festival",
  "Club",
  "Special location",
  "Studio-Session",
  "Livestream",
] as const;

export type SettingName = (typeof SETTINGS)[number];

/**
 * How setting labels found in older data map onto the approved settings.
 * Cercle is a channel, not a setting, so "Cercle / Special location" becomes "Special location".
 */
export const SETTING_ALIASES: Record<string, SettingName> = {
  "festival": "Festival",
  "club": "Club",
  "special location": "Special location",
  "cercle / special location": "Special location",
  "studio-session": "Studio-Session",
  "studio / session": "Studio-Session",
  "studio / bedroom": "Studio-Session",
  "livestream": "Livestream",
};

export function normalizeSetting(label: string): SettingName {
  const setting = SETTING_ALIASES[label.trim().toLowerCase()];
  if (!setting) throw new Error(`Unknown setting "${label}". Add it to SETTING_ALIASES.`);
  return setting;
}
