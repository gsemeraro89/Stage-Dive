"use server";

// Admin: news waiting for the owner (owner, 21 Nov 2026). Behind the password check in src/proxy.ts.
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";

async function setStatus(formData: FormData, status: "PUBLISHED" | "REJECTED") {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const a = await getDb().newsArticle.update({ where: { id }, data: { status, ...(status === "PUBLISHED" ? { publishedAt: new Date() } : {}) } });
  // The pages that show it are rebuilt now rather than within 10 minutes.
  revalidatePath("/admin/news");
  revalidatePath("/news");
  revalidatePath(`/news/${a.slug}`);
  for (const b of a.bandSlugs) revalidatePath(`/artists/${b}`);
  if (a.venueSlug) revalidatePath(`/venues/${a.venueSlug}`);
}

/** An article that waited for the owner goes live (dated now). */
export async function publishNews(formData: FormData) {
  await setStatus(formData, "PUBLISHED");
}

/** Not published (kept in the database, so the same news is not written again). */
export async function rejectNews(formData: FormData) {
  await setStatus(formData, "REJECTED");
}

/** Take a published article off the site (kept in the database). */
export async function hideNews(formData: FormData) {
  await setStatus(formData, "REJECTED");
}
