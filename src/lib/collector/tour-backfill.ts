// Tours for the concerts already listed (owner, 21 Nov 2026; admin_ops "backfill-tours[:limit]"). Each published
// concert whose tour was never settled is read again from YouTube (videos.list: 1 unit per 50 videos; the
// description is not stored), the regex of tours.ts decides, and Claude Haiku is asked (half-price Batch API) only
// when the regex is unsure. Answers are stored in lane_answers and each concert is marked (tour_checked_at), so
// nothing is paid twice. A tour page becomes strong (indexed, in the sitemap, sent to IndexNow) from two concerts.
import type { PrismaClient } from "../../generated/prisma/client";
import { type HaikuLane, storedLaneAnswers, storeLaneAnswer, promptVersionOf, videosInLaneBatches, type TourAnswer } from "./haiku";
import { decideTour, findOrCreateTour } from "./tours";
import { QuotaBudgetExceeded, type YouTubeClient, type YouTubeVideo } from "./youtube";

export interface TourBackfillOptions {
  /** Most concerts looked at in this run (oldest first); default all. */
  limit?: number;
  /** Minutes to wait for the Haiku batch; what is not back is collected by the next run. */
  waitMinutes?: number;
  /** Ask straight away at full price instead of the half-price batch. */
  noBatch?: boolean;
  /** Answers older than this are not reused (YouTube 30-day rule). */
  ttlDays?: number;
}

/** "backfill-tours", "backfill-tours:500", "backfill-tours:limit=500,wait=30,no-batch" -> options. */
export function tourBackfillArgs(op: string): TourBackfillOptions {
  const rest = op.replace(/^backfill-tours:?/, "").trim();
  const out: TourBackfillOptions = {};
  if (!rest) return out;
  if (/^\d+$/.test(rest)) return { limit: Number(rest) };
  for (const part of rest.split(",").map((x) => x.trim()).filter(Boolean)) {
    const [k, v] = part.split("=").map((x) => x.trim());
    if (k === "limit" && Number(v) > 0) out.limit = Number(v);
    else if (k === "wait" && Number(v) >= 0) out.waitMinutes = Number(v);
    else if (k === "no-batch") out.noBatch = true;
    else throw new Error(`backfill-tours: unknown option ${part}`);
  }
  return out;
}

