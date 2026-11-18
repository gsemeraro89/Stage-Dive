// Database side of the collector: find duplicates, save accepted concerts, record decisions, refresh.
import type { PrismaClient } from "../../generated/prisma/client";
import { SETTINGS, SITE_GENRES } from "../catalogue";
import { slugify } from "../slug";
import { thumbnailUrl, type ThumbnailName } from "../thumbnails";
import type { FullClassification } from "./classify";
import { isSameConcert, resolveDuplicate, type ConcertIdentity } from "./rules";
import type { YouTubeVideo } from "./youtube";

export interface NewConcert {
  video: YouTubeVideo;
  classification: FullClassification;
  channel: { youtubeChannelId: string; name: string; isOfficial: boolean };
  thumbnail: ThumbnailName | null;
}

function identityOfNew(n: NewConcert): ConcertIdentity {
  return {
    youtubeId: n.video.youtubeId,
    artistSlugs: n.classification.mainArtists.map(slugify),
    venueName: n.classification.venue || null,
    publishedAt: n.video.publishedAt,
    durationSeconds: n.video.durationSeconds,
    isOfficial: n.channel.isOfficial,
    channelId: n.channel.youtubeChannelId,
  };
}

/** Existing concerts by any of the same main artists, as identities for duplicate checks. */
async function candidatesForDuplicate(db: PrismaClient, artistSlugs: string[]) {
  const rows = await db.concert.findMany({
    where: { credits: { some: { role: "MAIN", artist: { slug: { in: artistSlugs } } } } },
    include: { credits: { include: { artist: true } }, venue: true, channel: true },
  });
  return rows.map((r) => ({
    id: r.id,
    curated: r.curated,
    identity: {
      youtubeId: r.youtubeId,
      artistSlugs: r.credits.filter((c) => c.role === "MAIN").map((c) => c.artist.slug),
      venueName: r.venue?.name ?? null,
      publishedAt: r.publishedAt,
      durationSeconds: r.durationSeconds,
      isOfficial: r.channel.isOfficial,
      channelId: r.channel.youtubeChannelId ?? `db:${r.channelId}`,
    } satisfies ConcertIdentity,
  }));
}

export type SaveResult =
  | { status: "created"; concertId: number; slug: string }
  | { status: "duplicate"; ofYoutubeId: string }
  | { status: "replaced"; concertId: number; slug: string; replacedYoutubeId: string };

async function uniqueSlug(db: PrismaClient, base: string, youtubeId: string): Promise<string> {
  const taken = await db.concert.findUnique({ where: { slug: base }, select: { youtubeId: true } });
  if (!taken || taken.youtubeId === youtubeId) return base;
  return `${base}-${youtubeId.toLowerCase()}`;
}

/**
 * Save an accepted concert, unless the same concert is already listed.
 * A fan upload is replaced by the official upload of the same concert; hand-picked concerts are never replaced.
 */
