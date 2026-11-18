// YouTube thumbnails. DESIGN.md section 6: always the highest resolution YouTube offers,
// with responsive sizes, and never the grey 120x90 placeholder.

export const THUMBNAIL_SIZES = [
  { name: "maxresdefault", width: 1280, height: 720 },
  { name: "sddefault", width: 640, height: 480 },
  { name: "hqdefault", width: 480, height: 360 },
] as const;

export type ThumbnailName = (typeof THUMBNAIL_SIZES)[number]["name"];

export function thumbnailUrl(youtubeId: string, name: ThumbnailName = "hqdefault"): string {
  return `https://i.ytimg.com/vi/${youtubeId}/${name}.jpg`;
}

/** Which size a stored thumbnail URL points at. Unknown or missing -> hqdefault, which always exists. */
export function bestKnownSize(stored: string | null | undefined): ThumbnailName {
  const match = stored?.match(/\/(maxresdefault|sddefault|hqdefault)\.jpg$/);
  return (match?.[1] as ThumbnailName | undefined) ?? "hqdefault";
}

export interface ThumbnailSources {
  src: string;
  srcSet: string;
  width: number;
  height: number;
}

/** src and srcset for a concert, offering every size up to the best one known to exist. */
export function thumbnailSources(youtubeId: string, stored: string | null | undefined): ThumbnailSources {
  const best = bestKnownSize(stored);
  const from = THUMBNAIL_SIZES.findIndex((s) => s.name === best);
  const available = THUMBNAIL_SIZES.slice(from);
  return {
    src: thumbnailUrl(youtubeId, best),
    srcSet: [...available].reverse().map((s) => `${thumbnailUrl(youtubeId, s.name)} ${s.width}w`).join(", "),
    width: available[0].width,
    height: available[0].height,
  };
}

/**
 * Ask YouTube's image server which sizes exist and return the largest one.
 * A missing size answers 404 (with the 120x90 placeholder as its body), so the status is enough.
 * Returns null when the answer is unknown (network trouble or no answer within `timeoutMs`),
 * so nothing wrong gets stored.
 */
export async function findBestThumbnail(
  youtubeId: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 5_000,
): Promise<ThumbnailName | null> {
  for (const size of THUMBNAIL_SIZES) {
    if (size.name === "hqdefault") break;
    try {
      const res = await fetchFn(thumbnailUrl(youtubeId, size.name), {
        method: "HEAD",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return size.name;
      if (res.status !== 404) return null; // blocked or server trouble: unknown, try again later
    } catch {
      return null; // network problem or too slow: unknown, try again later
    }
  }
  return "hqdefault";
}
