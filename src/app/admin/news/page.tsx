// Admin: news (owner, 21 Nov 2026). Articles that pass the fact check go live on their own; the ones the
// check was unsure about (or on a sensitive subject, or with a banned word) wait here for the owner.
// Published articles can be taken off the site from here too. Plain admin page, like /admin.
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { newsBudgetFromEnv } from "@/lib/news/job";
import { hideNews, publishNews, rejectNews } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · News", robots: { index: false, follow: false } };

const when = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export default async function AdminNewsPage() {
  const db = getDb();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [review, published, spent] = await Promise.all([
    db.newsArticle.findMany({ where: { status: "REVIEW" }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.newsArticle.findMany({ where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 50 }),
    db.newsSeen.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
  ]);
  return (
    <main data-od="admin-news">
      <p>
        <Link href="/admin">Admin</Link>
      </p>
      <h1>News</h1>
      <p>
        Claude cost this month: ${(spent._sum.costUsd ?? 0).toFixed(2)} of ${newsBudgetFromEnv(process.env.NEWS_BUDGET_USD).toFixed(2)} (NEWS_BUDGET_USD on
        GitHub). Articles that pass the fact check go live on their own; the ones below wait for you.
      </p>

      <h2>Waiting for you ({review.length})</h2>
      {review.length === 0 && <p>Nothing to check.</p>}
      {review.map((a) => (
        <article key={a.id} data-od="admin-news-item">
          <h3>{a.title}</h3>
          <p>
            <b>{a.lead}</b>
          </p>
          {a.body.split(/\n\s*\n/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p>
            About: {[...a.bandSlugs, a.venueName].filter(Boolean).join(", ") || "?"} · {a.topic} · Source:{" "}
            {a.sourceUrl ? (
              <a href={a.sourceUrl} target="_blank" rel="noopener">
                {a.sourceName ?? a.sourceUrl}
              </a>
            ) : (
              "none"
            )}
          </p>
          {a.checkNote && <p>Why it waits: {a.checkNote}</p>}
          <form action={publishNews} style={{ display: "inline" }}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit">Publish</button>
          </form>{" "}
          <form action={rejectNews} style={{ display: "inline" }}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit">Reject</button>
          </form>
        </article>
      ))}

      <h2>Published ({published.length} newest)</h2>
      <ul>
        {published.map((a) => (
          <li key={a.id}>
            {when(a.publishedAt)} · <Link href={`/news/${a.slug}`}>{a.title}</Link> · {a.topic}
            {a.sourceName ? ` · ${a.sourceName}` : ""}{" "}
            <form action={hideNews} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={a.id} />
              <button type="submit">Take off the site</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
