// One-off fixes the owner asks for in chat, run through collect.yml (input admin_ops) because the
// database can only be written from GitHub Actions.

import type { PrismaClient } from "../../generated/prisma/client";

export interface MergeResult {
  from: string;
  into: string;
  creditsMoved: number;
  creditsDropped: number;
}

/**
 * Two pages for the same person: move every credit of `fromSlug` to `intoSlug`, keep the other name
 * as "aka", then delete the extra page (its similarity rows go with it; the next run recomputes them).
 * A concert credited to both keeps one credit, the stronger role (MAIN over WITH).
 */
export async function mergeArtists(db: PrismaClient, fromSlug: string, intoSlug: string): Promise<MergeResult> {
  if (fromSlug === intoSlug) throw new Error("merge: same artist");
  return db.$transaction(async (tx) => {
    const from = await tx.artist.findUniqueOrThrow({ where: { slug: fromSlug }, include: { credits: true } });
    const into = await tx.artist.findUniqueOrThrow({ where: { slug: intoSlug }, include: { credits: true } });
    let moved = 0;
    let dropped = 0;
    for (const c of from.credits) {
      const existing = into.credits.find((x) => x.concertId === c.concertId);
      if (existing) {
        if (existing.role !== "MAIN" && c.role === "MAIN") {
          await tx.concertArtist.update({ where: { concertId_artistId: { concertId: c.concertId, artistId: into.id } }, data: { role: "MAIN" } });
        }
        dropped++;
      } else {
        await tx.concertArtist.create({ data: { ...c, artistId: into.id } });
        moved++;
      }
    }
    await tx.concertArtist.deleteMany({ where: { artistId: from.id } });
    const names = [into.aka, from.name, from.aka].filter((n): n is string => Boolean(n) && n !== into.name);
    await tx.artist.update({
      where: { id: into.id },
      data: {
        aka: [...new Set(names)].join(", ") || null,
        origin: into.origin ?? from.origin,
        bornYear: into.bornYear ?? from.bornYear,
        label: into.label ?? from.label,
        youtubeChannelId: into.youtubeChannelId ?? from.youtubeChannelId,
      },
    });
    await tx.artist.delete({ where: { id: from.id } });
    return { from: fromSlug, into: intoSlug, creditsMoved: moved, creditsDropped: dropped };
  });
}

/** Review items still waiting although their video is already a concert (published another way): close them. */
export async function closeStaleReviewItems(db: PrismaClient): Promise<number> {
  const pending = await db.reviewItem.findMany({ where: { status: "PENDING" }, select: { id: true, youtubeId: true } });
  if (!pending.length) return 0;
  const listed = new Set(
    (await db.concert.findMany({ where: { youtubeId: { in: [...new Set(pending.map((p) => p.youtubeId))] } }, select: { youtubeId: true } })).map((s) => s.youtubeId),
  );
  // Older copies of the same video waiting twice: keep only the newest.
  const newest = new Map<string, number>();
  for (const p of pending) newest.set(p.youtubeId, Math.max(newest.get(p.youtubeId) ?? 0, p.id));
  const close = pending.filter((p) => listed.has(p.youtubeId) || newest.get(p.youtubeId) !== p.id).map((p) => p.id);
  if (!close.length) return 0;
  return (await db.reviewItem.updateMany({ where: { id: { in: close } }, data: { status: "APPROVED", decidedAt: new Date() } })).count;
}

/** The owner said no to these videos in the review queue: close them and remember the verdict. */
export async function rejectReviewVideos(db: PrismaClient, youtubeIds: string[]): Promise<number> {
  const { recordDecision } = await import("../collector/store");
  const closed = await db.reviewItem.updateMany({
    where: { status: "PENDING", youtubeId: { in: youtubeIds } },
    data: { status: "REJECTED", decidedAt: new Date() },
  });
  for (const id of youtubeIds) await recordDecision(db, id, "NOT_ROCK", "rejected by owner");
  return closed.count;
}

/**
 * A page that is not an artist but a group of them ("3 Are Legend"): every concert credited to it is
 * credited to each member instead (MAIN), then the page is deleted.
 */
export async function splitArtist(db: PrismaClient, groupSlug: string, memberSlugs: string[]): Promise<{ concerts: number }> {
  return db.$transaction(async (tx) => {
    const group = await tx.artist.findUniqueOrThrow({ where: { slug: groupSlug }, include: { credits: true } });
    const members = [];
    for (const slug of memberSlugs) members.push(await tx.artist.findUniqueOrThrow({ where: { slug } }));
    for (const c of group.credits) {
      for (const [i, m] of members.entries()) {
        await tx.concertArtist.upsert({
          where: { concertId_artistId: { concertId: c.concertId, artistId: m.id } },
          create: { concertId: c.concertId, artistId: m.id, role: "MAIN", position: c.position + i },
          update: { role: "MAIN" },
        });
      }
    }
    await tx.concertArtist.deleteMany({ where: { artistId: group.id } });
    await tx.artist.delete({ where: { id: group.id } });
    return { concerts: group.credits.length };
  });
}

/** The owner does not want this concert on the site: hidden, kept in the database. */
export async function hideConcert(db: PrismaClient, slug: string): Promise<string> {
  const concert = await db.concert.update({ where: { slug }, data: { status: "HIDDEN" } });
  return concert.slug;
}
