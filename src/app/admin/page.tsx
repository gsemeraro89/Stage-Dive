// Admin: what the collector did, videos it was unsure about, and recently added concerts.
// Optional for the owner: nothing waits here for approval to keep the site running.
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { formatDate, formatDuration } from "@/lib/format";
import { compactNumber } from "@/lib/site";
import { publishReviewItem, rejectReviewItem, setConcertStatus } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const db = getDb();
  const [runs, pending, recent, counts, setlists, neverChecked] = await Promise.all([
    db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    db.reviewItem.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.concert.findMany({
      where: { source: { not: "SEED" } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { credits: { include: { artist: true } }, genres: { include: { genre: true } }, channel: true },
    }),
    db.concert.groupBy({ by: ["status", "source"], _count: true }),
    // Published concerts by where their setlist came from (null = none found).
    db.concert.groupBy({ by: ["setlistSource"], where: { status: "PUBLISHED" }, _count: true }),
    db.concert.count({ where: { status: "PUBLISHED", setlistCheckedAt: null } }),
  ]);
  const published = setlists.reduce((n, t) => n + t._count, 0);
  const withSetlist = setlists.filter((t) => t.setlistSource).reduce((n, t) => n + t._count, 0);
  const SOURCE_LABEL: Record<string, string> = {
    DESCRIPTION: "video description",
    CHANNEL_COMMENT: "uploader's comment",
    COMMENT: "viewer comment",
    CLAUDE: "read by Claude",
  };

  return (
    <main data-od="admin">
      <h1>Admin</h1>

      <section aria-labelledby="catalogue">
        <h2 id="catalogue">Catalogue</h2>
        <ul>
          {counts.map((c) => (
            <li key={`${c.status}-${c.source}`}>
              {c.source} · {c.status}: {c._count}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="setlists" data-od="admin-setlists">
        <h2 id="setlists">Setlists</h2>
        <p>
          {withSetlist} of {published} published concerts have a setlist
          {published ? ` (${Math.round((withSetlist / published) * 100)}%)` : ""}.
        </p>
        <ul>
          {setlists
            .filter((t) => t.setlistSource)
            .sort((a, b) => b._count - a._count)
            .map((t) => (
              <li key={t.setlistSource}>
                From {SOURCE_LABEL[t.setlistSource!] ?? t.setlistSource}: {t._count}
              </li>
            ))}
          <li>None found: {published - withSetlist - neverChecked}</li>
          <li>Not checked yet (the next refresh looks): {neverChecked}</li>
        </ul>
      </section>

      <section aria-labelledby="runs">
        <h2 id="runs">Last runs</h2>
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Started</th>
              <th>Result</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const s = (r.summary ?? {}) as Record<string, unknown>;
              return (
                <tr key={r.id}>
                  <td>{r.job}</td>
                  <td>{r.startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</td>
                  <td>{r.ok === null ? "running" : r.ok ? "ok" : "failed"}</td>
                  <td>
                    {r.job === "collect"
                      ? `classified ${s.classified ?? 0}, new ${(s.created as string[] | undefined)?.length ?? 0}, YouTube units ${s.youtubeUnits ?? 0}, Claude ~$${s.claudeCostUsd ?? 0}`
                      : `checked ${s.checked ?? 0}, updated ${s.updated ?? 0}, deleted ${(s.deleted as string[] | undefined)?.length ?? 0}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="unsure">
        <h2 id="unsure">Kept out because unsure ({pending.length})</h2>
        <p>These videos stayed off the site. Publish one only if you are sure it belongs.</p>
        {pending.length === 0 && <p>Nothing here.</p>}
        <ul>
          {pending.map((item) => {
            const p = item.payload as {
              title: string;
              channel: string;
              channelId?: string;
              views: number;
              durationSeconds: number;
              classification: { mainArtists: string[]; genres: string[] };
              signals: string[];
            };
            const canPublish = Boolean(p.channelId) && p.classification.mainArtists.length > 0 && p.classification.genres.length > 0;
            return (
              <li key={item.id}>
                <a href={`https://www.youtube.com/watch?v=${item.youtubeId}`} rel="noopener" target="_blank">
                  {p.title}
                </a>{" "}
                · {p.channel} · {compactNumber(p.views)} views · {formatDuration(p.durationSeconds)}
                <br />
                Artists: {p.classification.mainArtists.join(", ") || "?"} · Genres: {p.classification.genres.join(", ") || "none"} · Confidence:{" "}
                {item.confidence ?? "?"} · Signals: {p.signals.join(", ") || "none"}
                <br />
                Why: {item.reason}
                <form action={publishReviewItem}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" disabled={!canPublish}>
                    Publish
                  </button>
                </form>
                <form action={rejectReviewItem}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit">Reject</button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="recent">
        <h2 id="recent">Recently added by the collector</h2>
        {recent.length === 0 && <p>Nothing yet.</p>}
        <ul>
          {recent.map((s) => (
            <li key={s.id}>
              <Link href={`/concerts/${s.slug}`}>{s.title}</Link> · {s.credits.map((c) => c.artist.name).join(", ")} ·{" "}
              {s.genres.map((g) => g.genre.name).join(", ")} · {s.channel.name}
              {s.channel.isOfficial ? "" : " (fan upload)"} · added {formatDate(s.createdAt)} · {s.status}
              <form action={setConcertStatus}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="status" value={s.status === "PUBLISHED" ? "HIDDEN" : "PUBLISHED"} />
                <button type="submit">{s.status === "PUBLISHED" ? "Hide" : "Show again"}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