export async function saveConcert(db: PrismaClient, n: NewConcert): Promise<SaveResult> {
  const identity = identityOfNew(n);
  const existing = await candidatesForDuplicate(db, identity.artistSlugs);
  const dup = existing.find((e) => isSameConcert(e.identity, identity));
  if (dup) {
    if (dup.curated || resolveDuplicate(dup.identity, identity) === "keep-existing") {
      return { status: "duplicate", ofYoutubeId: dup.identity.youtubeId };
    }
  }

  const c = n.classification;
  const v = n.video;
  const year = v.publishedAt.getUTCFullYear();
  const baseSlug = slugify([c.mainArtists[0], c.venue || v.title.slice(0, 40), year].join(" "));

  return db.$transaction(async (tx) => {
    if (dup) await tx.concert.delete({ where: { id: dup.id } });

    const channel = await tx.channel.upsert({
      where: { youtubeChannelId: n.channel.youtubeChannelId },
      create: { youtubeChannelId: n.channel.youtubeChannelId, name: await freeChannelName(tx as unknown as PrismaClient, n.channel), isOfficial: n.channel.isOfficial, kind: n.channel.isOfficial ? "MIXED" : "UNKNOWN" },
      update: {},
    });

    const venue = c.venue
      ? await tx.venue.upsert({
          where: { slug: slugify(c.venue) },
          create: { slug: slugify(c.venue), name: c.venue, city: c.city || null, country: c.country || null },
          update: {},
        })
      : null;

    const setting =
      c.setting !== "Unknown" && (SETTINGS as readonly string[]).includes(c.setting)
        ? await tx.setting.findUnique({ where: { slug: slugify(c.setting) } })
        : null;

    const credits: { artistId: number; role: "MAIN" | "WITH"; creditNote: string | null; position: number }[] = [];
    let position = 0;
    for (const name of c.mainArtists) {
      const artist = await tx.artist.upsert({ where: { slug: slugify(name) }, create: { slug: slugify(name), name }, update: {} });
      if (!credits.some((x) => x.artistId === artist.id)) credits.push({ artistId: artist.id, role: "MAIN", creditNote: null, position: position++ });
    }
    for (const collab of c.collaborators) {
      if (!collab.name.trim() || !slugify(collab.name)) continue;
      const artist = await tx.artist.upsert({ where: { slug: slugify(collab.name) }, create: { slug: slugify(collab.name), name: collab.name.trim() }, update: {} });
      if (!credits.some((x) => x.artistId === artist.id)) credits.push({ artistId: artist.id, role: "WITH", creditNote: collab.note.trim() || null, position: position++ });
    }

    // Genre rows are created on first use (the artist-only genres were added after the seed import).
    const genreRows = [];
    for (const name of c.genres.filter((g) => (SITE_GENRES as readonly string[]).includes(g))) {
      const genreSlug = slugify(name);
      genreRows.push(
        await tx.genre.upsert({
          where: { slug: genreSlug },
          create: { slug: genreSlug, name, sortOrder: (SITE_GENRES as readonly string[]).indexOf(name) },
          update: {},
        }),
      );
    }
    const now = new Date();
    const slug = await uniqueSlug(tx as unknown as PrismaClient, baseSlug, v.youtubeId);
    const concert = await tx.concert.create({
      data: {
        youtubeId: v.youtubeId,
        slug,
        title: v.title,
        durationSeconds: v.durationSeconds,
        viewCount: v.viewCount,
        publishedAt: new Date(Date.UTC(v.publishedAt.getUTCFullYear(), v.publishedAt.getUTCMonth(), v.publishedAt.getUTCDate())),
        city: c.city || null,
        country: c.country || null,
        liveAct: c.liveAct,
        writeUp: c.writeUp || null,
        thumbnailUrl: n.thumbnail ? thumbnailUrl(v.youtubeId, n.thumbnail) : null,
        source: "COLLECTOR",
        status: "PUBLISHED",
        curated: false,
        embeddable: v.embeddable,
        privacyStatus: v.privacyStatus,
        madeForKids: v.madeForKids,
        ytCheckedAt: now,
        ytRefreshedAt: now,
        channelId: channel.id,
        venueId: venue?.id ?? null,
        settingId: setting?.id ?? null,
        credits: { create: credits },
        genres: { create: genreRows.map((g) => ({ genreId: g.id })) },
      },
    });
    return dup
      ? { status: "replaced" as const, concertId: concert.id, slug, replacedYoutubeId: dup.identity.youtubeId }
      : { status: "created" as const, concertId: concert.id, slug };
  });
}

/** Channel names are unique in our table; two YouTube channels can share a display name. */
async function freeChannelName(db: PrismaClient, ch: { youtubeChannelId: string; name: string }): Promise<string> {
  const taken = await db.channel.findUnique({ where: { name: ch.name } });
  return taken ? `${ch.name} (${ch.youtubeChannelId})` : ch.name;
}

// ---------- Decisions (so the same video is not classified twice) ----------

/** Videos decided recently (skipped by the collector). Errors, and any verdicts in `lookAgain`, are not skipped. */
/**
 * How long our own verdicts are kept. They hold no YouTube data (only the ID and our conclusion),
 * so a clear "not a concert" is kept for a year and "not our genres" for six months: the classifier
 * is not paid again for the same video every month. Uncertain and duplicate verdicts follow the
 * normal retention (default 30 days), so they get a fresh look.
 */
export const LONG_VERDICT_DAYS = { NOT_A_SET: 365, NOT_ELECTRONIC: 180 } as const;

