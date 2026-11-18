// Band photos from Wikimedia Commons (brief section 4: "properly licensed images, Wikimedia Commons with
// credit"). Only licences that allow changes are used, because every photo gets the photocopy treatment:
// public domain, CC0, CC BY and CC BY-SA. NoDerivatives and NonCommercial photos are never taken.
// YouTube thumbnails and channel avatars are NOT handled here: YouTube does not allow them to be altered.

const USER_AGENT = `STAGEDIVE/0.1 (+${process.env.SITE_URL || "https://stagedive-test.onrender.com"})`;

export interface CommonsPhoto {
  /** "File:Metallica live 2016.jpg" */
  title: string;
  /** A resized copy of the file, about `width` pixels wide. */
  imageUrl: string;
  /** The file's page on Commons (where the licence is shown). */
  pageUrl: string;
  /** Author as plain text ("Jane Doe"). */
  author: string;
  /** "CC BY-SA 4.0", "Public domain" ... */
  license: string;
  licenseUrl: string | null;
}

/**
 * Whether a Commons licence lets us publish a changed (photocopied) version. Public domain, CC0,
 * CC BY and CC BY-SA of any version: yes. Anything NoDerivatives (ND), NonCommercial (NC), GFDL-only,
 * "fair use" or unknown: no.
 */
export function licenseAllowsChanges(shortName: string | null | undefined): boolean {
  const s = (shortName ?? "").toLowerCase().replace(/[-_]/g, " ").trim();
  if (!s) return false;
  if (/\b(nd|nc|noderivs?|noderivatives|noncommercial|fair use|non free)\b/.test(s)) return false;
  if (/^(public domain|pd\b|cc0|cc zero)/.test(s)) return true;
  return /^cc by( sa)?( \d(\.\d)?)?( [a-z]{2})?$/.test(s);
}

/** The Wikidata "image" (P18) file name of an item, or null. Pure, for tests. */
export function imageFromEntity(entity: unknown, id: string): string | null {
  const e = (entity as { entities?: Record<string, { claims?: { P18?: { mainsnak?: { datavalue?: { value?: unknown } } }[] } }> })
    ?.entities?.[id];
  const value = e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** HTML from Commons metadata ("<a href=...>Jane Doe</a>") as plain text. */
export function plainText(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The photo facts from a Commons imageinfo answer, or null when something we need is missing. Pure. */
export function photoFromImageInfo(answer: unknown): CommonsPhoto | null {
  const pages = (answer as { query?: { pages?: Record<string, unknown> } })?.query?.pages ?? {};
  const page = Object.values(pages)[0] as
    | { title?: string; imageinfo?: { thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] }
    | undefined;
  const info = page?.imageinfo?.[0];
  if (!page?.title || !info) return null;
  const meta = info.extmetadata ?? {};
  const license = plainText(meta.LicenseShortName?.value);
  const imageUrl = info.thumburl ?? info.url;
  if (!imageUrl || !info.descriptionurl) return null;
  return {
    title: page.title,
    imageUrl,
    pageUrl: info.descriptionurl,
    author: plainText(meta.Artist?.value) || "unknown author",
    license,
    licenseUrl: plainText(meta.LicenseUrl?.value) || null,
  };
}

async function getJson(url: string, fetchFn: typeof fetch): Promise<unknown> {
  const res = await fetchFn(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return res.json();
}

/**
 * The band's photo on Commons, via its Wikidata item, when its licence allows changes. Null when the
 * item has no image, or its licence does not allow a changed copy (the reason is in `skipped`).
 */
export async function findCommonsPhoto(
  wikidataId: string,
  fetchFn: typeof fetch = fetch,
  width = 1200,
): Promise<{ photo: CommonsPhoto | null; skipped?: string }> {
  const entity = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`, fetchFn);
  const file = imageFromEntity(entity, wikidataId);
  if (!file) return { photo: null, skipped: "no image on Wikidata" };
  const params = new URLSearchParams({
    action: "query",
    titles: `File:${file}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: String(width),
    format: "json",
  });
  const photo = photoFromImageInfo(await getJson(`https://commons.wikimedia.org/w/api.php?${params}`, fetchFn));
  if (!photo) return { photo: null, skipped: "Commons gave no usable file information" };
  if (!licenseAllowsChanges(photo.license)) return { photo: null, skipped: `licence does not allow changes (${photo.license || "unknown"})` };
  return { photo };
}

/** Download the (resized) image bytes. */
export async function downloadImage(url: string, fetchFn: typeof fetch = fetch): Promise<Buffer> {
  const res = await fetchFn(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`image download answered ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * The credit line shown with the photo. CC licences require author, licence and a note that the
 * picture was changed; CC BY-SA also means our photocopy is shared under the same licence.
 */
export function creditLine(photo: Pick<CommonsPhoto, "author" | "license">): string {
  const changed = /sa/i.test(photo.license) ? "photocopied by STAGEDIVE, shared under the same licence" : "photocopied by STAGEDIVE";
  return `Photo: ${photo.author} / ${photo.license}, via Wikimedia Commons (${changed})`;
}
