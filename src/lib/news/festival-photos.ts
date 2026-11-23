// Free festival photos for news pictures (owner, 23 Nov 2026: "the news section has to be more visual,
// similar to what we did on OpenDecks"; ported from OpenDecks src/lib/news/festival-photos.ts).
// Wikidata knows most big festivals and often names a Commons photo of them ("image", P18): a crowd or a
// stage. Like the band photos (src/lib/photos), only licences that allow a changed copy are used (public
// domain, CC0, CC BY, CC BY-SA), the photo is photocopied, and it is stored with its credit (author,
// licence, link). Press photos and festival-owned photos are copyrighted and never used.
// Network calls come in as `deps`, so the job can be tested without the internet. Run by the news job
// (scripts/news.ts, after each collector run) and by admin op festival-photos; each festival is looked at
// again after 30 days.
import type { PrismaClient } from "../../generated/prisma/client";
import { VISIBLE } from "../filters";
import { photocopy } from "../photos/photocopy";
import { creditLine, downloadImage, findCommonsPhoto, type CommonsPhoto } from "../photos/wikimedia";
import { FESTIVAL_ALIASES, festivalBase } from "./match";

export const FESTIVAL_PHOTO_REFRESH_DAYS = 30;
/** Most festivals looked at in one run (Wikidata and Commons are asked a few times per festival). */
export const FESTIVAL_PHOTO_LIMIT = 40;
/** Wikidata search results tried per festival. */
const HITS_TRIED = 3;
const UA = `STAGEDIVE/0.1 (+${process.env.SITE_URL || "https://fullconcert.live"}) festival-photos`;

export interface WikidataHit {
  id: string;
  label?: string;
  description?: string;
}

