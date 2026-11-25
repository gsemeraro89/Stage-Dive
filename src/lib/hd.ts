// Full concerts in HD (owner, 21 Nov 2026, keyword research: "full concert hd"; "just HD", no 4K or
// pro-shot pages). One page, /hd: official concerts whose video YouTube reports in high definition
// (contentDetails.definition = "hd", i.e. 720p or better), ranked by views like the "best of" rankings
// (bootlegs are kept out, as there). The definition is stored on the concert (concerts.definition): the
// collector writes it for new concerts, the nightly refresh re-reads it with the rest of the YouTube
// data and fills it in for concerts that never had it (backfillDefinitions). Indexed from ten concerts
// (the same rule as a ranking), listed in the sitemap and the llms files by the same rule.
// Pure functions, plus the backfill (tested with fakes in tests/hd.test.ts).
import type { PrismaClient } from "../generated/prisma/client";
import { rankedName } from "./best";
import { bestListIsStrong } from "./seo";
import { SITE_NAME } from "./site";
import { listWords, plural } from "./text";

export const HD_PATH = "/hd";
/** Concerts listed on the page at most (the most watched). */
export const HD_SIZE = 100;
export const HD_HEADING = "Full Concerts in HD";
export const HD_TITLE = `${HD_HEADING} · Pro-Shot Rock Concerts in 1080p and 720p`;
/** The database filter on top of the visible, official concerts. */
export const HD_WHERE = { definition: "hd" } as const;

/** Worth indexing (and listing in the sitemap and llms files) from ten HD concerts, like a ranking. */
export const hdIsStrong = (count: number) => bestListIsStrong(count);

interface HdConcert {
  credits: string;
  artists?: { name: string; role: "MAIN" | "WITH" }[];
  venue: { name: string } | null;
  city: string | null;
  performedYear: number | null;
  viewCount: number;
}

const views = (n: number) => `${n.toLocaleString("en-GB")} views on YouTube`;

/** The answer-first lead. `total` is every official HD concert; `ranked` the ones shown, most watched first. */
export function hdLead(total: number, ranked: HdConcert[]): string {
  if (!total || !ranked.length) return `No full rock concert in HD is on ${SITE_NAME} right now.`;
  const top = ranked[0];
  return (
    `${total.toLocaleString("en-GB")} full rock concert${total === 1 ? "" : "s"} in HD on ${SITE_NAME}: official, pro-shot concerts in high definition (720p, 1080p or better), ` +
    `ranked by views on YouTube, from ${rankedName(top)} (${views(top.viewCount)})` +
    `${ranked.length > 1 ? ` to ${rankedName(ranked[ranked.length - 1])} (${views(ranked[ranked.length - 1].viewCount)})` : ""}.` +
    `${total > ranked.length ? ` The ${ranked.length} most watched are listed here.` : ""} Every concert plays in full on its own page, updated every night.`
  );
}

/** Questions for the Markdown copy, from the list only. */
export function hdQuestions(total: number, ranked: HdConcert[]): { question: string; answer: string }[] {
  if (!ranked.length) return [];
  const out = [
    { question: `Where can I watch full rock concerts in HD?`, answer: `On ${SITE_NAME}: ${plural(total, "official full concert")} in high definition, each played in full on its own page.` },
    { question: `What is the most watched full concert in HD here?`, answer: `${rankedName(ranked[0])}, with ${views(ranked[0].viewCount)}.` },
  ];
  const bands = new Map<string, number>();
  for (const c of ranked) for (const a of c.artists ?? []) if (a.role === "MAIN") bands.set(a.name, (bands.get(a.name) ?? 0) + 1);
  const top = [...bands.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
  if (top.length) {
    out.push({
      question: `Which bands have the most full concerts in HD here?`,
      answer: `${listWords(top.map(([name, n]) => `${name} (${n})`))}${ranked.length < total ? `, among the ${ranked.length} most watched` : ""}.`,
    });
  }
  return out;
}

/**
 * Reads YouTube's definition for concerts that have none yet (not REMOVED, not in `skip`, e.g. the
 * concerts the refresh has just updated) and stores it. Returns how many were filled in.
 */
export async function backfillDefinitions(
  db: PrismaClient,
  videos: (ids: string[]) => Promise<Map<string, { definition?: string }>>,
  skip: Set<number> = new Set(),
): Promise<number> {
  const rows = (await db.concert.findMany({ where: { definition: null, status: { not: "REMOVED" } }, select: { id: true, youtubeId: true } })).filter(
    (r) => !skip.has(r.id),
  );
  if (!rows.length) return 0;
  const facts = await videos(rows.map((r) => r.youtubeId));
  let filled = 0;
  for (const r of rows) {
    const definition = facts.get(r.youtubeId)?.definition;
    if (!definition) continue;
    await db.concert.update({ where: { id: r.id }, data: { definition } });
    filled++;
  }
  return filled;
}
