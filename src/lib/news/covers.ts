// The picture of every news story (owner, 23 Nov 2026: "the news section has to be more visual, similar to
// what we did on OpenDecks"). Our own pictures only, never the source's. In this order:
//   1. the subject band's photo (Wikimedia Commons, photocopied, with its credit: src/lib/photos);
//   2. the story's festival photo (Wikimedia Commons, photocopied, with its credit: ./festival-photos.ts);
//   3. the subject band's most watched concert here (official first): its thumbnail;
//   4. for a story about a festival, the festival's newest concert here;
//   5. the most watched concert of any other band named in the story;
//   6. the festival's newest concert here;
//   7. none (the pages then share the site's card).
// Concert thumbnails are shown as YouTube serves them (never altered). One batched, light read for all
// stories, kept 30 minutes in memory (src/lib/memo.ts): no image bytes, one row per band in the news.
import { Prisma } from "../../generated/prisma/client";
import { getDb } from "../db";
import { VISIBLE } from "../filters";
import { cached } from "../memo";
import { bandPhotosFor, type BandPhotoView } from "../photos/view";
import { listArtists, listVenues, type Cover } from "../queries";
import { thumbnailSources } from "../thumbnails";
import { festivalPhotoViews, type FestivalPhotoView } from "./festival-photos";
import { storedSubject } from "./subject";

/** Where a story's picture comes from (the designer may treat photos and concert frames differently). */
export type NewsCoverKind = "band-photo" | "festival-photo" | "band-concert" | "festival-concert";

/** The credit a Commons photo needs next to it (author, licence, link): shown on the article page. */
export interface NewsCoverCredit {
  /** "Photo: Jane Doe / CC BY-SA 4.0, via Wikimedia Commons (photocopied by STAGEDIVE, ...)" */
  line: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  /** The photo's page on Wikimedia Commons (link the credit here). */
  sourcePage: string;
}

export interface NewsCover {
  src: string;
  /** Concert thumbnails only (YouTube's sizes); photos are one size. */
  srcSet?: string;
  width: number;
  height: number;
  /** What it shows (the band or festival name): the alt text. */
  of: string;
  kind: NewsCoverKind;
  /** Commons photos only. */
  credit?: NewsCoverCredit;
  /** A channel avatar (square, shown whole) rather than a concert frame. */
  portrait?: boolean;
}

/** What the picture is chosen from: lists keyed by band or venue slug. */
export interface NewsCoverSources {
  bands: Map<string, { name: string; cover: Cover | null }>;
  festivals: Map<string, { name: string; cover: Cover | null }>;
  /** Band names (folded) -> slug, for the artists a story names that have a page here. */
  bandByName: Map<string, string>;
  bandPhotos: Map<string, BandPhotoView>;
  festivalPhotos: Map<string, FestivalPhotoView>;
  /** Each news band's most watched visible concert, official first. */
  bandConcerts: Map<string, { youtubeId: string; thumbnailUrl: string | null }>;
}

export interface CoverArticle {
  topic: string;
  bandSlugs: string[];
  venueSlug: string | null;
  venueName?: string | null;
  subject?: string | null;
  subjectKind?: string | null;
  /** Artists the story names, as spelled in the source. */
  artists?: string[];
}

/** A name folded for matching ("Motörhead" = "motorhead"). Pure. */
export const foldName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const photoCover = (p: BandPhotoView | FestivalPhotoView, of: string, kind: NewsCoverKind): NewsCover => ({
  src: p.src,
  width: p.width,
  height: p.height,
  of,
  kind,
  credit: { line: p.credit, author: p.author, license: p.license, licenseUrl: p.licenseUrl, sourcePage: p.sourcePage },
});

const concertCover = (c: { youtubeId: string; thumbnailUrl: string | null }, of: string, kind: NewsCoverKind): NewsCover => {
  const t = thumbnailSources(c.youtubeId, c.thumbnailUrl);
  return { src: t.src, srcSet: t.srcSet, width: t.width, height: t.height, of, kind };
};

const listCover = (c: Cover, of: string, kind: NewsCoverKind): NewsCover => ({
  src: c.thumbnail.src,
  srcSet: c.thumbnail.srcSet,
  width: c.thumbnail.width,
  height: c.thumbnail.height,
  of,
  kind,
  ...(c.portrait ? { portrait: true } : {}),
});