export interface FestivalPhotoDeps {
  /** Wikidata items for a name (wbsearchentities). */
  search(name: string): Promise<WikidataHit[]>;
  /** The item's Commons photo when its licence allows changes (src/lib/photos/wikimedia.ts). */
  findPhoto(qid: string): Promise<{ photo: CommonsPhoto | null; skipped?: string }>;
  download(url: string): Promise<Buffer>;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Descriptions of a festival or a music event on Wikidata. */
const FESTIVAL_DESCRIPTION = /\b(festival|open air|music event|concert series|rock event)\b/i;
/** Festivals that are not music ones ("film festival in Venice", "beer festival"). */
const NOT_MUSIC = /\b(film|cinema|movie|beer|food|wine|literary|literature|book|comedy|theatre|theater|dance company|television)\b/i;

/** Names a festival goes by, for the Wikidata search: its own, without year or stage, and the press's other names. Pure. */
export function festivalSearchNames(name: string): string[] {
  return [...new Set([festivalBase(name), name, ...(FESTIVAL_ALIASES[name] ?? [])])].filter((n) => n.trim().length >= 3);
}

/**
 * Search results that are this festival: described as a (music) festival or open air, and named like it.
 * Best first. Pure.
 */
export function festivalHits(name: string, hits: WikidataHit[]): WikidataHit[] {
  const want = fold(name)
    .replace(/\b(music festival|festival|open air|fest)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return hits.filter((h) => {
    const d = h.description ?? "";
    if (!FESTIVAL_DESCRIPTION.test(d) || NOT_MUSIC.test(d)) return false;
    const label = fold(h.label ?? "");
    const words = (x: string) => ` ${x} `;
    return !!want && !!label && (words(label).includes(words(want)) || words(want).includes(words(label)));
  });
}

/**
 * Whether a Commons file pictures one band playing there rather than the festival: a file named after
 * one of our bands ("Metallica, Rock am Ring 2014.jpg") is the band's photo. Pure.
 */
export function showsAnArtist(file: string, artistNames: string[]): boolean {
  const f = ` ${fold(file.replace(/\.[a-z0-9]+$/i, ""))} `;
  const joined = f.replace(/ /g, "");
  return artistNames.some((n) => {
    const a = fold(n).replace(/^the /, "");
    if (!a) return false;
    // As words ("Metallica, Rock am Ring"), or run together for longer names ("RageAgainstTheMachine").
    return (a.length >= 4 && f.includes(` ${a} `)) || (a.replace(/ /g, "").length >= 8 && joined.includes(a.replace(/ /g, "")));
  });
}

/** A logo, poster or map rather than a photo (Wikidata's "image" of a festival is sometimes one). Pure. */
export function isLogoOrGraphic(file: string): boolean {
  return /\.(svg|gif)$/i.test(file) || /\b(logo|logos|logotype|wordmark|emblem|poster|flyer|map|plan|ticket|wristband|banner|lineup|line up)\b/.test(fold(file.replace(/\.[a-z0-9]+$/i, "")));
}

/** Words of a festival scene in a Commons file name. */
const SCENE = /\b(stage|stages|crowd|festival|mainstage|main|arena|tent|aerial|luftbild|panorama|audience|fans|open air|grounds|site|entrance|night|day|campsite|camping|moshpit|pit|field|fields|infield)\b/;

/**
 * Whether a Commons file is named like a picture of this festival: it names the festival (or one of its
 * other names) or a festival scene (a stage, the crowd). "James Hetfield.jpg" on a Download item is a
 * portrait of one musician, not the festival. Pure.
 */
export function namedLikeTheFestival(file: string, festivalNames: string[]): boolean {
  const f = fold(file.replace(/\.[a-z0-9]+$/i, ""));
  const joined = f.replace(/ /g, "");
  const named = festivalNames.some((n) =>
    fold(n)
      .replace(/\b(the|festival|music|open air|fest|in|am|de|of)\b/g, " ")
      .split(" ")
      .filter((w) => w.length >= 3)
      .some((w) => joined.includes(w)),
  );
  return named || SCENE.test(f);
}

/** The Commons file name of a photo ("File:Wacken 2016.jpg" -> "Wacken 2016.jpg"). Pure. */
const fileName = (title: string) => title.replace(/^File:/i, "");

/**
 * Pick the festival's photo: the first Wikidata item that is this festival and has a photo of it (not a
 * logo, not one band) with a licence that allows changes. `skipped` says why there is none.
 */
export async function findFestivalPhoto(
  name: string,
  deps: Pick<FestivalPhotoDeps, "search" | "findPhoto">,
  artistNames: string[],
): Promise<{ qid: string | null; photo: CommonsPhoto | null; skipped?: string }> {
  const names = festivalSearchNames(name);
  let hits: WikidataHit[] = [];
  for (const n of names) {
    hits = festivalHits(n, await deps.search(n));
    if (hits.length) break;
  }
  if (!hits.length) return { qid: null, photo: null, skipped: "not on Wikidata" };
  let skipped = "no photo on Wikidata";
  for (const hit of hits.slice(0, HITS_TRIED)) {
    const found = await deps.findPhoto(hit.id);
    if (!found.photo) {
      skipped = found.skipped ?? skipped;
      continue;
    }
    const file = fileName(found.photo.title);
    if (isLogoOrGraphic(file)) skipped = `only a logo or graphic (${file})`;
    else if (showsAnArtist(file, artistNames)) skipped = `a photo of one band (${file})`;
    else if (!namedLikeTheFestival(file, names)) skipped = `not a photo of the festival (${file})`;
    else return { qid: hit.id, photo: found.photo };
  }
  return { qid: hits[0].id, photo: null, skipped };
}

export interface FestivalPhotoStats {
  looked: number;
  added: string[];
  replaced: string[];
  removed: string[];
  none: string[];
  errors: string[];
}

/**
 * Look for a photo of every festival on the site not looked at in the last 30 days (`force`: all of them),
 * festivals in the news first. Light: the festival list and the photo rows' dates, never the images.
 */
export async function refreshFestivalPhotos(
  db: PrismaClient,
  deps: FestivalPhotoDeps = festivalPhotoDeps,
  opts: { limit?: number; now?: Date; force?: boolean } = {},
): Promise<FestivalPhotoStats> {
  const now = opts.now ?? new Date();
  const due = new Date(now.getTime() - FESTIVAL_PHOTO_REFRESH_DAYS * 86_400_000);
  const [festivals, inNews, bands] = await Promise.all([
    db.venue.findMany({
      where: { concerts: { some: { ...VISIBLE, venueKind: { slug: "festival" } } } },
      select: { id: true, slug: true, name: true, photo: { select: { sourceTitle: true, checkedAt: true, width: true } } },
      orderBy: { name: "asc" },
    }),
    db.newsArticle.findMany({ where: { status: "PUBLISHED", venueSlug: { not: null } }, select: { venueSlug: true }, distinct: ["venueSlug"] }),
    db.artist.findMany({ where: { credits: { some: { role: "MAIN", concert: VISIBLE } } }, select: { name: true } }),
  ]);
  const news = new Set(inNews.map((n) => n.venueSlug));
  const artistNames = bands.map((b) => b.name);
  const todo = festivals
    .filter((f) => opts.force || !f.photo || f.photo.checkedAt < due)
    .sort((a, b) => Number(news.has(b.slug)) - Number(news.has(a.slug)))
    .slice(0, opts.limit ?? FESTIVAL_PHOTO_LIMIT);
  const stats: FestivalPhotoStats = { looked: todo.length, added: [], replaced: [], removed: [], none: [], errors: [] };

  for (const f of todo) {
    try {
      const { qid, photo, skipped } = await findFestivalPhoto(f.name, deps, artistNames);
      const had = Boolean(f.photo?.width);
      if (!photo) {
        // A photo whose licence changed, or that is gone from Wikidata, comes off the site.
        const data = { qid, image: null, width: null, height: null, sourceTitle: null, sourcePage: null, author: null, license: null, licenseUrl: null, skipped: skipped ?? "no photo", checkedAt: now };
        await db.festivalPhoto.upsert({ where: { venueId: f.id }, create: { venueId: f.id, ...data }, update: data });
        (had ? stats.removed : stats.none).push(`${f.name}: ${skipped}`);
        continue;
      }
      const credit = { qid, sourcePage: photo.pageUrl, author: photo.author, license: photo.license, licenseUrl: photo.licenseUrl, skipped: null, checkedAt: now };
      // Same Commons file as before: only the credit is refreshed, the image is not made again.
      if (had && f.photo?.sourceTitle === photo.title) {
        await db.festivalPhoto.update({ where: { venueId: f.id }, data: credit });
        continue;
      }
      const copy = await photocopy(await deps.download(photo.imageUrl), { seed: `festival-${f.slug}` });
      const data = { ...credit, image: new Uint8Array(copy.png), width: copy.width, height: copy.height, sourceTitle: photo.title };
      await db.festivalPhoto.upsert({ where: { venueId: f.id }, create: { venueId: f.id, ...data }, update: data });
      (had ? stats.replaced : stats.added).push(`${f.name}: ${photo.title} (${photo.license})`);
    } catch (e) {
      stats.errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    }
  }
  return stats;
}

export const festivalPhotoDeps: FestivalPhotoDeps = {
  async search(name) {
    const res = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&type=item&limit=7&format=json`,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
    return ((await res.json()) as { search?: WikidataHit[] }).search ?? [];
  },
  findPhoto: (qid) => findCommonsPhoto(qid),
  download: (url) => downloadImage(url),
};

// ---- On the pages ----

export interface FestivalPhotoView {
  /** Image URL on this site (src/app/photos/festivals/[slug]/route.ts); changes when the photo changes. */
  src: string;
  width: number;
  height: number;
  /** "Photo: Jane Doe / CC BY-SA 4.0, via Wikimedia Commons (photocopied by STAGEDIVE, ...)" */
  credit: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  /** The Commons page of the original (link the credit here). */
  sourcePage: string;
}

/** A stored festival photo as the pages show it; null when the row has no usable photo. Pure. */
export function toFestivalPhotoView(
  slug: string,
  p: { width: number | null; height: number | null; author: string | null; license: string | null; licenseUrl: string | null; sourcePage: string | null; updatedAt: Date },
): FestivalPhotoView | null {
  if (!p.width || !p.height || !p.author || !p.license || !p.sourcePage) return null;
  return {
    src: `/photos/festivals/${slug}?v=${p.updatedAt.getTime().toString(36)}`,
    width: p.width,
    height: p.height,
    credit: creditLine({ author: p.author, license: p.license }),
    author: p.author,
    license: p.license,
    licenseUrl: p.licenseUrl,
    sourcePage: p.sourcePage,
  };
}

/** Every festival photo (light fields, never the image): venue slug -> photo. */
export async function festivalPhotoViews(db: PrismaClient): Promise<Map<string, FestivalPhotoView>> {
  const rows = await db.festivalPhoto.findMany({
    where: { width: { not: null } },
    select: { width: true, height: true, author: true, license: true, licenseUrl: true, sourcePage: true, updatedAt: true, venue: { select: { slug: true } } },
  });
  const out = new Map<string, FestivalPhotoView>();
  for (const r of rows) {
    const v = toFestivalPhotoView(r.venue.slug, r);
    if (v) out.set(r.venue.slug, v);
  }
  return out;
}
