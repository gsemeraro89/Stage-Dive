// What a page needs to show a band's photocopied photo, with its credit (CC licences require it).
import { getDb } from "../db";
import { creditLine } from "./wikimedia";

export interface BandPhotoView {
  /** Image URL on this site, changes when the photo changes. */
  src: string;
  width: number;
  height: number;
  /** "Photo: Jane Doe / CC BY-SA 4.0, via Wikimedia Commons (photocopied by STAGEDIVE, ...)" */
  credit: string;
  /** The Commons page of the original (link the credit here). */
  sourcePage: string;
  license: string;
  licenseUrl: string | null;
}

export function toBandPhotoView(
  slug: string,
  p: { width: number; height: number; author: string; license: string; licenseUrl: string | null; sourcePage: string; updatedAt: Date },
): BandPhotoView {
  return {
    src: `/photos/bands/${slug}?v=${p.updatedAt.getTime().toString(36)}`,
    width: p.width,
    height: p.height,
    credit: creditLine(p),
    sourcePage: p.sourcePage,
    license: p.license,
    licenseUrl: p.licenseUrl,
  };
}

const PHOTO_FIELDS = { width: true, height: true, author: true, license: true, licenseUrl: true, sourcePage: true, updatedAt: true } as const;

/** One band's photo, or null when it has none. */
export async function bandPhotoFor(slug: string): Promise<BandPhotoView | null> {
  const p = await getDb().bandPhoto.findFirst({ where: { artist: { slug } }, select: PHOTO_FIELDS });
  return p ? toBandPhotoView(slug, p) : null;
}

/** Photos for several bands at once (lists, the homepage): slug -> photo; bands without one are left out. */
export async function bandPhotosFor(slugs: string[]): Promise<Map<string, BandPhotoView>> {
  if (!slugs.length) return new Map();
  const rows = await getDb().bandPhoto.findMany({
    where: { artist: { slug: { in: [...new Set(slugs)] } } },
    select: { ...PHOTO_FIELDS, artist: { select: { slug: true } } },
  });
  return new Map(rows.map((r) => [r.artist.slug, toBandPhotoView(r.artist.slug, r)]));
}