/** Postgres takes at most 32,767 parameters per query; long ID lists are sent in slices of this size. */
export const ID_CHUNK = 10_000;
export function chunks<T>(list: T[], size = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function keptSince(ttlDays: number, verdict: keyof typeof LONG_VERDICT_DAYS | null): Date {
  return new Date(Date.now() - (verdict ? LONG_VERDICT_DAYS[verdict] : ttlDays) * 86_400_000);
}

export async function recentDecisions(
  db: PrismaClient,
  youtubeIds: string[],
  ttlDays: number,
  lookAgain: ("UNCERTAIN" | "NOT_ELECTRONIC")[] = [],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const slice of chunks(youtubeIds)) {
    const rows = await db.videoDecision.findMany({
      where: {
        youtubeId: { in: slice },
        verdict: { notIn: ["ERROR", ...lookAgain] },
        OR: [
          { verdict: "NOT_A_SET", decidedAt: { gte: keptSince(ttlDays, "NOT_A_SET") } },
          { verdict: "NOT_ELECTRONIC", decidedAt: { gte: keptSince(ttlDays, "NOT_ELECTRONIC") } },
          { verdict: { notIn: ["NOT_A_SET", "NOT_ELECTRONIC"] }, decidedAt: { gte: keptSince(ttlDays, null) } },
        ],
      },
      select: { youtubeId: true },
    });
    rows.forEach((r) => found.add(r.youtubeId));
  }
  return found;
}

// ---- Long videos kept out by rules that can change (long_videos) ----

/** Remember long videos kept out only by things that can change; refreshes the check date of known ones. */
export async function rememberLongVideos(db: PrismaClient, videos: { youtubeId: string; channelId: string }[], now = new Date()) {
  // Bulk: a full re-read can remember thousands of videos at once.
  for (const slice of chunks(videos, 5_000)) {
    await db.longVideo.createMany({
      data: slice.map((v) => ({ youtubeId: v.youtubeId, youtubeChannelId: v.channelId, firstSeenAt: now, checkedAt: now })),
      skipDuplicates: true,
    });
    await db.longVideo.updateMany({ where: { youtubeId: { in: slice.map((v) => v.youtubeId) } }, data: { checkedAt: now } });
  }
}

/** Forget videos that now pass the rules (they move on to classification), can never pass, or are gone. */
export async function forgetLongVideos(db: PrismaClient, youtubeIds: string[]) {
  let count = 0;
  for (const slice of chunks(youtubeIds)) count += (await db.longVideo.deleteMany({ where: { youtubeId: { in: slice } } })).count;
  return count;
}

/**
 * Long videos to look at again: those not checked for `everyDays` days, or all of them (for example
 * right after the view threshold was lowered). Most watched first is not known (views are not
 * stored), so the oldest checks come first.
 */
export async function longVideosDue(db: PrismaClient, opts: { everyDays: number; all?: boolean; limit?: number }): Promise<string[]> {
  const rows = await db.longVideo.findMany({
    where: opts.all ? {} : { checkedAt: { lt: new Date(Date.now() - opts.everyDays * 86_400_000) } },
    orderBy: { checkedAt: "asc" },
    take: opts.limit,
    select: { youtubeId: true },
  });
  return rows.map((r) => r.youtubeId);
}

export async function recordDecision(
  db: PrismaClient,
  youtubeId: string,
  verdict: "ACCEPTED" | "NOT_A_SET" | "NOT_ELECTRONIC" | "UNCERTAIN" | "DUPLICATE" | "ERROR",
  reason: string,
) {
  await db.videoDecision.upsert({
    where: { youtubeId },
    create: { youtubeId, verdict, reason: reason.slice(0, 500) },
    update: { verdict, reason: reason.slice(0, 500), decidedAt: new Date() },
  });
}

/** Delete decisions and review items older than the retention period (YouTube 30-day rule). */
export async function expireOldData(db: PrismaClient, ttlDays: number) {
  const before = new Date(Date.now() - ttlDays * 86_400_000);
  const decisions = await db.videoDecision.deleteMany({
    where: {
      OR: [
        { verdict: "NOT_A_SET", decidedAt: { lt: keptSince(ttlDays, "NOT_A_SET") } },
        { verdict: "NOT_ELECTRONIC", decidedAt: { lt: keptSince(ttlDays, "NOT_ELECTRONIC") } },
        { verdict: { notIn: ["NOT_A_SET", "NOT_ELECTRONIC"] }, decidedAt: { lt: before } },
      ],
    },
  });
  const reviews = await db.reviewItem.deleteMany({ where: { createdAt: { lt: before } } });
  const cached = await db.classificationCache.deleteMany({ where: { createdAt: { lt: before } } });
  const lane = await db.laneAnswer.deleteMany({ where: { createdAt: { lt: before } } });
  return { decisions: decisions.count, reviewItems: reviews.count, classifications: cached.count, laneAnswers: lane.count };
}
