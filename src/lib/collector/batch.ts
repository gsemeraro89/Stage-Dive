// Anthropic Batch API: half price, answers usually within an hour (at most 24 hours).
// The collector sends one batch per run, waits a while, and picks up unfinished batches on the next run.
import type { PrismaClient } from "../../generated/prisma/client";
import { storeClassification } from "./cache";
import { batchRequestParams, parseAnswer, PROMPT_VERSION, type Classifier } from "./classify";
import type { YouTubeVideo } from "./youtube";

export interface BatchOutcome {
  stored: number;
  /** Videos the model declined in the batch; the caller may retry them one by one with fallback. */
  refused: string[];
  failed: number;
}

/** Send a batch and record it. Returns the Anthropic batch ID. */
export async function submitBatch(
  db: PrismaClient,
  classifier: Classifier,
  videos: { video: YouTubeVideo; channelKind: string }[],
): Promise<string> {
  const batch = await classifier.anthropic.messages.batches.create({
    requests: videos.map(({ video, channelKind }) => ({
      custom_id: video.youtubeId,
      params: batchRequestParams(video, channelKind),
    })),
  });
  await db.classifierBatch.create({
    data: { batchId: batch.id, promptVersion: PROMPT_VERSION, youtubeIds: videos.map((v) => v.video.youtubeId), lane: "collect" },
  });
  return batch.id;
}

/** If the batch has finished, store its answers and mark it done. Returns null while it is still running. */
export async function collectBatch(db: PrismaClient, classifier: Classifier, batchId: string): Promise<BatchOutcome | null> {
  const batch = await classifier.anthropic.messages.batches.retrieve(batchId);
  if (batch.processing_status !== "ended") return null;
  const record = await db.classifierBatch.findUniqueOrThrow({ where: { batchId } });
  const outcome: BatchOutcome = { stored: 0, refused: [], failed: 0 };
  for await (const item of await classifier.anthropic.messages.batches.results(batchId)) {
    if (item.result.type !== "succeeded") {
      outcome.failed++;
      continue;
    }
    const message = item.result.message;
    classifier.batchInputTokens += message.usage.input_tokens;
    classifier.batchOutputTokens += message.usage.output_tokens;
    if (message.stop_reason === "refusal") {
      outcome.refused.push(item.custom_id);
      continue;
    }
    try {
      await storeClassification(db, item.custom_id, record.promptVersion, parseAnswer(message.content));
      outcome.stored++;
    } catch {
      outcome.failed++;
    }
  }
  await db.classifierBatch.update({ where: { batchId }, data: { status: "DONE", endedAt: new Date() } });
  return outcome;
}

/** Collect every finished batch from earlier runs. Batches older than 2 days are given up on. */
export async function collectPendingBatches(db: PrismaClient, classifier: Classifier) {
  // Only Opus batches: the per-artist lane collects its own (Haiku answers have another format).
  const pending = await db.classifierBatch.findMany({ where: { status: "PENDING", lane: "collect" } });
  const totals = { batches: 0, stored: 0, refused: [] as string[], failed: 0 };
  for (const row of pending) {
    const outcome = await collectBatch(db, classifier, row.batchId);
    if (outcome) {
      totals.batches++;
      totals.stored += outcome.stored;
      totals.refused.push(...outcome.refused);
      totals.failed += outcome.failed;
    } else if (Date.now() - row.createdAt.getTime() > 2 * 86_400_000) {
      await db.classifierBatch.update({ where: { id: row.id }, data: { status: "FAILED", endedAt: new Date() } });
    }
  }
  return totals;
}
