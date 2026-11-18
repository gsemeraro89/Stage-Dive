// Which concert thumbnail is an artist's picture (owner decision 13 Nov 2026): concert thumbnails come first;
// among an artist's concerts, Claude Haiku picks the one that shows a person with the least baked-in
// text. When every thumbnail is only graphics and text, the channel avatar is used instead (if any).
// Asked once per artist, again only when the artist's concerts change. The owner's own pick is never changed.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";

export const COVER_MODEL = "claude-haiku-5-5";
/** Thumbnails shown to the model per artist (most viewed concerts). */
export const MAX_CANDIDATES = 6;

export const CoverChoiceSchema = z.object({
  /** Number of the best picture (1-based), or 0 when none shows a person. */
  best: z.number().int().min(0).max(MAX_CANDIDATES),
});

const SYSTEM = `You choose the picture that represents a band on a rock concert site. You are shown numbered thumbnails of the band's concerts. The site shows the picture as a square cut from the upper centre of the image, in black and white.
Pick the thumbnail that works best as the portrait of the named artist: the band or its singer (if you can tell who they are; otherwise the people on stage) clearly visible near the upper centre and as little printed text, logos and graphics as possible. A photo with a small logo in a corner is fine.
Answer 0 only when no thumbnail shows a person at all (pure title cards, logos, graphics, landscapes with big titles).`;

export type Choose = (thumbnailUrls: string[], artistName: string) => Promise<number>;

export class CoverChooser {
  private readonly client: Anthropic;
  inputTokens = 0;
  outputTokens = 0;
  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    this.client = new Anthropic({ apiKey });
  }

  /** Returns the 1-based number of the best thumbnail, or 0 when none shows a person. */
  choose: Choose = async (urls, artistName) => {
    const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: `Artist: ${artistName}` }];
    urls.forEach((url, i) => {
      content.push({ type: "text", text: `Thumbnail ${i + 1}:` });
      content.push({ type: "image", source: { type: "url", url } });
    });
    content.push({ type: "text", text: "Which number is the best portrait? 0 if none shows a person." });
    const response = await this.client.messages.parse({
      model: COVER_MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(CoverChoiceSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    this.inputTokens += response.usage.input_tokens;
    this.outputTokens += response.usage.output_tokens;
    if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("no answer");
    return Math.min(response.parsed_output.best, urls.length);
  };

  /** Haiku 5.5 at $0.10 / $0.50 per million tokens. */
  estimatedCostUsd(): number {
    return (this.inputTokens * 0.1 + this.outputTokens * 0.5) / 1_000_000;
  }
}

/** A size every YouTube video has (320x180, no black bars): enough to judge, cheap to read. */
export const judgeUrl = (youtubeId: string) => `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;

export interface CoverStats {
  chosen: string[];
  avatar: string[];
  /** Only graphics, and no channel avatar to fall back on: the newest thumbnail stays. */
  noPerson: string[];
  skipped: number;
  errors: string[];
}

/**
 * Choose every artist's cover. A thumbnail must show the artist, not someone else:
 * - only the artist's own concerts count when they have any (a shared bill's thumbnail may show the other band);
 * - an artist with only shared concerts (e.g. Marco Carola, whose one concert is a b2b with Richie Hawtin)
 *   never takes a thumbnail another artist already uses; their channel photo is used instead, and a
 *   shared thumbnail only when there is nothing else.
 */
export async function chooseCovers(db: PrismaClient, choose: Choose, limit = 100): Promise<CoverStats> {
  const stats: CoverStats = { chosen: [], avatar: [], noPerson: [], skipped: 0, errors: [] };
  const VISIBLE_SET = { status: "PUBLISHED" as const, embeddable: true, privacyStatus: "public" };
  const artists = await db.artist.findMany({
    where: { credits: { some: { role: "MAIN", concert: VISIBLE_SET } } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      coverChosenFrom: true,
      coverYoutubeId: true,
      coverUseAvatar: true,
      coverLocked: true,
      credits: {
        where: { role: "MAIN", concert: VISIBLE_SET },
        orderBy: { concert: { viewCount: "desc" } },
        select: { concert: { select: { youtubeId: true, credits: { where: { role: "MAIN" }, select: { artistId: true } } } } },
      },
    },
  });
  const plan = artists.map((a) => {
    const concerts = a.credits.map((c) => c.concert);
    const solo = concerts.filter((s) => s.credits.every((c) => c.artistId === a.id)).map((s) => s.youtubeId);
    const shared = concerts.filter((s) => !solo.includes(s.youtubeId)).map((s) => s.youtubeId);
    return { a, solo, shared };
  });
  // Thumbnails in use as some artist's cover; artists with their own concerts choose first.
  const taken = new Map<string, number>();
  const use = (id: string | null, artistId: number) => id && taken.set(id, artistId);
  for (const p of plan) if (p.a.coverLocked) use(p.a.coverYoutubeId, p.a.id);
  plan.sort((x, y) => Number(x.solo.length === 0) - Number(y.solo.length === 0) || x.a.id - y.a.id);

  let asked = 0;
  for (const { a, solo, shared } of plan) {
    if (a.coverLocked) continue;
    const usedByOthers = (id: string) => (taken.get(id) ?? a.id) !== a.id;
    const candidates = (solo.length ? solo : shared.filter((id) => !usedByOthers(id))).slice(0, MAX_CANDIDATES);
    const key = `v3|${candidates.join(",")}${a.imageUrl ? "+avatar" : ""}`;
    const save = async (cover: string | null, useAvatar: boolean) => {
      await db.artist.update({ where: { id: a.id }, data: { coverYoutubeId: cover, coverUseAvatar: useAvatar, coverChosenFrom: key } });
      if (!useAvatar) use(cover, a.id);
    };
    try {
      if (a.coverChosenFrom === key && (a.coverUseAvatar || (a.coverYoutubeId && !usedByOthers(a.coverYoutubeId)))) {
        if (!a.coverUseAvatar) use(a.coverYoutubeId, a.id);
        stats.skipped++;
        continue;
      }
      // Only shared concerts: a shared bill's thumbnail may well show the other band (Marco Carola's shows Richie
      // Hawtin), so the artist's own channel photo wins whenever there is one. Otherwise a shared
      // thumbnail no one else uses, and only as a last resort one that is already in use.
      if (!solo.length && a.imageUrl) {
        await save(null, true);
        stats.avatar.push(a.name);
        continue;
      }
      if (!candidates.length) {
        if (a.imageUrl) {
          await save(null, true);
          stats.avatar.push(a.name);
        } else {
          await save(shared[0] ?? null, false);
          stats.noPerson.push(`${a.name} (only a shared thumbnail)`);
        }
        continue;
      }
      // One thumbnail and no channel photo: nothing to choose.
      if (candidates.length === 1 && !a.imageUrl) {
        await save(candidates[0], false);
        stats.skipped++;
        continue;
      }
      if (asked >= limit) continue;
      asked++;
      const best = await choose(candidates.map(judgeUrl), a.name);
      const useAvatar = best === 0 && Boolean(a.imageUrl);
      await save(best > 0 ? candidates[best - 1] : candidates[0], useAvatar);
      (best > 0 ? stats.chosen : useAvatar ? stats.avatar : stats.noPerson).push(a.name);
    } catch (error) {
      stats.errors.push(`${a.name}: ${(error as Error).message}`);
    }
  }
  return stats;
}
