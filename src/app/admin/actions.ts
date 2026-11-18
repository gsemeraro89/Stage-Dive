"use server";

// Admin actions. The page and these actions sit behind the password check in src/proxy.ts.
import { revalidatePath } from "next/cache";
import type { FullClassification } from "@/lib/collector/classify";
import { recordDecision, saveSet } from "@/lib/collector/store";
import { getDb } from "@/lib/db";

interface ReviewPayload {
  title: string;
  channel: string;
  channelId?: string;
  channelKind: string;
  views: number;
  durationSeconds: number;
  publishedAt: string;
  classification: FullClassification;
}

export async function publishReviewItem(formData: FormData) {
  const id = Number(formData.get("id"));
  const db = getDb();
  const item = await db.reviewItem.findUnique({ where: { id } });
  if (!item || item.status !== "PENDING") return;
  const p = item.payload as unknown as ReviewPayload;
  if (!p.channelId || p.classification.mainArtists.length === 0 || p.classification.genres.length === 0) return;
  const result = await saveSet(db, {
    video: {
      youtubeId: item.youtubeId,
      title: p.title,
      description: "",
      tags: [],
      channelId: p.channelId,
      channelTitle: p.channel,
      publishedAt: new Date(p.publishedAt),
      durationSeconds: p.durationSeconds,
      viewCount: p.views,
      // It passed YouTube's checks when it was collected; the refresh job re-checks it.
      embeddable: true,
      privacyStatus: "public",
      madeForKids: false,
      liveBroadcastContent: "none",
      uploadStatus: "processed",
    },
    classification: p.classification,
    channel: { youtubeChannelId: p.channelId, name: p.channel, isOfficial: p.channelKind !== "UNKNOWN" || p.classification.uploaderIsOfficial === true },
    thumbnail: null,
  });
  if (result.status !== "duplicate") {
    // Count the 30-day refresh from when the data was fetched, not from now.
    await db.set.update({ where: { id: result.setId }, data: { ytRefreshedAt: item.createdAt, ytCheckedAt: item.createdAt } });
  }
  await db.reviewItem.update({ where: { id }, data: { status: "APPROVED", decidedAt: new Date() } });
  await recordDecision(db, item.youtubeId, result.status === "duplicate" ? "DUPLICATE" : "ACCEPTED", "approved in admin");
  revalidatePath("/admin");
}

export async function rejectReviewItem(formData: FormData) {
  const id = Number(formData.get("id"));
  const db = getDb();
  const item = await db.reviewItem.update({ where: { id }, data: { status: "REJECTED", decidedAt: new Date() } });
  await recordDecision(db, item.youtubeId, "NOT_ELECTRONIC", "rejected in admin");
  revalidatePath("/admin");
}

export async function setSetStatus(formData: FormData) {
  const id = Number(formData.get("id"));
  const status = formData.get("status") === "PUBLISHED" ? "PUBLISHED" : "HIDDEN";
  await getDb().set.update({ where: { id }, data: { status } });
  revalidatePath("/admin");
  revalidatePath("/");
}
