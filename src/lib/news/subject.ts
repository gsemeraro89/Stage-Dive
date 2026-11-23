// What a news story is mainly about (owner, 23 Nov 2026: every story gets a picture, like OpenDecks):
// one band or one festival, from what the news job already knows (the story's bands, most important first,
// and its festival). The picture follows the subject (src/lib/news/covers.ts).
// - A festival story (topic "festival": a line-up, an edition) naming several bands, or none, is about
//   the festival; one naming a single band is about that band (a booking, a headliner).
// - Any other story is about its first band; a story with no band is about its festival.
import type { PrismaClient } from "../../generated/prisma/client";

export type SubjectKind = "band" | "venue";

export interface NewsSubject {
  kind: SubjectKind;
  /** A band slug or a venue slug, as `kind` says. */
  slug: string;
}

/** The subject of a story. Pure. */
export function newsSubject(a: { topic: string; bandSlugs: string[]; venueSlug: string | null }): NewsSubject | null {
  const bands = a.bandSlugs.filter(Boolean);
  if (a.venueSlug && (bands.length === 0 || (a.topic === "festival" && bands.length > 1))) return { kind: "venue", slug: a.venueSlug };
  if (bands.length) return { kind: "band", slug: bands[0] };
  return null;
}

/** The subject as the article's two columns. Pure. */
export function subjectColumns(a: Parameters<typeof newsSubject>[0]): { subject: string | null; subjectKind: SubjectKind | null } {
  const s = newsSubject(a);
  return { subject: s?.slug ?? null, subjectKind: s?.kind ?? null };
}

/** The stored subject of an article, or the one worked out from its bands and festival when it has none yet. Pure. */
export function storedSubject(a: { subject: string | null; subjectKind: string | null; topic: string; bandSlugs: string[]; venueSlug: string | null }): NewsSubject | null {
  if (a.subject && (a.subjectKind === "band" || a.subjectKind === "venue")) return { kind: a.subjectKind, slug: a.subject };
  return newsSubject(a);
}

/**
 * Admin op news-subjects: give every article without a subject the one its bands and festival say
 * (articles written before 23 Nov 2026). `all` works it out again for every article. Light: reads the
 * four fields it needs, writes only rows that change.
 */
export async function backfillNewsSubjects(db: PrismaClient, opts: { all?: boolean } = {}) {
  const rows = await db.newsArticle.findMany({
    where: opts.all ? {} : { subject: null },
    select: { id: true, topic: true, bandSlugs: true, venueSlug: true, subject: true, subjectKind: true, updatedAt: true },
  });
  const stats = { looked: rows.length, set: 0, none: 0, byKind: { band: 0, venue: 0 } };
  for (const r of rows) {
    const next = subjectColumns(r);
    if (!next.subject) {
      stats.none++;
      continue;
    }
    stats.byKind[next.subjectKind!]++;
    if (next.subject === r.subject && next.subjectKind === r.subjectKind) continue;
    // The article's text did not change: its "updated" date (sitemap, Open Graph) stays as it was.
    await db.newsArticle.update({ where: { id: r.id }, data: { ...next, updatedAt: r.updatedAt } });
    stats.set++;
  }
  return stats;
}
