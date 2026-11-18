// Stored classifications and Batch API bookkeeping.
// A dry run's work is kept here, so the real run that follows does not pay for the same videos again.
import type { PrismaClient } from "../../generated/prisma/client";
import { ClassificationSchema, type FullClassification } from "./classify";

/** Classifications still valid: same rules (prompt version) and younger than the retention period. */
export async function cachedClassifications(
  db: PrismaClient,
  youtubeIds: string[],
  promptVersion: string,
  ttlDays: number,
): Promise<Map<string, FullClassification>> {
  const result = new Map<string, FullClassification>();
  if (youtubeIds.length === 0) return result;
  const since = new Date(Date.now() - ttlDays * 86_400_000);
  const rows = await db.classificationCache.findMany({
    where: { youtubeId: { in: youtubeIds }, promptVersion, createdAt: { gte: since } },
  });
  for (const row of rows) {
    const parsed = ClassificationSchema.safeParse(row.result);
    if (parsed.success) result.set(row.youtubeId, parsed.data);
  }
  return result;
}

export async function storeClassification(
  db: PrismaClient,
  youtubeId: string,
  promptVersion: string,
  classification: FullClassification,
) {
  const data = { promptVersion, result: classification as unknown as object, createdAt: new Date() };
  await db.classificationCache.upsert({ where: { youtubeId }, create: { youtubeId, ...data }, update: data });
}

/** Videos already waiting in an unfinished batch (so they are not sent twice). */
export async function videosInPendingBatches(db: PrismaClient, promptVersion: string): Promise<Set<string>> {
  const rows = await db.classifierBatch.findMany({ where: { status: "PENDING", promptVersion, lane: "collect" }, select: { youtubeIds: true } });
  return new Set(rows.flatMap((r) => r.youtubeIds));
}

/**
 * Which candidates need the classifier: those without a valid stored answer and not already waiting
 * in a batch. Pure, so the rule can be tested.
 */
export function needsClassification(candidateIds: string[], cached: Set<string>, pending: Set<string>): string[] {
  return candidateIds.filter((id) => !cached.has(id) && !pending.has(id));
}
