// Crawler visits, written to crawler_hits in batches (owner, 24 Nov 2026). src/proxy.ts calls
// countCrawlerHit() for each crawler request: the hit is counted in memory only, and the counts are
// written at most once every 5 minutes, one upsert for all (day, bot) rows, and only when there is
// something to write. Neon is billed by compute time, so no write per request. Never blocks or slows
// a response; database errors are swallowed (the counts of that batch are lost, nothing else).
// Counts not yet written are lost when the server restarts (at most 5 minutes' worth).
import { Prisma } from "../generated/prisma/client";
import { addHit, flushDue, msUntilFlush, newHitCounter, takeBatch, type HitCounter, type PendingHit } from "./crawlers";

// One counter per server process (kept on globalThis so dev reloads do not reset it).
const g = globalThis as unknown as { sdCrawlerHits?: { counter: HitCounter; timer: ReturnType<typeof setTimeout> | null; writing: boolean } };
const state = (g.sdCrawlerHits ??= { counter: newHitCounter(), timer: null, writing: false });

/** One statement for the whole batch: adds the hits, adds the page-type counts key by key, keeps the newest path. */
export function upsertSql(rows: PendingHit[]): Prisma.Sql {
  const values = rows.map(
    (r) => Prisma.sql`(${r.day}::date, ${r.bot}, ${r.hits}, ${JSON.stringify(r.kinds)}::jsonb, ${r.lastPath}, ${r.lastAt})`,
  );
  return Prisma.sql`
    INSERT INTO crawler_hits (day, bot, hits, kinds, last_path, last_at) VALUES ${Prisma.join(values)}
    ON CONFLICT (day, bot) DO UPDATE SET
      hits = crawler_hits.hits + EXCLUDED.hits,
      kinds = (
        SELECT COALESCE(jsonb_object_agg(k, n), '{}'::jsonb)
        FROM (
          SELECT k, SUM(v) AS n
          FROM (
            SELECT key AS k, value::int AS v FROM jsonb_each_text(crawler_hits.kinds)
            UNION ALL
            SELECT key AS k, value::int AS v FROM jsonb_each_text(EXCLUDED.kinds)
          ) AS both_kinds
          GROUP BY k
        ) AS summed
      ),
      last_path = CASE WHEN EXCLUDED.last_at >= crawler_hits.last_at THEN EXCLUDED.last_path ELSE crawler_hits.last_path END,
      last_at = GREATEST(crawler_hits.last_at, EXCLUDED.last_at)`;
}

/** Writes everything counted so far, in one statement. Errors are swallowed. */
export async function flushCrawlerHits(now = Date.now()): Promise<void> {
  if (state.writing || state.counter.pending.size === 0) return;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  const rows = takeBatch(state.counter, now);
  state.writing = true;
  try {
    // Loaded only when there is something to write, so the proxy stays light.
    const { getDb } = await import("./db");
    await getDb().$executeRaw(upsertSql(rows));
  } catch (error) {
    console.warn(`crawler_hits: ${rows.length} rows not written:`, error instanceof Error ? error.message : error);
  } finally {
    state.writing = false;
  }
}

/** Waits until the next write is allowed, then writes. One timer at a time; it never keeps the process alive. */
function scheduleFlush(now: number) {
  if (state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    void flushCrawlerHits().catch(() => {});
  }, msUntilFlush(state.counter, now) + 1000);
  state.timer.unref?.();
}

/**
 * Counts one crawler hit in memory. Returns the write when one is due (the proxy hands it to
 * waitUntil, after the response); otherwise null, and a timer writes when the interval has passed.
 */
export function countCrawlerHit(bot: string, pathname: string, now = new Date()): Promise<void> | null {
  try {
    addHit(state.counter, bot, pathname, now);
    const t = now.getTime();
    if (flushDue(state.counter, t) && !state.writing) return flushCrawlerHits(t).catch(() => {});
    scheduleFlush(t);
  } catch {
    // counting must never break a page
  }
  return null;
}
