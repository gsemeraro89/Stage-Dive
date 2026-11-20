// One-off fixes the owner asks for in chat, run through collect.yml (input admin_ops) because the
// database can only be written from GitHub Actions.

import type { PrismaClient } from "../../generated/prisma/client";
import { countryName } from "../places";

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

// ---- Places (owner, 20 Nov 2026: "Pinkpop" and "Pinkpop Festival" were two pages) ----

export interface VenueMergeResult {
  from: string;
  into: string;
  concertsMoved: number;
  /** True when there was nothing left to do (the merge had already run). */
  alreadyDone: boolean;
}

/**
 * Two records for the same venue: every concert moves to `intoSlug` (its slug and name are kept), the
 * other venue's slug and its own old slugs become aliases of the kept one, so /venues/<from> and its
 * year pages redirect permanently (308), then the empty venue is deleted. Safe to run again.
 */
export async function mergeVenues(db: PrismaClient, fromSlug: string, intoSlug: string): Promise<VenueMergeResult> {
  if (fromSlug === intoSlug) throw new Error("merge-venue: same venue");
  return db.$transaction(async (tx) => {
    const into = await tx.venue.findUniqueOrThrow({ where: { slug: intoSlug } });
    const from = await tx.venue.findUnique({ where: { slug: fromSlug } });
    if (!from) {
      const alias = await tx.venueAlias.findUnique({ where: { slug: fromSlug } });
      if (alias?.venueId === into.id) return { from: fromSlug, into: intoSlug, concertsMoved: 0, alreadyDone: true };
      throw new Error(`merge-venue: no venue "${fromSlug}"`);
    }
    const moved = await tx.concert.updateMany({ where: { venueId: from.id }, data: { venueId: into.id } });
    await tx.venueAlias.updateMany({ where: { venueId: from.id }, data: { venueId: into.id } });
    await tx.venueAlias.upsert({ where: { slug: fromSlug }, create: { slug: fromSlug, venueId: into.id }, update: { venueId: into.id } });
    // The kept venue's own slug can never be an alias.
    await tx.venueAlias.deleteMany({ where: { slug: intoSlug } });
    await tx.venue.update({
      where: { id: into.id },
      data: { city: into.city ?? from.city, country: countryName(into.country ?? from.country) },
    });
    await tx.venue.delete({ where: { id: from.id } });
    return { from: fromSlug, into: intoSlug, concertsMoved: moved.count, alreadyDone: false };
  });
}

/** Every country on concerts and venues as its full English name ("NL" -> "Netherlands"). Safe to run again. */
export async function normalizeCountries(db: PrismaClient): Promise<{ concerts: number; venues: number; changes: string[] }> {
  const changes = new Set<string>();
  let concerts = 0;
  let venues = 0;
  for (const { country } of await db.concert.findMany({ where: { country: { not: null } }, distinct: ["country"], select: { country: true } })) {
    const name = countryName(country);
    if (name === country) continue;
    concerts += (await db.concert.updateMany({ where: { country }, data: { country: name } })).count;
    changes.add(`${country} -> ${name}`);
  }
  for (const { country } of await db.venue.findMany({ where: { country: { not: null } }, distinct: ["country"], select: { country: true } })) {
    const name = countryName(country);
    if (name === country) continue;
    venues += (await db.venue.updateMany({ where: { country }, data: { country: name } })).count;
    changes.add(`${country} -> ${name}`);
  }
  return { concerts, venues, changes: [...changes].sort() };
}
