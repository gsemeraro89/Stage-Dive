// One news run as the scripts call it (scripts/news.ts, scripts/admin-ops.ts "news[:dry]"), recorded in
// job_runs like the other jobs so /admin shows it.
import type { PrismaClient } from "../../generated/prisma/client";
import { runPressNews, type PressRunOptions } from "./job";

export async function runNews(db: PrismaClient, opts: PressRunOptions = {}) {
  const started = new Date();
  try {
    const result = await runPressNews(db, opts);
    await recordRun(db, started, opts.dryRun ? "news-dry-run" : "news", true, result).catch(() => undefined);
    return result;
  } catch (e) {
    await recordRun(db, started, "news", false, { error: e instanceof Error ? e.message : String(e) }).catch(() => undefined);
    throw e;
  }
}

async function recordRun(db: PrismaClient, startedAt: Date, job: string, ok: boolean, stats: unknown) {
  await db.jobRun.create({ data: { job, startedAt, finishedAt: new Date(), ok, summary: JSON.parse(JSON.stringify(stats)) } });
}