/** A story's picture, in the order above. Pure. */
export function chooseNewsCover(a: CoverArticle, s: NewsCoverSources): NewsCover | null {
  const subject = storedSubject({ subject: a.subject ?? null, subjectKind: a.subjectKind ?? null, topic: a.topic, bandSlugs: a.bandSlugs, venueSlug: a.venueSlug });
  const subjectBand = subject?.kind === "band" ? subject.slug : null;
  const festival = a.venueSlug ?? (subject?.kind === "venue" ? subject.slug : null);
  const bandName = (slug: string) => s.bands.get(slug)?.name ?? null;
  const festivalName = festival ? (s.festivals.get(festival)?.name ?? a.venueName ?? null) : null;

  // 1. The subject band's photo.
  if (subjectBand) {
    const p = s.bandPhotos.get(subjectBand);
    const name = bandName(subjectBand);
    if (p && name) return photoCover(p, name, "band-photo");
  }
  // 2. The festival's photo.
  if (festival && festivalName) {
    const p = s.festivalPhotos.get(festival);
    if (p) return photoCover(p, festivalName, "festival-photo");
  }
  // 3. The subject band's most watched concert.
  if (subjectBand) {
    const c = bandConcert(subjectBand, s);
    if (c) return c;
  }
  // 4. A story about the festival: its newest concert here.
  const festivalConcert = () => {
    const f = festival ? s.festivals.get(festival) : undefined;
    return f?.cover ? listCover(f.cover, f.name, "festival-concert") : null;
  };
  if (subject?.kind === "venue") {
    const c = festivalConcert();
    if (c) return c;
  }
  // 5. Any other band in the story: its bands first, then the artists it names that have a page here.
  const named = (a.artists ?? []).map((n) => s.bandByName.get(foldName(n))).filter((x): x is string => Boolean(x));
  for (const slug of new Set([...a.bandSlugs, ...named])) {
    if (slug === subjectBand) continue;
    const c = bandConcert(slug, s);
    if (c) return c;
  }
  // 6. The festival's newest concert. 7. None.
  return festivalConcert();
}

/** A band's most watched concert here (official first), else the picture its band page uses. */
function bandConcert(slug: string, s: NewsCoverSources): NewsCover | null {
  const band = s.bands.get(slug);
  if (!band) return null;
  const c = s.bandConcerts.get(slug);
  if (c) return concertCover(c, band.name, "band-concert");
  return band.cover ? listCover(band.cover, band.name, "band-concert") : null;
}

/** Each band's most watched visible concert (official first), for the given bands only: one row per band. */
async function mostWatchedConcerts(slugs: string[]): Promise<Map<string, { youtubeId: string; thumbnailUrl: string | null }>> {
  if (!slugs.length) return new Map();
  const sources = (VISIBLE as { source?: { in: string[] } }).source?.in;
  const rows = await getDb().$queryRaw<{ slug: string; youtubeId: string; thumbnailUrl: string | null }[]>`
    SELECT DISTINCT ON (a.slug) a.slug AS "slug", c.youtube_id AS "youtubeId", c.thumbnail_url AS "thumbnailUrl"
    FROM concert_artists ca
    JOIN artists a ON a.id = ca.artist_id
    JOIN concerts c ON c.id = ca.concert_id
    WHERE ca.role = 'MAIN' AND c.status = 'PUBLISHED' AND c.embeddable = true AND c.privacy_status = 'public'
      AND a.slug = ANY(${slugs})
      ${sources ? Prisma.sql`AND c.source::text = ANY(${sources})` : Prisma.empty}
    ORDER BY a.slug, c.source_kind ASC, c.view_count DESC, c.id ASC`;
  return new Map(rows.map((r) => [r.slug, { youtubeId: r.youtubeId, thumbnailUrl: r.thumbnailUrl }]));
}

/** Everything the pictures are chosen from, for every published story at once. Light; kept 30 minutes. */
export const newsCoverSources = cached(
  "newsCoverSources",
  async (): Promise<NewsCoverSources> => {
    const db = getDb();
    const [bands, festivals, inNews, festivalPhotos] = await Promise.all([
      listArtists(),
      listVenues(),
      db.newsArticle.findMany({ where: { status: "PUBLISHED" }, select: { bandSlugs: true } }),
      festivalPhotoViews(db),
    ]);
    const bandMap = new Map(bands.map((b) => [b.slug, { name: b.name, cover: b.cover }]));
    const newsBands = [...new Set(inNews.flatMap((a) => a.bandSlugs))].filter((s) => bandMap.has(s));
    const [bandPhotos, bandConcerts] = await Promise.all([bandPhotosFor(newsBands), mostWatchedConcerts(newsBands)]);
    return {
      bands: bandMap,
      festivals: new Map(festivals.map((f) => [f.slug, { name: f.name, cover: f.cover }])),
      bandByName: new Map(bands.map((b) => [foldName(b.name), b.slug])),
      bandPhotos,
      festivalPhotos,
      bandConcerts,
    };
  },
  30 * 60_000,
);