interface Row {
  id: number;
  youtubeId: string;
  slug: string;
  title: string;
  performedYear: number | null;
  performedOn: Date | null;
  credits: { artist: { id: number; name: string } }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function backfillTours(db: PrismaClient, yt: YouTubeClient, haiku: HaikuLane | null, opts: TourBackfillOptions = {}) {
  const ttlDays = opts.ttlDays ?? 30;
  const rows = (await db.concert.findMany({
    where: { status: "PUBLISHED", tourId: null, tourCheckedAt: null },
    orderBy: { id: "asc" },
    take: opts.limit,
    select: {
      id: true,
      youtubeId: true,
      slug: true,
      title: true,
      performedYear: true,
      performedOn: true,
      credits: { where: { role: "MAIN" }, orderBy: { position: "asc" }, select: { artist: { select: { id: true, name: true } } } },
    },
  })) as Row[];
  const out = {
    concertsLooked: rows.length,
    videosRead: 0,
    goneFromYouTube: 0,
    byRegex: 0,
    noTour: 0,
    askedHaiku: 0,
    byHaiku: 0,
    haikuSaidNone: 0,
    waitingForHaiku: 0,
    linked: [] as { concert: string; tour: string }[],
    toursCreated: [] as string[],
    youtubeUnits: 0,
    claudeCostUsd: 0,
    stoppedEarly: "",
  };

  // 1. Title, description and tags again (1 unit per 50 videos).
  const videos = new Map<string, YouTubeVideo>();
  for (let i = 0; i < rows.length; i += 50) {
    try {
      for (const [id, v] of await yt.videos(rows.slice(i, i + 50).map((r) => r.youtubeId))) videos.set(id, v);
    } catch (error) {
      if (error instanceof QuotaBudgetExceeded) {
        out.stoppedEarly = `${error.message}; the rest is read next run`;
        break;
      }
      throw error;
    }
  }
  out.videosRead = videos.size;

  const performedOf = (r: Row) => (r.performedOn ? r.performedOn.toISOString().slice(0, 10) : r.performedYear ? String(r.performedYear) : null);
  const settle = async (r: Row, name: string | null) => {
    const band = r.credits[0]?.artist ?? null;
    let tourId: number | null = null;
    if (name && band) {
      const before = await db.tour.count();
      const tour = await findOrCreateTour(db, r.credits.length === 1 ? band : null, name);
      if ((await db.tour.count()) > before) out.toursCreated.push(tour.slug);
      tourId = tour.id;
      out.linked.push({ concert: r.slug, tour: tour.name });
    }
    await db.concert.update({ where: { id: r.id }, data: { tourId, tourCheckedAt: new Date() } });
  };

  // 2. The regex; unsure concerts wait for Haiku.
  const unsure: { row: Row; video: YouTubeVideo }[] = [];
  for (const r of rows) {
    const v = videos.get(r.youtubeId);
    if (!v) {
      // Gone, private or not read: the refresh job handles it; looked at again next time.
      if (!out.stoppedEarly) out.goneFromYouTube++;
      continue;
    }
    const band = r.credits[0]?.artist.name ?? "";
    const d = decideTour({ title: v.title, description: v.description, band, performedYear: r.performedYear });
    if (!d.settled) {
      unsure.push({ row: r, video: v });
      continue;
    }
    if (d.name) out.byRegex++;
    else out.noTour++;
    await settle(r, d.name);
  }

  // 3. Haiku for the unsure ones: stored answers first, then one batch (or straight away with no-batch).
  if (unsure.length && haiku) {
    const ids = unsure.map((u) => u.video.youtubeId);
    await haiku.collectPending(db);
    let answers = await storedLaneAnswers(db, ids, "tour", ttlDays);
    const waiting = await videosInLaneBatches(db, "tour");
    const ask = unsure.filter((u) => !answers.has(u.video.youtubeId) && !waiting.has(u.video.youtubeId));
    const extra = (u: (typeof unsure)[number]) => ({ band: u.row.credits[0]?.artist.name ?? "", performed: performedOf(u.row) });
    out.askedHaiku = ask.length;
    if (ask.length && opts.noBatch) {
      for (const u of ask) {
        const r = await haiku.direct("tour", u.video, extra(u));
        out.claudeCostUsd += r.costUsd;
        if (r.answer) await storeLaneAnswer(db, u.video.youtubeId, "tour", promptVersionOf("tour"), r.answer);
      }
    } else if (ask.length) {
      const batchId = await haiku.submit(db, "tour", ask.map((u) => ({ video: u.video, ...extra(u) })));
      const deadline = Date.now() + (opts.waitMinutes ?? 30) * 60_000;
      while (Date.now() < deadline) {
        await sleep(30_000);
        const back = await haiku.collect(db, batchId);
        if (back) {
          out.claudeCostUsd += back.costUsd;
          break;
        }
      }
    }
    answers = await storedLaneAnswers(db, ids, "tour", ttlDays);
    for (const u of unsure) {
      const a = answers.get(u.video.youtubeId) as TourAnswer | undefined;
      if (!a) {
        out.waitingForHaiku++;
        continue;
      }
      const d = decideTour(
        { title: u.video.title, description: u.video.description, band: u.row.credits[0]?.artist.name ?? "", performedYear: u.row.performedYear },
        { tour: a.tour, evidence: a.evidence, ownTour: a.ownTour, confidence: a.confidence },
      );
      if (d.name) out.byHaiku++;
      else out.haikuSaidNone++;
      await settle(u.row, d.name);
    }
  } else out.waitingForHaiku = unsure.length;

  out.youtubeUnits = yt.unitsUsed;
  out.claudeCostUsd = Math.round(out.claudeCostUsd * 10000) / 10000;
  return out;
}

