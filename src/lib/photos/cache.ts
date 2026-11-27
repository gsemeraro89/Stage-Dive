// How long browsers may keep a band or festival photo (speed, 27 Nov 2026).
// The pages always link a photo with its version (?v=, toBandPhotoView / toFestivalPhotoView): a new photo
// gets a new address, so a versioned address never changes and may be kept for a year. An address without
// a version keeps the photo route's own one-day rule. Used by src/proxy.ts; no database here.

export const IMMUTABLE = "public, max-age=31536000, immutable";

/** The Cache-Control for a photo request, or null when the route's own header stays. */
export function photoCacheControl(pathname: string, searchParams: URLSearchParams): string | null {
  if (!/^\/photos\/(?:bands|festivals)\/[a-z0-9-]+$/.test(pathname)) return null;
  return searchParams.get("v") ? IMMUTABLE : null;
}
